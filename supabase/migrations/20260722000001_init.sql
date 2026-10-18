-- EatWagLove Virtual Pet — schema, RLS, auth trigger.
-- Spec: docs/SPEC.md §4. Every user-owned table is RLS'd to auth.uid().

-- ---------------------------------------------------------------- reference

-- Base decay rates + notify thresholds. Seeded, not user-writable.
-- Single source of truth for both the settle function and notify-check.
create table public.stat_config (
  stat             text primary key,
  decay_per_hour   numeric not null,
  notify_threshold numeric not null,
  label            text    not null
);

create table public.breeds (
  species         text not null check (species in ('dog','cat')),
  name            text not null,
  decay_overrides jsonb not null default '{}'::jsonb, -- per-stat multiplier vs base
  care_notes      text not null default '',
  primary key (species, name)
);

create table public.actions (
  key              text primary key,
  label            text not null,
  deltas           jsonb not null,           -- {"hunger": 40, "happiness": 5}
  coin_reward      int  not null default 1,
  cooldown_seconds int  not null default 0,
  effect           text not null default 'sparkle' -- particle effect key for PetStage
);

create table public.achievements (
  key         text primary key,
  name        text not null,
  description text not null,
  coin_reward int  not null default 0,
  icon        text not null default 'trophy',
  rule        jsonb not null -- see evaluate_achievements()
);

create table public.accessories (
  id          text primary key,
  name        text not null,
  slot        text not null,  -- collar | hat | bed
  species     text,           -- null = both
  price_coins int  not null,
  asset       text not null   -- PetStage layer key
);

-- Situation -> EatWagLove.com article. Editable without a deploy (spec §9).
create table public.content_links (
  situation text primary key,
  title     text not null,
  url       text not null
);

-- ------------------------------------------------------------- user-owned

create table public.profiles (
  id                  uuid primary key references auth.users on delete cascade,
  display_name        text,
  coins               int  not null default 0,
  streak_count        int  not null default 0,
  last_reward_claim   date,
  last_active_at      timestamptz not null default now(),
  push_subscription   jsonb,
  notif_push_enabled  bool not null default true,
  notif_email_enabled bool not null default false,
  -- Local hours to suppress notifications, wrapping past midnight (22 -> 8).
  -- Equal values mean "no quiet hours". A range type cannot express the wrap.
  quiet_start         int  not null default 22 check (quiet_start between 0 and 23),
  quiet_end           int  not null default 8  check (quiet_end   between 0 and 23),
  timezone            text not null default 'UTC',
  created_at          timestamptz not null default now()
);

create table public.pets (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles on delete cascade,
  species     text not null check (species in ('dog','cat')),
  breed       text not null,
  name        text not null check (length(trim(name)) between 1 and 24),
  -- Server actions validate too, but a direct PostgREST insert bypasses them;
  -- the DB is the trust boundary (spec §10). Bad color = NaN tint in PetStage.
  color       text not null default '#c9863f' check (color ~ '^#[0-9a-fA-F]{6}$'),
  appearance  jsonb not null default '{}'::jsonb check (jsonb_typeof(appearance) = 'object'),
  personality text[] not null default '{}' check (coalesce(array_length(personality, 1), 0) <= 3),
  created_at  timestamptz not null default now(),
  foreign key (species, breed) references public.breeds (species, name)
);

-- V1 scope: one pet per user. Drop this index to enable multi-pet (spec §12).
create unique index pets_one_per_owner_v1 on public.pets (owner_id);

create table public.pet_state (
  pet_id             uuid primary key references public.pets on delete cascade,
  hunger             numeric not null default 80 check (hunger between 0 and 100),
  happiness          numeric not null default 80 check (happiness between 0 and 100),
  health             numeric not null default 90 check (health between 0 and 100),
  energy             numeric not null default 80 check (energy between 0 and 100),
  cleanliness        numeric not null default 80 check (cleanliness between 0 and 100),
  exercise           numeric not null default 60 check (exercise between 0 and 100),
  mental_stimulation numeric not null default 60 check (mental_stimulation between 0 and 100),
  stats_updated_at   timestamptz not null default now() -- decay anchor (spec §3.1)
);

create table public.pet_action_log (
  id         bigserial primary key,
  pet_id     uuid not null references public.pets on delete cascade,
  user_id    uuid not null references public.profiles on delete cascade,
  action     text not null references public.actions,
  created_at timestamptz not null default now()
);
create index pet_action_log_recent on public.pet_action_log (pet_id, action, created_at desc);

create table public.user_achievements (
  user_id        uuid not null references public.profiles on delete cascade,
  achievement_key text not null references public.achievements,
  unlocked_at    timestamptz not null default now(),
  primary key (user_id, achievement_key)
);

create table public.user_accessories (
  user_id      uuid not null references public.profiles on delete cascade,
  accessory_id text not null references public.accessories,
  acquired_at  timestamptz not null default now(),
  primary key (user_id, accessory_id)
);

create table public.pet_equipped (
  pet_id       uuid not null references public.pets on delete cascade,
  slot         text not null,
  accessory_id text not null references public.accessories,
  primary key (pet_id, slot)
);

create table public.notifications_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles on delete cascade,
  pet_id     uuid references public.pets on delete cascade,
  type       text not null,
  message    text not null,
  channel    text not null check (channel in ('push','in_app','email')),
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
-- Rate limiting reads (user, type, recency); in-app feed reads (user, recency).
create index notifications_log_ratelimit on public.notifications_log (user_id, type, created_at desc);

-- ---------------------------------------------------------------------- RLS

alter table public.stat_config      enable row level security;
alter table public.breeds           enable row level security;
alter table public.actions          enable row level security;
alter table public.achievements     enable row level security;
alter table public.accessories      enable row level security;
alter table public.content_links    enable row level security;
alter table public.profiles         enable row level security;
alter table public.pets             enable row level security;
alter table public.pet_state        enable row level security;
alter table public.pet_action_log   enable row level security;
alter table public.user_achievements enable row level security;
alter table public.user_accessories enable row level security;
alter table public.pet_equipped     enable row level security;
alter table public.notifications_log enable row level security;

-- Reference data: readable by everyone, writable by nobody (service_role bypasses RLS).
create policy read_all on public.stat_config   for select using (true);
create policy read_all on public.breeds        for select using (true);
create policy read_all on public.actions       for select using (true);
create policy read_all on public.achievements  for select using (true);
create policy read_all on public.accessories   for select using (true);
create policy read_all on public.content_links for select using (true);

create policy own_profile on public.profiles
  for select using (id = (select auth.uid()));
-- Only whitelisted preference columns are meant to change from the client; coins
-- and streaks are written by SECURITY DEFINER functions only. Enforced by trigger.
create policy own_profile_update on public.profiles
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy own_pets on public.pets
  for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy own_pet_state on public.pet_state
  for select using (exists (
    select 1 from public.pets p where p.id = pet_id and p.owner_id = (select auth.uid())));

create policy own_action_log on public.pet_action_log
  for select using (user_id = (select auth.uid()));

create policy own_achievements on public.user_achievements
  for select using (user_id = (select auth.uid()));

create policy own_accessories on public.user_accessories
  for select using (user_id = (select auth.uid()));

create policy own_equipped on public.pet_equipped
  for select using (exists (
    select 1 from public.pets p where p.id = pet_id and p.owner_id = (select auth.uid())));

create policy own_notifications on public.notifications_log
  for select using (user_id = (select auth.uid()));
create policy own_notifications_read on public.notifications_log
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Client UPDATEs on profiles may only touch preference columns. Everything
-- economic (coins, streak, reward claim) is server-authoritative (spec §3.2).
-- current_user is the caller's role for a direct client UPDATE, but the function
-- owner inside a SECURITY DEFINER routine — which is exactly the line we want.
-- SECURITY INVOKER on purpose: a DEFINER trigger would see its own owner here.
create function public.profiles_guard_economy()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.coins             := old.coins;
    new.streak_count      := old.streak_count;
    new.last_reward_claim := old.last_reward_claim;
  end if;
  return new;
end $$;

create trigger profiles_guard_economy before update on public.profiles
  for each row execute function public.profiles_guard_economy();

-- ------------------------------------------------------------ auth trigger

create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- New pet gets its state row.
create function public.handle_new_pet()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.pet_state (pet_id) values (new.id);
  return new;
end $$;

create trigger on_pet_created after insert on public.pets
  for each row execute function public.handle_new_pet();

-- New tables are no longer auto-exposed to the Data API roles, so every
-- privilege is explicit. service_role is the trusted server identity (the
-- notify-check job); it still needs table grants even though it bypasses RLS.
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

grant select on public.stat_config, public.breeds, public.actions,
  public.achievements, public.accessories, public.content_links to anon, authenticated;
-- Pets: cosmetic columns only are client-updatable. Species/breed swaps would
-- change decay multipliers post-creation (pick a hard breed, switch to an easy
-- one) — that door stays shut at the privilege level.
grant select, insert, delete on public.pets to authenticated;
grant update (name, color, appearance, personality) on public.pets to authenticated;
grant select on public.profiles, public.pet_state, public.pet_action_log,
  public.user_achievements, public.user_accessories, public.pet_equipped,
  public.notifications_log to authenticated;
grant update on public.profiles to authenticated;
-- The feed marks messages read; nothing else on a log row is client-writable.
grant update (read_at) on public.notifications_log to authenticated;
