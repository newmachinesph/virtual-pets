# EatWagLove Virtual Pet — V1 Technical Specification

**Product:** Browser-based Tamagotchi-style virtual pet for EatWagLove.com
**Audience:** Pet lovers of all ages (not a children's game)
**Goal:** Daily-return engagement + genuine pet-care education
**Status:** Phase 1 (foundation for a larger platform)

---

## 1. Product summary

Users create a virtual dog or cat, care for it over real time, and learn real
breed-specific pet care while doing so. Stats decay continuously. Care actions
raise them. Smart, pet-voiced notifications pull users back daily. A coin /
streak / achievement loop rewards consistency. Educational content from
EatWagLove.com is surfaced contextually.

**The product is the retention loop, not the pet.** The pet is the skin over a
notification + streak engine. Build that engine well and the rest is UI.

---

## 2. Tech stack (decided)

| Layer | Choice | Rationale |
|---|---|---|
| Frontend + API | Next.js 16 (App Router, React 19) | Their stated preference; SSR; API routes; hosts the PWA service worker; single deploy |
| Styling | Tailwind v4 | Mobile-first, responsive, fast iteration |
| Pet rendering | **PixiJS v8** (WebGL/WebGPU 2D) | Animated sprite pet, particle effects, layered accessories; same engine reused for Phase 2 mini-games (avoids a centerpiece rewrite) |
| Backend / DB / Auth | **Supabase** (Postgres, Auth, RLS, Edge Functions, pg_cron) | Relational data fits stats/coins/achievements/leaderboards; RLS = per-user ownership; pg_cron + Edge Functions provide the notification engine natively |
| Browser push | Web Push API (VAPID + service worker) | Native, no vendor lock, PWA-ready |
| Email (optional) | Resend | Simple transactional email |
| Hosting | Vercel (Next.js) + Supabase Cloud | Zero-ops |

**Rejected:** Firebase — Firestore document model fights the relational needs
(joins for leaderboards, per-stat decay config, achievement queries); its one
advantage (realtime) is barely used here.

**Rejected:** WordPress/WooCommerce integration — decided out of scope
(2026-07-22). The app is fully standalone. Educational links (§9) are plain
outbound URLs to EatWagLove.com content; nothing couples to WordPress and no
commerce integration is planned.

---

## 3. Core architectural decisions

### 3.1 Lazy stat decay (critical)
Do **not** run a cron that decrements every pet's stats on a fixed tick — it
does not scale and wastes compute on inactive pets.

Instead, each stat stores a **value** and the state stores a single
`stats_updated_at` timestamp. Current value is computed on read:

```
elapsed_hours = now - stats_updated_at
current = clamp(stored_value - decay_rate_per_hour * elapsed_hours, 0, 100)
```

On any write (a care action): **settle first** (apply decay up to now), then
apply the action delta, then set `stats_updated_at = now`.

### 3.2 Server is authoritative
All stat mutations go through a Postgres function / API route
(`perform_action(pet_id, action)`), never direct client writes. Client-computed
values are **display only**. This prevents cheating and keeps decay logic in one
place. RLS guarantees the caller owns the pet.

### 3.3 Cron scans for notifications only
`pg_cron` runs every ~15 min → calls an Edge Function (`notify-check`) that:
computes current stats, finds threshold crossings, respects quiet hours + user
prefs + rate limits, sends push/email, logs to `notifications_log`.

### 3.4 Pet rendering — PixiJS v8
The pet is a PixiJS v8 canvas mounted in a client component (`'use client'`,
dynamic import, no SSR — WebGL is browser-only). Verify v8 API via Context7
before coding (v8 differs substantially from v7: `await app.init()`, new
container/asset APIs).

- **Sprite states** driven by current stats: idle / eat / play / walk / groom /
  sleep, plus a "sad/droopy" variant when stats are low. Stats → animation state
  is a pure mapping in the React layer; Pixi just plays the selected clip.
- **Accessories** = sprite layers composited over the body by `slot`
  (`pet_equipped`), z-ordered. Species-gated assets.
- **Particle effects** on care actions (hearts on play, sparkles on groom, zzz on
  sleep) — Pixi particle container, short-lived.
- **Perf/a11y:** cap DPR, pause the ticker when tab hidden
  (`visibilitychange`) and when `prefers-reduced-motion` (fall back to a static
  posed sprite). Destroy the app on unmount to free GPU memory.
- **Assets:** spritesheets (texture atlas) loaded via `Assets.load`; keep atlases
  small, power-of-two, WebP/AVIF where supported.
- **Engine boundary:** wrap Pixi in a single `PetStage` component with a thin
  imperative API (`setState`, `equip`, `playEffect`). Phase 2 mini-games reuse the
  same Pixi app bootstrap — this is why Pixi over CSS/Rive.

---

## 4. Data model

RLS enabled on **every** table. `service_role` key server-only. All user-owned
rows keyed to `auth.uid()`.

### profiles
| col | type | notes |
|---|---|---|
| id | uuid PK → auth.users | |
| display_name | text | |
| coins | int default 0 | |
| streak_count | int default 0 | consecutive daily logins |
| last_reward_claim | date | daily reward gate |
| last_active_at | timestamptz | for "left unattended" |
| push_subscription | jsonb | Web Push subscription object |
| notif_push_enabled | bool default true | |
| notif_email_enabled | bool default false | |
| quiet_hours | int4range | e.g. `[22,8)` local hours suppressed |
| created_at | timestamptz | |

### pets
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| owner_id | uuid → profiles | RLS: owner only |
| species | text | `dog` \| `cat` |
| breed | text → breeds.name | |
| name | text | |
| color | text | |
| appearance | jsonb | body/eyes/pattern selections |
| personality | text[] | optional traits |
| created_at | timestamptz | |

### pet_state  (1:1 with pets)
| col | type | notes |
|---|---|---|
| pet_id | uuid PK → pets | |
| hunger | numeric | 0–100 (100 = full) |
| happiness | numeric | 0–100 |
| health | numeric | 0–100 |
| energy | numeric | 0–100 |
| cleanliness | numeric | 0–100 |
| exercise | numeric | 0–100 |
| mental_stimulation | numeric | 0–100 |
| stats_updated_at | timestamptz | decay anchor (§3.1) |

Stats stored as "current at `stats_updated_at`". Read-time function
`pet_current_state(pet_id)` returns settled values.

### breeds  (seed data, static reference)
| col | type | notes |
|---|---|---|
| species | text | |
| name | text | |
| decay_overrides | jsonb | per-stat rate multipliers vs base |
| care_notes | text | shown in UI (education) |

Base decay rates live in config; breed overrides multiply them. Examples:
- **Border Collie:** `exercise ×1.6`, `mental_stimulation ×1.6`
- **Bulldog:** `energy ×1.5` (tires easily)
- **Persian (cat):** `cleanliness ×1.7` (needs grooming)

### achievements / user_achievements
`achievements(id, key, name, description, coin_reward, icon)` — seed data.
`user_achievements(user_id, achievement_id, unlocked_at)` — PK (user, achievement).

### accessories / user_accessories
`accessories(id, name, slot, species, price_coins, asset)`.
`user_accessories(user_id, accessory_id, acquired_at)` = owned.
`pet_equipped(pet_id, slot, accessory_id)` = currently worn.

### notifications_log
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid | |
| pet_id | uuid | |
| type | text | `hungry`,`thirsty`,`bored`,`needs_exercise`,`needs_grooming`,`tired`,`low_happiness`,`unattended` |
| message | text | pet-voiced copy |
| channel | text | `push` \| `in_app` \| `email` |
| read_at | timestamptz null | for in-app feed |
| created_at | timestamptz | rate-limit source of truth |

---

## 5. Stats & actions

Seven stats, all 0–100, higher = better. `water` folds into hunger's sibling
(hydration) — modeled as its own bump on `health`/`energy` to keep V1 to seven
tracked stats; add a `hydration` stat only if product insists.

### Care actions → stat deltas (starting values, tune later)
| Action | Primary effect | Side effects | Cost |
|---|---|---|---|
| Feed | hunger +40 | happiness +5 | — |
| Give water | health +10, energy +5 | — | — |
| Play | happiness +30 | energy −15, exercise +10, hunger −5 | — |
| Walk | exercise +35 | happiness +15, energy −20, hunger −10, cleanliness −10 | — |
| Groom | cleanliness +50 | happiness +10 | — |
| Train | mental_stimulation +40 | happiness +10, energy −15 | small coin reward |
| Sleep | energy +60 | (time-gated; can't spam) | — |

**Health** is derived pressure: sustained low hunger/cleanliness/exercise slowly
drags health down; keeping others high lets it recover. Computed in the settle
function, not directly actionable except via water/vet (vet = future).

Each action also trickles a few coins and can trigger achievements.

### Decay (base rates, per hour — tune in playtest)
Hunger and energy decay fastest; health slowest. Breed multipliers apply.
Rates are config constants (`STAT_DECAY` map), not scattered literals.

---

## 6. Notification engine (flagship feature)

### Channels
Browser push (Web Push + VAPID), in-app feed (`notifications_log`), optional
email (Resend). PWA push is the same Web Push path — already covered.

### Voice
Every message speaks **as the pet**:
> "Charlie is getting hungry. Can we have dinner soon?"

Templated per `type` with the pet's name; a few variants each to avoid staleness.

### Trigger rules (`notify-check` Edge Function, every ~15 min via pg_cron)
For each pet with an active push subscription:
1. Compute current stats (settle).
2. For each stat below its **notify threshold** (e.g. <25):
   - Skip if a notification of that `type` was sent in the last **N hours**
     (rate limit, per-type cooldown).
   - Skip if inside the user's `quiet_hours`.
   - Skip if user disabled that category.
3. `unattended`: if `last_active_at` older than ~24h, send a gentle "missing you"
   nudge (max once/day).
4. Send via enabled channels, insert `notifications_log` rows.

### Anti-spam
- Per-type cooldown + global daily cap per user.
- Quiet hours respected.
- Preferences screen: master toggle, per-category toggles, quiet-hours picker,
  email opt-in.
- Batch related low stats into one message where possible ("Charlie needs a walk
  and a snack").

### Web Push setup
VAPID keypair in env (private key server-only). Service worker
(`/sw.js`) handles `push` + `notificationclick` (deep-link into the pet). Client
subscribes after explicit user opt-in; subscription stored in
`profiles.push_subscription`.

---

## 7. Gamification loop

- **Daily reward:** once per calendar day, claim coins; increments `streak_count`
  (resets if a day is missed).
- **Streaks:** milestone streaks (3/7/30 days) unlock achievements + coin bonuses.
- **Coins:** earned from daily reward, care actions, achievements. Spent on
  accessories.
- **Achievements:** first pet, first walk, 7-day streak, well-groomed week, breed
  care milestones, etc. Server-evaluated on relevant actions.
- **Accessories:** cosmetic items (collars, hats, beds) bought with coins,
  equipped on the pet. Species-gated.

All coin/streak/achievement mutations are server-side (authoritative).

---

## 8. Breed behavior (education through mechanics)

Breed `decay_overrides` make different breeds *feel* different, teaching real
traits by consequence:
- Border Collie drains exercise/mental fast → user learns high-energy working
  breed needs stimulation.
- Bulldog tires quickly → learns brachycephalic low stamina.
- Persian needs frequent grooming → learns long-coat maintenance.

Each breed carries `care_notes` shown on the dashboard, linking to the matching
EatWagLove breed guide.

---

## 9. Educational integration

Contextual, non-intrusive links to EatWagLove.com content, surfaced by situation:

| Trigger | Content link |
|---|---|
| Low cleanliness / grooming a Persian | Grooming guide |
| Feeding / low hunger | Feeding advice |
| Viewing breed | Breed information article |
| Training action | Training article |
| Low mental_stimulation | Mental enrichment ideas |
| Contextual | Relevant YouTube video |

V1: a static `content_map` (situation → URL) config, editable without a deploy
(store in a `content_links` table so marketing can update). Links open the main
site — the app naturally funnels users back to EatWagLove.

---

## 10. Non-functional requirements

- **Responsive, mobile-first** — primary usage is phones.
- **Accessibility** — semantic HTML, keyboard nav, reduced-motion support, color
  contrast (WCAG 2.2 AA).
- **Performance** — Core Web Vitals green; lazy-load heavy assets; compositor-only
  animations for the pet.
- **Security**
  - RLS on every table; `service_role` and VAPID private key server-only.
  - All stat/coin writes server-authoritative + validated.
  - Rate-limit actions and notifications server-side.
  - Validate all boundary input.
- **Reliability** — cron idempotent; notification sends logged; failed pushes
  prune dead subscriptions.
- **Documentation** — README, schema doc, env template.

---

## 11. V1 scope boundary

**In:** account creation, one pet per user, creation flow (species/breed/name/
appearance/color/personality), dashboard with live stats, seven care actions,
notification engine (push + in-app + optional email), daily reward/streak/coins/
achievements/accessories, breed behavior, contextual education links, PWA-ready
(manifest + service worker for push).

**Out (Phase 2+):** see §12.

---

## 12. Future roadmap (design so it fits, don't build yet)

Multiple pets, puppy/kitten growth stages, vet visits, mini-games, seasonal
events, community features, rescue pets, competitions, leaderboards, AI-powered
personalities, native mobile.

Schema already accommodates: multi-pet (pets keyed to owner, not 1:1), growth
(add `age`/`stage` to pets), leaderboards (SQL over profiles/achievements).

---

## 13. Build order (suggested)

1. **Auth + profile** (Supabase Auth, profiles table, RLS).
2. **Pet creation flow** + breeds seed.
3. **Stat model + settle function + dashboard** (lazy decay, display).
4. **Care actions** (`perform_action` RPC, authoritative writes).
5. **Notification engine** (VAPID, service worker, `notify-check`, pg_cron).
6. **Gamification** (daily reward, streaks, coins, achievements, accessories).
7. **Breed behavior tuning** + **education links**.
8. **PWA polish**, a11y pass, performance pass, docs.

Ship 1–4 as a playable core early; 5 is the retention unlock; 6–8 harden it.
