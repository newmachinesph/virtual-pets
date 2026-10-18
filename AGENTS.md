# Project

EatWagLove Virtual Pet — Next.js 16 + Supabase. Spec: `docs/SPEC.md`. Schema map:
`docs/SCHEMA.md`.

Loadout: **web** (Next.js 16 / React 19 / Tailwind v4) + **api** (Supabase, RLS).

@~/.claude/rules/loadout/profiles/web.md
@~/.claude/rules/loadout/profiles/api.md

## House rules for this repo

- Stats, coins, streaks and achievements are server-authoritative. New game logic
  goes in a `SECURITY DEFINER` Postgres function, never in a client mutation.
- Game balance is data (`stat_config`, `actions`, `breeds.decay_overrides`).
  Rebalancing should not need a code change.
- PixiJS is confined to `components/PetStage.tsx`. Nothing else imports it.
- Local mail goes to Mailpit at http://127.0.0.1:54324; there is no real SMTP in dev.
- After touching `supabase/migrations/`, run `npm run db:reset` and the SQL
  self-check in `supabase/tests/game_logic.sql`.
- Sprite pipeline: runtime pets are hand-authored pixel maps in `lib/sprites.mjs`
  (palette-swapped live for coat/pattern/mood/accessories). The same frames are
  baked to `assets/sprites/` — `dog.ase`/`cat.ase` (3 frames: idle A, idle B,
  sleepy; 48x48, editable in LibreSprite) plus per-frame PNGs and 144x48
  horizontal sheets. LibreSprite + libresprite-mcp are installed (`.mcp.json`;
  bridge: LibreSprite -> Scripts -> mcp -> Connect, then the `libresprite` MCP
  tool). Gotchas learned: NewFile ignores width/height params (inherits dialog
  default), and `sprite.resize()` does NOT grow existing cel images — open a
  correctly-sized PNG instead, then add frames. If the .ase art is hand-polished
  later, re-export sheets and load them in `components/PetStage.tsx`.
