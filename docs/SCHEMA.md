# Database

Source of truth is `supabase/migrations/`. This is the map, not a duplicate.

RLS is enabled on every table. Reference tables are world-readable and
client-unwritable; user tables are scoped to `auth.uid()`. Client writes are
narrowed to the columns that are genuinely theirs: `pets` cosmetic columns
(name, color, appearance, personality — never species/breed, which drive
decay), preference columns on `profiles` (a trigger discards economy writes),
and `notifications_log.read_at`. Everything else moves only through the
`SECURITY DEFINER` functions, which also take row locks so concurrent requests
cannot double-spend a cooldown or a purchase.

## Tables

**Reference (seeded, read-only to clients)**

| Table | Holds | Notes |
|---|---|---|
| `stat_config` | base decay per hour, notify threshold, label | tune the game here |
| `breeds` | species, name, `decay_overrides`, `care_notes` | multipliers vs base rates |
| `actions` | deltas, coin reward, cooldown, particle effect | one row per care action |
| `achievements` | name, reward, `rule` jsonb | rule shapes below |
| `accessories` | slot, species gate, price, asset key | shop stock |
| `content_links` | situation -> EatWagLove article | editable without a deploy |

**User-owned**

| Table | Holds | Notes |
|---|---|---|
| `profiles` | coins, streak, push subscription, notification prefs, timezone | created by an `auth.users` trigger |
| `pets` | species, breed, name, colour, appearance, personality | unique index caps V1 at one pet per owner |
| `pet_state` | seven stats + `stats_updated_at` | created by a trigger on `pets` |
| `pet_action_log` | every action performed | drives cooldowns and achievement counts |
| `user_achievements`, `user_accessories` | unlocks and purchases | |
| `pet_equipped` | slot -> accessory | one accessory per slot |
| `notifications_log` | every message sent, per channel | in-app feed **and** the rate-limit source of truth |

## Functions

| Function | Security | Purpose |
|---|---|---|
| `pet_current_state(pet_id)` | definer, owner-or-service | settled stats as of now, no write |
| `settle_pet(pet_id)` | definer | persist settled values, re-anchor the clock |
| `perform_action(pet_id, action)` | definer | the only path that mutates stats |
| `claim_daily_reward()` | definer | daily coins + streak |
| `buy_accessory(id)` / `equip_accessory(pet_id, slot, id)` | definer | shop |
| `evaluate_achievements(user, pet)` | definer | unlocks whatever now qualifies |
| `notify_candidates(cooldown_hours)` | definer, service-role only | everything notify-check needs, one query |
| `decay_stat`, `drift_health`, `in_quiet_hours` | immutable helpers | |

Client roles hold `EXECUTE` on the first six only.

## Decay

```
elapsed_hours = now() - stats_updated_at
value         = clamp(stored - base_rate * breed_multiplier * elapsed_hours, 0, 100)
```

`health` has no rate of its own. It drifts toward the average of the other six
at 2 points/hour, so neglect drags it down and consistent care brings it back.

Writes settle first, then apply deltas, then set `stats_updated_at = now()`.

## Achievement rules

```json
{"type": "action_count", "action": "walk", "count": 25}
{"type": "streak", "count": 7}
{"type": "all_stats_above", "value": 80}
```

Adding an achievement is a seed row. Adding a *kind* of achievement is one more
branch in `evaluate_achievements`.

## Changing the balance

Decay speed lives in `stat_config`, action effects in `actions`, breed
personality in `breeds.decay_overrides`. All three are data — a rebalance is an
UPDATE, not a deploy.
