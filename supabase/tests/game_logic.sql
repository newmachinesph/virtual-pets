-- Self-check for the authoritative game logic. Run against a freshly reset db:
--   npm run db:reset
--   docker exec -i supabase_db_orchestration psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < supabase/tests/game_logic.sql
-- Any failed assertion aborts with an exception.

begin;

-- A user + pet. The auth trigger creates the profile, the pet trigger the state.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'test@example.com', crypt('password', gen_salt('bf')),
        now(), '{}', '{"display_name":"Tester"}', now(), now());

insert into public.pets (id, owner_id, species, breed, name)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
        'dog', 'Border Collie', 'Charlie');

do $$ begin
  assert (select count(*) = 1 from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
    'signup trigger did not create a profile';
  assert (select count(*) = 1 from public.pet_state where pet_id = '22222222-2222-2222-2222-222222222222'),
    'pet trigger did not create pet_state';
end $$;

-- ---- decay: 10h back, Border Collie exercise multiplier 1.6 (spec §3.1, §8)
update public.pet_state set stats_updated_at = now() - interval '10 hours'
 where pet_id = '22222222-2222-2222-2222-222222222222';

-- reads are scoped to the owner, so act as them
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare c record;
begin
  select * into c from public.pet_current_state('22222222-2222-2222-2222-222222222222');
  -- hunger 80 - 4.0*1.0*10 = 40
  assert abs(c.hunger - 40) < 0.01, format('hunger decayed to %s, expected 40', c.hunger);
  -- exercise 60 - 3.0*1.6*10 = 12  (breed override applied)
  assert abs(c.exercise - 12) < 0.01, format('exercise decayed to %s, expected 12 (1.6x breed)', c.exercise);
  -- clamped at zero, never negative
  assert c.mental_stimulation >= 0, 'stats must clamp at 0';
  -- health drifts toward the average of the others, so neglect pulls it down from 90
  assert c.health < 90, format('health should drift down under neglect, got %s', c.health);
  -- pure read: the stored row is untouched until something settles it
  assert (select hunger from public.pet_state where pet_id = '22222222-2222-2222-2222-222222222222') = 80,
    'pet_current_state must not write';
end $$;

-- ---- perform_action as the owner
set local role authenticated;

do $$
declare r jsonb; hunger numeric;
begin
  r := public.perform_action('22222222-2222-2222-2222-222222222222', 'feed');
  hunger := (r -> 'state' ->> 'hunger')::numeric;
  -- settled to 40, then +40 from feeding
  assert abs(hunger - 80) < 0.01, format('after feed hunger = %s, expected 80', hunger);
  assert (r ->> 'coins_earned')::int = 1, 'feed should pay 1 coin';
  assert r -> 'unlocked' ? 'first_meal', 'first_meal achievement should unlock on first feed';
  -- achievement coins (10) + action coin (1)
  assert (r ->> 'coins')::int = 11, format('coin balance %s, expected 11', (r ->> 'coins')::int);
end $$;

-- ---- cooldown blocks spamming the same action
do $$
begin
  perform public.perform_action('22222222-2222-2222-2222-222222222222', 'feed');
  raise exception 'cooldown was not enforced';
exception when sqlstate '55006' then null;
end $$;

-- ---- unknown action is rejected
do $$
begin
  perform public.perform_action('22222222-2222-2222-2222-222222222222', 'launch_rocket');
  raise exception 'unknown action was accepted';
exception when sqlstate '22023' then null;
end $$;

-- ---- another user cannot touch this pet (RLS + ownership check, spec §3.2)
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
do $$
begin
  perform public.perform_action('22222222-2222-2222-2222-222222222222', 'play');
  raise exception 'a non-owner performed an action';
exception when sqlstate '42501' then null;
end $$;

do $$ begin
  assert (select count(*) = 0 from public.pets), 'RLS should hide another user''s pets';
end $$;

-- ---- daily reward: first claim starts the streak, second claim same day fails
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
do $$
declare r jsonb;
begin
  r := public.claim_daily_reward();
  assert (r ->> 'streak')::int = 1, 'first claim should start a 1-day streak';
  assert (r ->> 'reward')::int = 12, format('reward %s, expected 12', (r ->> 'reward')::int);
  begin
    perform public.claim_daily_reward();
    raise exception 'double claim was allowed';
  exception when sqlstate '55006' then null;
  end;
end $$;

-- ---- shop: cannot buy beyond balance, can buy within it, equip requires ownership
do $$
declare bal int;
begin
  begin
    perform public.buy_accessory('bed_luxury');  -- 300 coins
    raise exception 'bought an accessory without the coins';
  exception when sqlstate '55006' then null;
  end;

  -- top up out-of-band (the client cannot; see the guard assertion below)
  perform set_config('role', 'postgres', true);
  update public.profiles set coins = 500 where id = '11111111-1111-1111-1111-111111111111';
  perform set_config('role', 'authenticated', true);

  select (public.buy_accessory('collar_red') ->> 'coins')::int into bal;
  assert bal = 470, format('balance after 30-coin purchase = %s, expected 470', bal);

  perform public.equip_accessory('22222222-2222-2222-2222-222222222222', 'collar', 'collar_red');
  assert (select count(*) = 1 from public.pet_equipped
          where pet_id = '22222222-2222-2222-2222-222222222222' and accessory_id = 'collar_red'),
    'equip did not stick';

  begin
    perform public.equip_accessory('22222222-2222-2222-2222-222222222222', 'hat', 'hat_party');
    raise exception 'equipped an unowned accessory';
  exception when sqlstate '42501' then null;
  end;

  -- an owned accessory still cannot go in the wrong slot
  begin
    perform public.equip_accessory('22222222-2222-2222-2222-222222222222', 'hat', 'collar_red');
    raise exception 'equipped a collar in the hat slot';
  exception when sqlstate '22023' then null;
  end;

  -- species gate holds at the RPC, not just in the shop UI (dog owns bow_pink)
  perform public.buy_accessory('bow_pink');
  begin
    perform public.equip_accessory('22222222-2222-2222-2222-222222222222', 'hat', 'bow_pink');
    raise exception 'a dog equipped a cat-only accessory';
  exception when sqlstate '22023' then null;
  end;
end $$;

-- ---- pets: cosmetic columns writable, decay-relevant columns are not
do $$
begin
  update public.pets set name = 'Rex' where id = '22222222-2222-2222-2222-222222222222';
  assert (select name from public.pets where id = '22222222-2222-2222-2222-222222222222') = 'Rex',
    'owner should be able to rename their pet';

  begin
    update public.pets set breed = 'Bulldog' where id = '22222222-2222-2222-2222-222222222222';
    raise exception 'client swapped its pet''s breed';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---- direct inserts still hit the DB constraints (bypassing server actions)
do $$
begin
  begin
    insert into public.pets (owner_id, species, breed, name, color)
    values ('11111111-1111-1111-1111-111111111111', 'cat', 'Persian', 'Hax', 'red');
    raise exception 'accepted a non-hex color';
  exception when check_violation then null;
  end;

  begin
    insert into public.pets (owner_id, species, breed, name, personality)
    values ('11111111-1111-1111-1111-111111111111', 'cat', 'Persian', 'Hax',
            array['a','b','c','d']);
    raise exception 'accepted more than three personality traits';
  exception when check_violation then null;
  end;
end $$;

-- ---- client cannot mint coins directly (guard trigger, spec §3.2)
do $$
declare bal int;
begin
  update public.profiles set coins = 999999, display_name = 'Renamed'
   where id = '11111111-1111-1111-1111-111111111111';
  select coins into bal from public.profiles where id = '11111111-1111-1111-1111-111111111111';
  -- 500 - 30 (collar_red) - 45 (bow_pink, species test) = 425
  assert bal = 425, format('client rewrote its coin balance to %s', bal);
  assert (select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111') = 'Renamed',
    'preference columns should still be writable';
end $$;

-- ---- notify_candidates picks up starved stats, respects the per-type cooldown
-- notify-check runs with the service role, which may read across users
reset role;
set local request.jwt.claims = '{"role":"service_role"}';
update public.pet_state set stats_updated_at = now() - interval '30 hours'
 where pet_id = '22222222-2222-2222-2222-222222222222';
-- disable quiet hours so this assertion does not depend on the wall clock
update public.profiles set quiet_start = 0, quiet_end = 0
 where id = '11111111-1111-1111-1111-111111111111';

do $$
declare n record;
begin
  select * into n from public.notify_candidates(6);
  assert n.pet_id = '22222222-2222-2222-2222-222222222222', 'starved pet should be a notify candidate';
  assert 'hunger' = any(n.types), format('expected hunger in %s', n.types);

  insert into public.notifications_log (user_id, pet_id, type, message, channel)
  values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
          'hunger', 'test', 'push');

  select * into n from public.notify_candidates(6);
  assert not ('hunger' = any(n.types)), 'hunger should be suppressed by the cooldown';
end $$;

-- ---- notifications: the owner may mark read, but not rewrite history
do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

  update public.notifications_log set read_at = now()
   where user_id = '11111111-1111-1111-1111-111111111111';
  assert (select count(*) > 0 from public.notifications_log
          where user_id = '11111111-1111-1111-1111-111111111111' and read_at is not null),
    'owner should be able to mark notifications read';

  begin
    update public.notifications_log set message = 'rewritten'
     where user_id = '11111111-1111-1111-1111-111111111111';
    raise exception 'client rewrote a notification message';
  exception when insufficient_privilege then null;
  end;

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end $$;

-- ---- quiet hours suppress everything
do $$
declare v_hour int; n record;
begin
  v_hour := extract(hour from now() at time zone 'UTC')::int;
  update public.profiles set quiet_start = v_hour, quiet_end = (v_hour + 1) % 24
   where id = '11111111-1111-1111-1111-111111111111';
  select count(*) into strict v_hour from public.notify_candidates(6);
  assert v_hour = 0, 'quiet hours should suppress all candidates';
end $$;

rollback;

\echo '--- game_logic.sql: all assertions passed ---'
