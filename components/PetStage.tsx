'use client'

import { useEffect, useRef } from 'react'
import { breedLook } from '@/lib/breed-looks'
import { SPRITES } from '@/lib/sprites.mjs'
import type { Mood } from '@/lib/stats'

export type StageAccessory = { slot: string; asset: string }

type Props = {
  species: 'dog' | 'cat'
  /** drives ears, markings and tail shape; unknown breeds get the default look */
  breed?: string
  color: string
  pattern: string
  mood: Mood
  accessories?: StageAccessory[]
  /** Change this to fire a particle burst. Same key twice needs a new nonce. */
  effect?: { key: string; nonce: number }
  className?: string
}

/**
 * The only place PixiJS is touched (spec §3.4). Renders a cosy pixel room and
 * the pet as a chunky front-facing sprite: shapes are rasterised onto a coarse
 * cell grid, rim-shaded, outlined, then drawn as squares. Two frames give the
 * idle bob and tail wag; mood swaps face, ears and posture.
 *
 * ponytail: art is procedural so the coat colour picker, patterns, moods and
 * accessory layers all keep working. Licensed atlases (e.g. toffeecraft's pet
 * pack — commercial tier) can replace buildFrame/buildRoom with Assets.load +
 * AnimatedSprite behind this same component API; nothing outside changes.
 */

const GRID = 48 // cells per side — fine enough for a ~36px-tall sprite
const CELL = 6 // px per cell
const W = 320
const H = 300
const OX = (W - GRID * CELL) / 2
const OY = (H - GRID * CELL) / 2
const HORIZON = 28 // grid row where wall meets floor

/** Wall/floor hexes, exported so the UI can blend the letterbox into the room. */
export const ROOM_WALL = '#cae0e8'
export const ROOM_FLOOR = '#c9975c'
export const ROOM_HORIZON_PCT = Math.round(((OY + (HORIZON + 1) * CELL) / H) * 100)

type PGrid = (string | null)[][]

const newGrid = (): PGrid => Array.from({ length: GRID }, () => Array<string | null>(GRID).fill(null))

function put(g: PGrid, x: number, y: number, c: string) {
  if (x >= 0 && y >= 0 && x < GRID && y < GRID) g[y][x] = c
}

function rect(g: PGrid, x: number, y: number, w: number, h: number, c: string) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) put(g, i, j, c)
}

/** Float centres allowed — (15.5, …) keeps sprites symmetric on the even grid. */
function ellipse(g: PGrid, cx: number, cy: number, rx: number, ry: number, c: string) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx
      const dy = (y - cy) / ry
      if (dx * dx + dy * dy <= 1.05) put(g, x, y, c)
    }
  }
}

/**
 * Directional light over the stamped sprite: top/left silhouette edges catch
 * highlight, bottom/right edges fall into shade. The mirrored maps are
 * symmetric by construction, so this is what gives the sprite a light source —
 * the same trick the reference sheets use.
 */
function lightPass(g: PGrid) {
  const light: [number, number][] = []
  const shade: [number, number][] = []
  const empty = (i: number, j: number) =>
    i < 0 || j < 0 || i >= GRID || j >= GRID || g[j][i] === null || g[j][i] === 'D'

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (g[y][x] !== 'c') continue
      if (empty(x + 1, y) || empty(x, y + 1)) shade.push([x, y])
      else if (empty(x, y - 1) || empty(x - 1, y)) light.push([x, y])
    }
  }
  for (const [x, y] of shade) g[y][x] = 's'
  for (const [x, y] of light) g[y][x] = 'l'
}

/**
 * 1-cell outline around every painted cell — the classic sprite border.
 * The drop shadow ('D') counts as background: it gets outlined over, never
 * outlined around.
 */
function outline(g: PGrid) {
  const marks: [number, number][] = []
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (g[y][x] !== null && g[y][x] !== 'D') continue
      const filled = (i: number, j: number) =>
        i >= 0 && j >= 0 && i < GRID && j < GRID &&
        g[j][i] !== null && g[j][i] !== 'k' && g[j][i] !== 'D'
      if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) {
        marks.push([x, y])
      }
    }
  }
  for (const [x, y] of marks) g[y][x] = 'k'
}

const FCX = 23.5 // sprite centre line

/**
 * Rasterise one animation frame. frame 1 bobs the pet down a cell and swaps
 * the tail position — the whole idle animation, handheld style.
 */
function buildFrame(props: Props, frame: 0 | 1): PGrid {
  const g = newGrid()
  const isCat = props.species === 'cat'
  const sad = props.mood === 'sad'
  const sleepy = props.mood === 'sleepy'
  const happy = props.mood === 'happy'
  const dy = frame // bob offset

  // ---- drop shadow, then bed: the pet sits on top of both ---------------
  ellipse(g, FCX, 41.5, 13, 1.8, 'D')
  const bed = props.accessories?.find((a) => a.slot === 'bed')
  if (bed) {
    const c = bed.asset === 'bed_luxury' ? 'B' : 'G'
    rect(g, 4, 38, 40, 6, c)
    if (bed.asset === 'bed_luxury') rect(g, 4, 38, 40, 1, 'a')
  }

  // ---- the hand-authored sprite (lib/sprites.mjs) ------------------------
  const look = breedLook(props.species, props.breed ?? '')
  const sprite = SPRITES[props.species]
  const SX = 5 // sprite left edge on the grid; centre col 23
  for (let sy = 0; sy < sprite.rows.length; sy++) {
    const row = sprite.rows[sy]
    for (let sx = 0; sx < row.length; sx++) {
      const ch = row[sx]
      if (ch !== '.') put(g, SX + sx, sprite.top + sy + dy, ch)
    }
  }

  // ---- breed ears: the maps bake pointed ears; floppy breeds swap them ----
  if (look.ears === 'floppy') {
    // the top five sprite rows are pure ear — wipe them and hang soft ears
    // down the head sides instead, drooping further when sad
    for (let y = sprite.top + dy; y <= sprite.top + 4 + dy; y++) {
      for (let x = 0; x < GRID; x++) g[y][x] = null
    }
    const fy = sprite.top + (sad ? 10 : 8) + dy
    ellipse(g, sprite.earX[0], fy, 2.2, 5, 's')
    ellipse(g, sprite.earX[1], fy, 2.2, 5, 's')
    put(g, sprite.earX[0] - 1, fy - 3, 'p')
    put(g, sprite.earX[1] + 1, fy - 3, 'p')
  }

  // ---- coat patterns (only ever recolour coat cells) ---------------------
  const putPattern = (x: number, y: number) => {
    if (g[y]?.[x] === 'c') g[y][x] = 's'
  }
  if (props.pattern === 'patch') {
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const dx = (x - 27.5) / 2.6
        const dyy = (y - (sprite.eyeRow - 1) - dy) / 2.8
        const hx = (x - 13) / 3.6
        const hy2 = (y - 31 - dy) / 3.8
        if (dx * dx + dyy * dyy <= 1 || hx * hx + hy2 * hy2 <= 1) putPattern(x, y)
      }
    }
  } else if (props.pattern === 'spots') {
    for (const [cx, cy] of [[15, 25], [31, 29], [23, 22], [28, sprite.top + 5]] as const) {
      for (let y = cy - 2; y <= cy + 2; y++) {
        for (let x = cx - 2; x <= cx + 2; x++) {
          if ((x - cx) ** 2 + (y - cy) ** 2 <= 3) putPattern(x, y + dy)
        }
      }
    }
  }

  // ---- tail (attached at the haunch, not floating beside it) -------------
  if (look.curlTail && !sad && !sleepy) {
    // spitz curl over the back, tip flicking between frames
    rect(g, 36, 26 + dy, 2, 3, 'c'); rect(g, 37, 22 + dy, 2, 4, 'c')
    rect(g, 35, 20 + dy, 3, 2, 'u')
    if (frame === 1) rect(g, 34, 21 + dy, 2, 2, 'u')
  } else if (isCat) {
    // wrapped around the paws along the floor, tip flicking between frames
    rect(g, 32, 40 + dy, 4, 2, 'c'); rect(g, 35, 39 + dy, 3, 2, 'c')
    rect(g, 37, 36 + dy, 2, 4, 's')
    if (frame === 1) rect(g, 37, 34 + dy, 2, 2, 's')
  } else if (sad || sleepy) {
    rect(g, 37, 36 + dy, 2, 3, 's'); rect(g, 38, 39 + dy, 2, 2, 's')
  } else if (frame === 0) {
    rect(g, 36, 29 + dy, 2, 4, 'c'); rect(g, 37, 26 + dy, 2, 3, 'c'); rect(g, 38, 23 + dy, 2, 3, 's')
  } else {
    rect(g, 36, 32 + dy, 3, 2, 'c'); rect(g, 38, 30 + dy, 2, 3, 'c'); rect(g, 39, 29 + dy, 2, 2, 's')
  }

  // ---- breed markings (recolours only — geometry stays shared) -----------
  const recolor = (x: number, y: number, from: string[], to: string) => {
    const cell = g[y]?.[x]
    if (cell && from.includes(cell)) g[y][x] = to
  }
  switch (look.marking) {
    case 'saddle': // dark back over the shoulders
      for (let y = 26 + dy; y <= 33 + dy; y++) {
        for (let x = 0; x < GRID; x++) recolor(x, y, ['c'], 's')
      }
      break
    case 'points': // Siamese/Ragdoll: dark ears, paws, tail and face
      for (let y = sprite.top + dy; y <= sprite.top + 5 + dy; y++) {
        for (let x = 0; x < GRID; x++) recolor(x, y, ['c', 'l'], 's')
      }
      for (let y = 37 + dy; y <= 41 + dy; y++) {
        for (let x = 0; x < GRID; x++) recolor(x, y, ['c', 'u', 'l'], 's')
      }
      for (let y = 33 + dy; y <= 42 + dy; y++) {
        for (let x = 31; x < GRID; x++) recolor(x, y, ['c', 'l'], 's')
      }
      for (let y = sprite.noseRow - 3 + dy; y <= sprite.noseRow + 4 + dy; y++) {
        for (let x = 16; x <= 30; x++) recolor(x, y, ['u'], 's')
      }
      break
    case 'mask': // Husky: white forehead blaze joining the cream muzzle
      for (let y = sprite.top + 2 + dy; y <= sprite.eyeRow - 2 + dy; y++) {
        for (let x = 22; x <= 25; x++) recolor(x, y, ['c', 'l'], 'u')
      }
      break
    case 'spots': // Bengal rosettes
      for (const [cx, cy] of [
        [15, 25], [30, 28], [22, 22], [18, 31], [27, 33], [26, 12],
      ] as const) {
        for (let y = cy - 1; y <= cy + 1; y++) {
          for (let x = cx - 1; x <= cx + 1; x++) {
            if ((x - cx) ** 2 + (y - cy) ** 2 <= 2) recolor(x, y + dy, ['c'], 's')
          }
        }
      }
      break
    // 'hairless' needs no recolour — the Sphynx look comes from its skin-tone
    // typical colour
  }

  lightPass(g)

  // ---- collars / hats (painted over the coat, before the outline) -------
  const nrow = sprite.neckRow + dy
  const cx0 = isCat ? 16 : 17 // collar left edge hugs the neck width
  const cwid = isCat ? 15 : 13
  const ht = sprite.top - 4 + dy // hat top row
  for (const { asset } of props.accessories ?? []) {
    switch (asset) {
      case 'collar_red': rect(g, cx0, nrow, cwid, 2, 'R'); rect(g, 22, nrow + 2, 3, 2, 'a'); break
      case 'collar_blue': rect(g, cx0, nrow, cwid, 2, 'U'); rect(g, 22, nrow + 2, 3, 2, 'a'); break
      case 'collar_gold': rect(g, cx0, nrow, cwid, 2, 'a'); rect(g, 22, nrow + 2, 3, 2, 'w'); break
      case 'bandana_green':
        rect(g, cx0, nrow, cwid, 1, 'G'); rect(g, 19, nrow + 1, 9, 1, 'G')
        rect(g, 21, nrow + 2, 5, 1, 'G'); rect(g, 22, nrow + 3, 3, 1, 'G')
        break
      case 'hat_party':
        rect(g, 22, ht, 3, 2, 'a')
        rect(g, 22, ht + 2, 3, 1, 'P'); rect(g, 21, ht + 3, 5, 1, 'P')
        rect(g, 20, ht + 4, 7, 1, 'a'); rect(g, 19, ht + 5, 9, 1, 'P')
        rect(g, 18, ht + 6, 11, 1, 'P')
        break
      case 'hat_winter':
        rect(g, 21, ht, 5, 2, 'w')
        rect(g, 17, ht + 2, 13, 1, 'U'); rect(g, 16, ht + 3, 15, 2, 'U')
        rect(g, 15, ht + 5, 17, 2, 'w')
        break
      case 'bow_pink':
        rect(g, 15, ht + 2, 4, 4, 'P'); rect(g, 28, ht + 2, 4, 4, 'P')
        rect(g, 21, ht + 3, 5, 2, 'p')
        break
    }
  }

  outline(g)

  // ---- face (inside the outline, painted last) --------------------------
  // Natural rather than kawaii: almond eyes, real nose and lip line, no
  // blush. Cats get amber eyes with a dark slit.
  const ey = sprite.eyeRow + dy
  if (sleepy) {
    for (const x of [19, 20, 21, 25, 26, 27]) put(g, x, ey, 'k')
  } else if (isCat) {
    put(g, 19, ey, 'a'); put(g, 20, ey, 'e'); put(g, 21, ey, 'a')
    put(g, 25, ey, 'a'); put(g, 26, ey, 'e'); put(g, 27, ey, 'a')
  } else {
    rect(g, 19, ey, 2, 1, 'e')
    rect(g, 26, ey, 2, 1, 'e')
  }
  if (sad && !sleepy) {
    // worried brows, angled in
    put(g, 20, ey - 2, 'k'); put(g, 21, ey - 2, 'k')
    put(g, 25, ey - 2, 'k'); put(g, 26, ey - 2, 'k')
  }

  // nose + philtrum line down to the lip
  const noseY = sprite.noseRow + dy
  rect(g, 22, noseY, 3, 1, 'n')
  if (!isCat) put(g, 23, noseY + 1, 'n')
  put(g, 23, noseY + (isCat ? 1 : 2), 'k')

  // mouth: subtle lip corners; opens with a tongue when happy
  const my = noseY + (isCat ? 2 : 3)
  if (happy) {
    for (const x of [21, 22, 23, 24, 25]) put(g, x, my, 'k')
    if (!isCat) rect(g, 22, my + 1, 3, 2, 'p') // tongue
  } else if (sad) {
    put(g, 20, my + 1, 'k'); put(g, 21, my, 'k')
    put(g, 25, my, 'k'); put(g, 26, my + 1, 'k')
  } else {
    put(g, 20, my, 'k'); put(g, 21, my, 'k')
    put(g, 25, my, 'k'); put(g, 26, my, 'k')
  }

  // ---- whiskers (attached to the cheek outline) -------------------------
  if (isCat && sprite.whiskerRow) {
    const wy = sprite.whiskerRow + dy
    for (const x of [10, 11, 12]) put(g, x, wy, 'k')
    for (const x of [34, 35, 36]) put(g, x, wy, 'k')
  }

  return g
}

/** The cosy room behind the pet — wall, window, picture, plant, rug, bowl. */
function buildRoom(): PGrid {
  const g = newGrid()

  rect(g, 0, 0, GRID, HORIZON + 1, 'm') // wall
  rect(g, 0, HORIZON, GRID, 1, 'M') // baseboard
  rect(g, 0, HORIZON + 1, GRID, GRID - HORIZON - 1, 'f') // floor
  for (let y = HORIZON + 1; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) if ((x + y * 3) % 10 === 0) put(g, x, y, 'd') // plank seams
  }

  // window with warm light and mullions
  rect(g, 4, 4, 11, 11, 't')
  rect(g, 5, 5, 9, 9, 'y')
  for (let y = 5; y < 14; y++) put(g, 9, y, 't')
  for (let x = 5; x < 14; x++) put(g, x, 9, 't')

  // little framed picture on the right wall
  rect(g, 36, 6, 8, 7, 'o')
  rect(g, 37, 7, 6, 5, 'w')
  put(g, 39, 9, 'x'); put(g, 40, 9, 'x'); put(g, 39, 10, 'x')

  // potted plant under the window, left — the right side stays clear for the
  // wagging tail
  ellipse(g, 7.5, 20, 3.4, 4, 'g')
  put(g, 6, 18, 'm'); put(g, 9, 21, 'm') // leaf gaps
  rect(g, 5, 24, 5, 5, 'o')
  rect(g, 5, 24, 5, 1, 'd')

  // rug under the pet
  ellipse(g, FCX, 39, 15.5, 6, 'q')
  ellipse(g, FCX, 39, 13.8, 4.9, 'r')

  // food bowl bottom right
  rect(g, 40, 41, 6, 3, 'b')
  rect(g, 41, 40, 4, 1, 'x')

  return g
}

function shadeColor(hex: string, factor: number): number {
  const n = parseInt(hex.replace('#', ''), 16)
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  const r = clamp(((n >> 16) & 0xff) * factor)
  const gr = clamp(((n >> 8) & 0xff) * factor)
  const b = clamp((n & 0xff) * factor)
  return (r << 16) | (gr << 8) | b
}

function palette(coat: string): Record<string, number> {
  const safe = /^#[0-9a-fA-F]{6}$/.test(coat) ? coat : '#c9863f'
  return {
    // pet — outline is a deep tone of the coat, not black: softer, like the
    // reference sprites
    k: shadeColor(safe, 0.34),
    c: parseInt(safe.slice(1), 16),
    s: shadeColor(safe, 0.68),
    l: shadeColor(safe, 1.22),
    u: 0xf2e4c8, // cream muzzle/chest — reads on any coat colour
    e: 0x241a12,
    n: 0x3a2a1e,
    w: 0xfffaeb,
    p: 0xf08aa4,
    a: 0xf2b31e,
    // accessories
    R: 0xc4432f,
    U: 0x3565c0,
    G: 0x4f7f43,
    P: 0xd94f6a,
    B: 0x7a5aa8,
    // room
    m: parseInt(ROOM_WALL.slice(1), 16),
    M: 0x9fbecc,
    f: parseInt(ROOM_FLOOR.slice(1), 16),
    d: 0xa87c48,
    r: 0xf6ead0,
    q: 0xdec49a,
    t: 0xfffaeb,
    y: 0xffe2a0,
    g: 0x4f7f43,
    o: 0xb56a3a,
    b: 0x8a8fa8,
    x: 0x8c5a33,
  }
}

type Controller = {
  setState: (mood: Mood) => void
  equip: (accessories: StageAccessory[]) => void
  playEffect: (key: string) => void
  destroy: () => void
}

async function mount(host: HTMLDivElement, props: Props): Promise<Controller> {
  const { Application, Container, Graphics } = await import('pixi.js')

  const app = new Application()
  await app.init({
    width: W,
    height: H,
    backgroundAlpha: 0,
    antialias: false, // pixels stay pixels
    roundPixels: true,
    resolution: Math.min(globalThis.devicePixelRatio || 1, 2),
    autoDensity: true,
  })

  host.appendChild(app.canvas)
  app.canvas.style.width = '100%'
  app.canvas.style.height = '100%'
  app.canvas.style.objectFit = 'contain'
  app.canvas.style.imageRendering = 'pixelated'

  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  let destroyed = false

  const current = { mood: props.mood, accessories: props.accessories ?? [] }
  const colors = palette(props.color)

  const drawGrid = (target: InstanceType<typeof Container>, grid: PGrid) => {
    target.removeChildren().forEach((child) => child.destroy())
    const gfx = new Graphics()
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const cell = grid[y][x]
        if (!cell) continue
        const px = OX + x * CELL
        const py = OY + y * CELL
        if (cell === 'D') gfx.rect(px, py, CELL, CELL).fill({ color: 0x241a12, alpha: 0.14 })
        else gfx.rect(px, py, CELL, CELL).fill(colors[cell] ?? colors.k)
      }
    }
    target.addChild(gfx)
  }

  // room fills the canvas margins too, then the detailed grid goes on top
  const room = new Container()
  const base = new Graphics()
  base.rect(0, 0, W, OY + (HORIZON + 1) * CELL).fill(colors.m)
  base.rect(0, OY + (HORIZON + 1) * CELL, W, H).fill(colors.f)
  base.rect(0, OY + HORIZON * CELL, W, CELL).fill(colors.M)
  room.addChild(base)
  const roomCells = new Container()
  room.addChild(roomCells)
  drawGrid(roomCells, buildRoom())

  // petRoot lets action animations move/mirror the whole pet as one thing
  const petRoot = new Container()
  petRoot.pivot.set(W / 2, H / 2)
  petRoot.position.set(W / 2, H / 2)
  const frames: InstanceType<typeof Container>[] = [new Container(), new Container()]
  petRoot.addChild(frames[0], frames[1])
  const effects = new Container()
  app.stage.addChild(room, petRoot, effects)

  const rebuild = (moodOverride?: Mood) => {
    const p = { ...props, mood: moodOverride ?? current.mood, accessories: current.accessories }
    drawGrid(frames[0], buildFrame(p, 0))
    drawGrid(frames[1], buildFrame(p, 1))
    frames[1].visible = false
    frames[0].visible = true
    if (reduced) app.render()
  }
  rebuild()

  // ---- particles: chunky pixel squares ----------------------------------
  type Particle = { g: InstanceType<typeof Graphics>; vx: number; vy: number; life: number }
  const live: Particle[] = []

  // ---- action animations: every care action moves the pet -----------------
  // effect key (from the actions table) -> how the pet reacts
  const ANIM_FOR: Record<string, 'eat' | 'walk' | 'play' | 'groom' | 'train' | 'sleep'> = {
    crumbs: 'eat', droplets: 'eat', hearts: 'play', leaves: 'walk',
    sparkles: 'groom', stars: 'train', zzz: 'sleep',
  }
  const ANIM_MS = 2400
  let anim: { kind: (typeof ANIM_FOR)[string]; elapsed: number } | null = null
  let flipMs = 480 // idle frame cadence; walking flips faster

  const snap = (v: number) => Math.round(v / CELL) * CELL

  const playEffect = (key: string) => {
    if (reduced) return // feedback still lands as the toast

    const kind = ANIM_FOR[key]
    if (kind) {
      anim = { kind, elapsed: 0 }
      flipMs = kind === 'walk' ? 200 : 480
      if (kind === 'sleep') rebuild('sleepy') // eyes closed while snoozing
    }

    const colorMap: Record<string, number> = {
      hearts: 0xd94f6a, sparkles: 0xf2b31e, crumbs: 0xb07a3f, droplets: 0x3565c0,
      leaves: 0x4f7f43, stars: 0xf2b31e, zzz: 0x8a8fa8,
    }
    const color = colorMap[key] ?? 0xf2b31e

    for (let i = 0; i < 8; i++) {
      const gfx = new Graphics()
      if (key === 'hearts') {
        gfx.rect(0, 0, 4, 4).rect(8, 0, 4, 4).rect(0, 4, 12, 4).rect(4, 8, 4, 4).fill(color)
      } else {
        gfx.rect(0, 0, 6, 6).fill(color)
      }
      gfx.x = W / 2 + (Math.random() - 0.5) * 140
      gfx.y = H / 2 - 20 + Math.random() * 50
      effects.addChild(gfx)
      live.push({ g: gfx, vx: (Math.random() - 0.5) * 0.6, vy: -0.8 - Math.random() * 0.6, life: 1 })
    }
  }

  // ---- ticker: frame flip + action motion + particles --------------------
  let acc = 0
  app.ticker.add(({ deltaMS, deltaTime }) => {
    acc += deltaMS
    if (acc >= flipMs) {
      acc = 0
      frames[0].visible = !frames[0].visible
      frames[1].visible = !frames[0].visible
    }

    if (anim) {
      anim.elapsed += deltaMS
      const t = Math.min(1, anim.elapsed / ANIM_MS)

      switch (anim.kind) {
        case 'eat': // quick nose-down nomming bobs
          petRoot.y = H / 2 + (Math.floor(anim.elapsed / 220) % 2 === 0 ? CELL : 0)
          break
        case 'walk': { // stroll right then back, mirroring with direction
          const x = Math.sin(t * Math.PI * 2) * 9 * CELL
          petRoot.x = W / 2 + snap(x)
          petRoot.scale.x = Math.cos(t * Math.PI * 2) >= 0 ? 1 : -1
          break
        }
        case 'play': // three happy hops
          petRoot.y = H / 2 - snap(Math.abs(Math.sin(t * Math.PI * 3)) * 3 * CELL)
          break
        case 'train': // two deliberate hops
          petRoot.y = H / 2 - snap(Math.abs(Math.sin(t * Math.PI * 2)) * 2 * CELL)
          break
        case 'groom': // shake the water off
          petRoot.x = W / 2 + (Math.floor(anim.elapsed / 140) % 2 === 0 ? CELL : -CELL)
          break
        case 'sleep': // stillness is the animation
          break
      }

      if (anim.elapsed >= ANIM_MS) {
        const wasSleep = anim.kind === 'sleep'
        anim = null
        flipMs = 480
        petRoot.position.set(W / 2, H / 2)
        petRoot.scale.x = 1
        if (wasSleep) rebuild() // reopen the eyes
      }
    }

    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i]
      // snap motion to a coarse grid so particles move like pixels, not dust
      p.g.x += p.vx * deltaTime * 3
      p.g.y += p.vy * deltaTime * 3
      p.g.x = Math.round(p.g.x / 4) * 4
      p.g.y = Math.round(p.g.y / 4) * 4
      p.life -= 0.014 * deltaTime
      p.g.alpha = p.life > 0.35 ? 1 : 0 // pixel art vanishes, it does not fade
      if (p.life <= 0) {
        p.g.destroy()
        live.splice(i, 1)
      }
    }
  })

  const onVisibility = () => (document.hidden ? app.stop() : app.start())
  if (reduced) {
    app.stop()
    app.render()
  } else {
    document.addEventListener('visibilitychange', onVisibility)
  }

  return {
    setState: (mood) => {
      if (mood === current.mood) return
      current.mood = mood
      rebuild()
    },
    equip: (accessories) => {
      current.accessories = accessories
      rebuild()
    },
    playEffect,
    // Idempotent: React dev double-invokes cleanup and Pixi throws on a
    // second destroy.
    destroy: () => {
      if (destroyed) return
      destroyed = true
      document.removeEventListener('visibilitychange', onVisibility)
      app.destroy(true, { children: true })
    },
  }
}

export default function PetStage({
  species, breed, color, pattern, mood, accessories, effect, className,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const ctrlRef = useRef<Controller | null>(null)

  // Rebuild only when the pet's identity changes; mood/accessories/effects are
  // pushed through the controller.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const ready = mount(host, { species, breed, color, pattern, mood, accessories })
    ready.then((ctrl) => {
      ctrlRef.current = ctrl
    })

    return () => {
      ctrlRef.current = null
      ready.then((ctrl) => ctrl.destroy())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mood/accessories/effect are pushed imperatively below
  }, [species, breed, color, pattern])

  useEffect(() => {
    ctrlRef.current?.setState(mood)
  }, [mood])

  useEffect(() => {
    ctrlRef.current?.equip(accessories ?? [])
  }, [accessories])

  useEffect(() => {
    if (effect) ctrlRef.current?.playEffect(effect.key)
  }, [effect])

  return <div ref={hostRef} className={className} aria-hidden />
}
