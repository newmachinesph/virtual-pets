# EatWagLove Virtual Pet

![License: MIT](https://img.shields.io/badge/license-MIT-green)
![Next.js 16](https://img.shields.io/badge/Next.js-16-black)
![React 19](https://img.shields.io/badge/React-19-61dafb)
![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth-3ecf8e)

Browser-based virtual pet. Stats decay in real time, care actions raise them, and
breed-specific decay rates teach real pet care by consequence. Built to the
specification in [docs/SPEC.md](docs/SPEC.md).

Stack: Next.js 16 (App Router) · React 19 · Tailwind v4 · PixiJS v8 · Supabase
(Postgres, Auth, RLS) · Web Push · Mailpit for local mail.

## Running it locally

Requires Node 20+ and Docker (for the Supabase stack).

```bash
npm install
npx supabase start        # Postgres, Auth, Studio, Mailpit
npm run db:reset          # applies migrations + seed data
cp .env.example .env.local
npm run dev
```

Fill in `.env.local` with the keys printed by `npx supabase start`, and run
`npm run vapid` to generate your own Web Push keypair.

| Service | URL |
|---|---|
| App | http://localhost:3000 |
| Supabase Studio | http://127.0.0.1:54323 |
| Mailpit (all outgoing mail) | http://127.0.0.1:54324 |

Sign up with any email — local Supabase does not require confirmation.

## Where things live

The UI is a fixed 420px "handheld" column with bottom tab navigation (Pet /
Journal / Shop / Settings); the game screen never scrolls. Pet and room are
procedural pixel art in PixiJS so coat colours, patterns, moods and accessories
all palette-swap. A licensed sprite pack (e.g. toffeecraft's pet pack —
commercial tier only; the free tier forbids commercial use) can replace the
procedural art behind the same `PetStage` API without touching anything else.

```
app/                 routes, server actions
  page.tsx           game screen (server) -> components/Dashboard.tsx (client)
  journal/           achievements, in-app feed, breed notes
  create/            pet creation flow
  login/             auth
  shop/              accessories
  settings/          notification preferences + sign out
  api/cron/          notify-check, the notification engine
  api/push/          push subscription storage
components/
  PetStage.tsx       the only file that touches PixiJS (sprites + room)
  TabBar.tsx         bottom mobile navigation
lib/
  stats.ts           client-side projection of the DB's decay (display only)
  messages.ts        pet-voiced notification copy
  mail.ts, push.ts   transports
supabase/
  migrations/        schema + game logic
  seed.sql           breeds, actions, achievements, accessories, content links
  tests/             SQL self-check for the game logic
proxy.ts             session refresh + route gating (Next 16's middleware)
```

## The two rules the code is built around

**Decay is lazy.** No cron decrements anyone's stats. Each pet stores its stats
plus a `stats_updated_at` anchor, and the current value is computed on read.
Writes settle first, then apply the action. See `pet_current_state()` and
`settle_pet()` in the functions migration.

**The server owns every number.** Stats, coins, streaks and achievements only
change inside `SECURITY DEFINER` functions (`perform_action`,
`claim_daily_reward`, `buy_accessory`). The client's copy is for display. A
trigger on `profiles` silently discards client writes to `coins`,
`streak_count` and `last_reward_claim`, and RLS scopes every table to
`auth.uid()`.

## Testing the game logic

```bash
npm run db:reset
docker exec -i supabase_db_orchestration psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 -f - < supabase/tests/game_logic.sql
```

Asserts decay maths, breed multipliers, cooldowns, ownership checks, the coin
guard, quiet hours and notification rate limiting. Any failure aborts.

With the dev server up, `npm run smoke` drives a real browser through sign-up,
pet creation, every care action, the daily reward, a shop purchase and the cron
endpoint, and fails on any console error the pages produced. `--headed` to
watch it; screenshots land in `tests/`.

## Triggering notifications by hand

The notification engine is an authenticated route rather than a cron job you
have to wait for:

```bash
curl -X POST http://localhost:3000/api/cron/notify-check \
  -H "authorization: Bearer local-dev-cron-secret"
```

To see it actually fire, age a pet's stats first:

```sql
update pet_state set stats_updated_at = now() - interval '30 hours';
```

Emails land in Mailpit, push needs a browser subscription from Settings.

## Deploying

Vercel + Supabase Cloud. Set every variable from `.env.example` in the Vercel
project, run `supabase db push` against the linked project, and confirm
`vercel.json` schedules `/api/cron/notify-check`. Hobby-plan cron only runs
daily — for the spec's ~15 minute cadence use Supabase `pg_cron` + `pg_net` to
POST the same endpoint, or a paid Vercel plan.

## Not in V1

Multiple pets, growth stages, vet visits, mini-games, leaderboards. The schema
already accommodates them — see docs/SPEC.md §12. WordPress/WooCommerce
integration is explicitly out of scope; the app is standalone.

## License

[MIT](LICENSE) (c) 2026 EatWagLove
