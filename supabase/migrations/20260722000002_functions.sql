-- Server-authoritative game logic (spec §3.1, §3.2, §5, §7).
-- Clients never write stats, coins, streaks or achievements directly.

-- One decayed stat, clamped. Base rate x breed multiplier x hours elapsed.
create function public.decay_stat(v numeric, rate numeric, mult numeric, hours numeric)
returns numeric language sql immutable set search_path = '' as $$
  select greatest(0, least(100, v - rate * mult * hours))
$$;

-- Health has no decay rate of its own: it drifts toward the average of the
-- other six stats. Neglect drags it down, good care lets it recover (spec §5).
create function public.drift_health(health numeric, target numeric, hours numeric)
returns numeric language sql immutable set search_path = '' as $$
  select greatest(0, least(100,
    health + sign(target - health) * least(abs(target - health), 2.0 * hours)))
$$;

-- Settled stats as of now(). Pure read — no write, no locking (spec §3.1).
-- ponytail: health drift uses post-decay averages rather than integrating the
-- decay curve. Monotone and close enough at 15-min granularity.
create function public.pet_current_state(p_pet_id uuid)
returns table (
  pet_id uuid, hunger numeric, happiness numeric, health numeric, energy numeric,
  cleanliness numeric, exercise numeric, mental_stimulation numeric,
  stats_updated_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  with rates as (select jsonb_object_agg(stat, decay_per_hour) r from public.stat_config),
  src as (
    select s.*, p.species, p.breed,
           extract(epoch from (now() - s.stats_updated_at)) / 3600.0 as hrs
    from public.pet_state s join public.pets p on p.id = s.pet_id
    where s.pet_id = p_pet_id
      and (p.owner_id = (select auth.uid()) or (select auth.role()) = 'service_role')
  ),
  mult as (
    select src.*, coalesce(b.decay_overrides, '{}'::jsonb) o
    from src left join public.breeds b on b.species = src.species and b.name = src.breed
  ),
  d as (
    select m.pet_id,
      public.decay_stat(m.hunger,      (r->>'hunger')::numeric,      coalesce((o->>'hunger')::numeric, 1),      hrs) hunger,
      public.decay_stat(m.happiness,   (r->>'happiness')::numeric,   coalesce((o->>'happiness')::numeric, 1),   hrs) happiness,
      public.decay_stat(m.energy,      (r->>'energy')::numeric,      coalesce((o->>'energy')::numeric, 1),      hrs) energy,
      public.decay_stat(m.cleanliness, (r->>'cleanliness')::numeric, coalesce((o->>'cleanliness')::numeric, 1), hrs) cleanliness,
      public.decay_stat(m.exercise,    (r->>'exercise')::numeric,    coalesce((o->>'exercise')::numeric, 1),    hrs) exercise,
      public.decay_stat(m.mental_stimulation, (r->>'mental_stimulation')::numeric,
                        coalesce((o->>'mental_stimulation')::numeric, 1), hrs) mental_stimulation,
      m.health, m.hrs
    from mult m, rates
  )
  select d.pet_id, d.hunger, d.happiness,
    public.drift_health(d.health,
      (d.hunger + d.happiness + d.energy + d.cleanliness + d.exercise + d.mental_stimulation) / 6.0,
      d.hrs) as health,
    d.energy, d.cleanliness, d.exercise, d.mental_stimulation, now() as stats_updated_at
  from d
$$;

-- Persist settled values and re-anchor the decay clock. Call before any write.
create function public.settle_pet(p_pet_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.pet_state s
  set hunger = c.hunger, happiness = c.happiness, health = c.health, energy = c.energy,
      cleanliness = c.cleanliness, exercise = c.exercise,
      mental_stimulation = c.mental_stimulation, stats_updated_at = now()
  from public.pet_current_state(p_pet_id) c
  where s.pet_id = c.pet_id
$$;

-- Unlock any achievement whose rule is now satisfied. Returns unlocked keys.
-- Rule shapes: {"type":"action_count","action":"walk","count":1}
--              {"type":"streak","count":7}
--              {"type":"all_stats_above","value":80}
create function public.evaluate_achievements(p_user_id uuid, p_pet_id uuid)
returns setof text language plpgsql security definer set search_path = '' as $$
declare a record; ok boolean; reward int; unlocked text[] := '{}';
begin
  for a in
    select * from public.achievements
    where key not in (select achievement_key from public.user_achievements where user_id = p_user_id)
  loop
    ok := case a.rule ->> 'type'
      when 'action_count' then (
        select count(*) >= (a.rule ->> 'count')::int from public.pet_action_log
        where user_id = p_user_id and action = a.rule ->> 'action')
      when 'streak' then (
        select streak_count >= (a.rule ->> 'count')::int from public.profiles where id = p_user_id)
      when 'all_stats_above' then (
        select least(hunger, happiness, health, energy, cleanliness, exercise, mental_stimulation)
               >= (a.rule ->> 'value')::numeric
        from public.pet_current_state(p_pet_id))
      else false end;

    if ok then
      insert into public.user_achievements (user_id, achievement_key) values (p_user_id, a.key)
        on conflict do nothing;
      update public.profiles set coins = coins + a.coin_reward where id = p_user_id;
      unlocked := unlocked || a.key;
    end if;
  end loop;

  return query select unnest(unlocked);
end $$;

-- The only path that mutates pet stats (spec §3.2).
create function public.perform_action(p_pet_id uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user     uuid := (select auth.uid());
  act        public.actions;
  d          jsonb;
  last       timestamptz;
  v_unlocked jsonb;
  v_coins    int;
begin
  if v_user is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.pets where id = p_pet_id and owner_id = v_user) then
    raise exception 'pet not found' using errcode = '42501';
  end if;

  select * into act from public.actions where key = p_action;
  if act is null then raise exception 'unknown action %', p_action using errcode = '22023'; end if;

  -- Serialize concurrent actions on this pet. Without the lock, two requests
  -- racing the same cooldown window both read "no recent action" and both
  -- land — double coins, double deltas. The second waits here, then sees the
  -- first's log row and hits the cooldown below.
  perform 1 from public.pet_state where pet_id = p_pet_id for update;

  -- Server-side rate limit: one action per cooldown window (spec §10).
  select max(created_at) into last from public.pet_action_log
   where pet_id = p_pet_id and action = p_action;
  if last is not null and now() - last < make_interval(secs => act.cooldown_seconds) then
    raise exception 'cooling down' using errcode = '55006',
      detail = extract(epoch from (last + make_interval(secs => act.cooldown_seconds) - now()))::int::text;
  end if;

  perform public.settle_pet(p_pet_id);

  d := act.deltas;
  update public.pet_state set
    hunger      = greatest(0, least(100, hunger      + coalesce((d->>'hunger')::numeric, 0))),
    happiness   = greatest(0, least(100, happiness   + coalesce((d->>'happiness')::numeric, 0))),
    health      = greatest(0, least(100, health      + coalesce((d->>'health')::numeric, 0))),
    energy      = greatest(0, least(100, energy      + coalesce((d->>'energy')::numeric, 0))),
    cleanliness = greatest(0, least(100, cleanliness + coalesce((d->>'cleanliness')::numeric, 0))),
    exercise    = greatest(0, least(100, exercise    + coalesce((d->>'exercise')::numeric, 0))),
    mental_stimulation = greatest(0, least(100,
      mental_stimulation + coalesce((d->>'mental_stimulation')::numeric, 0))),
    stats_updated_at = now()
  where pet_id = p_pet_id;

  insert into public.pet_action_log (pet_id, user_id, action) values (p_pet_id, v_user, p_action);
  update public.profiles set coins = coins + act.coin_reward, last_active_at = now() where id = v_user;

  -- Achievements pay out coins, so they must settle before the balance is read.
  -- Inside one jsonb_build_object() the argument order would not be guaranteed.
  v_unlocked := coalesce((select jsonb_agg(k) from public.evaluate_achievements(v_user, p_pet_id) k), '[]'::jsonb);
  select coins into v_coins from public.profiles where id = v_user;

  return jsonb_build_object(
    'state', (select to_jsonb(c) from public.pet_current_state(p_pet_id) c),
    'coins_earned', act.coin_reward,
    'effect', act.effect,
    'unlocked', v_unlocked,
    'coins', v_coins);
end $$;

-- Daily reward + streak (spec §7). Calendar day in the user's timezone.
create function public.claim_daily_reward()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  p public.profiles; today date; reward int; v_unlocked jsonb; v_coins int;
begin
  if v_user is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into p from public.profiles where id = v_user for update;
  today := (now() at time zone p.timezone)::date;

  if p.last_reward_claim = today then
    raise exception 'already claimed today' using errcode = '55006';
  end if;

  -- Consecutive day continues the streak; any gap restarts it.
  update public.profiles set
    streak_count = case when p.last_reward_claim = today - 1 then p.streak_count + 1 else 1 end,
    last_reward_claim = today,
    last_active_at = now()
  where id = v_user returning * into p;

  reward := 10 + least(p.streak_count, 30) * 2;
  update public.profiles set coins = coins + reward where id = v_user;

  -- streak achievements may pay out too, so read the balance last
  v_unlocked := coalesce((select jsonb_agg(k) from public.evaluate_achievements(
    v_user, (select id from public.pets where owner_id = v_user limit 1)) k), '[]'::jsonb);
  select coins into v_coins from public.profiles where id = v_user;

  return jsonb_build_object(
    'reward', reward, 'streak', p.streak_count, 'coins', v_coins, 'unlocked', v_unlocked);
end $$;

create function public.buy_accessory(p_accessory_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid()); a public.accessories; bal int;
begin
  if v_user is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into a from public.accessories where id = p_accessory_id;
  if a is null then raise exception 'unknown accessory' using errcode = '22023'; end if;

  -- Lock before the ownership check: two concurrent buys of the same item
  -- would otherwise both pass it and the second dies on the PK instead of
  -- getting the proper 'already owned'.
  select coins into bal from public.profiles where id = v_user for update;
  if exists (select 1 from public.user_accessories where user_id = v_user and accessory_id = a.id) then
    raise exception 'already owned' using errcode = '55006';
  end if;
  if bal < a.price_coins then raise exception 'not enough coins' using errcode = '55006'; end if;

  update public.profiles set coins = coins - a.price_coins where id = v_user;
  insert into public.user_accessories (user_id, accessory_id) values (v_user, a.id);
  return jsonb_build_object('coins', bal - a.price_coins, 'accessory_id', a.id);
end $$;

-- Equip an owned accessory, or clear the slot when p_accessory_id is null.
create function public.equip_accessory(p_pet_id uuid, p_slot text, p_accessory_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user    uuid := (select auth.uid());
  v_species text;
  acc       public.accessories;
begin
  select species into v_species from public.pets where id = p_pet_id and owner_id = v_user;
  if v_species is null then
    raise exception 'pet not found' using errcode = '42501';
  end if;

  if p_accessory_id is null then
    delete from public.pet_equipped where pet_id = p_pet_id and slot = p_slot;
    return;
  end if;

  if not exists (select 1 from public.user_accessories where user_id = v_user and accessory_id = p_accessory_id) then
    raise exception 'not owned' using errcode = '42501';
  end if;

  -- The shop UI filters both of these, but the RPC is the trust boundary:
  -- an accessory only goes in its own slot, and species gating holds (spec §7).
  select * into acc from public.accessories where id = p_accessory_id;
  if acc.slot <> p_slot then
    raise exception 'wrong slot' using errcode = '22023';
  end if;
  if acc.species is not null and acc.species <> v_species then
    raise exception 'not for this species' using errcode = '22023';
  end if;

  insert into public.pet_equipped (pet_id, slot, accessory_id) values (p_pet_id, p_slot, p_accessory_id)
    on conflict (pet_id, slot) do update set accessory_id = excluded.accessory_id;
end $$;

-- Is local hour h inside the user's quiet window? Handles the midnight wrap.
create function public.in_quiet_hours(h int, q_start int, q_end int)
returns boolean language sql immutable set search_path = '' as $$
  select case
    when q_start = q_end then false
    when q_start <  q_end then h >= q_start and h < q_end
    else h >= q_start or h < q_end
  end
$$;

-- Everything notify-check needs, in one query: pets whose stats crossed a
-- threshold, already filtered by prefs, quiet hours and per-type cooldown.
-- Service-role only (it reads across users).
create function public.notify_candidates(p_cooldown_hours int default 6)
returns table (
  user_id uuid, pet_id uuid, pet_name text, species text,
  push_subscription jsonb, email_enabled bool, types text[]
)
language sql security definer set search_path = '' as $$
  with due as (
    select p.owner_id, p.id, p.name, p.species, pr.push_subscription,
           pr.notif_email_enabled, pr.notif_push_enabled,
           pr.quiet_start, pr.quiet_end, pr.timezone,
           s.stat, s.notify_threshold,
           (to_jsonb(c) ->> s.stat)::numeric as value
    from public.pets p
    join public.profiles pr on pr.id = p.owner_id
    cross join lateral public.pet_current_state(p.id) c
    cross join public.stat_config s
    where pr.notif_push_enabled or pr.notif_email_enabled
  ),
  filtered as (
    select * from due
    where value < notify_threshold
      -- quiet hours in the user's local time
      and not public.in_quiet_hours(
            extract(hour from (now() at time zone timezone))::int, quiet_start, quiet_end)
      and not exists (
        select 1 from public.notifications_log n
        where n.user_id = due.owner_id and n.type = due.stat
          and n.created_at > now() - make_interval(hours => p_cooldown_hours))
  )
  select owner_id, id, name, species,
         case when bool_or(notif_push_enabled) then max(push_subscription::text)::jsonb end,
         bool_or(notif_email_enabled),
         array_agg(stat order by value)
  from filtered
  group by owner_id, id, name, species
$$;

revoke execute on function public.notify_candidates(int) from anon, authenticated;

grant execute on function public.pet_current_state(uuid), public.perform_action(uuid, text),
  public.claim_daily_reward(), public.buy_accessory(text),
  public.equip_accessory(uuid, text, text) to authenticated;
