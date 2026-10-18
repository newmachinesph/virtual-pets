/**
 * Hand-authored pixel sprites, drawn as left halves and mirrored so they stay
 * perfectly symmetric. Plain JS so they can be previewed in a terminal:
 *
 *   node -e "import('./lib/sprites.mjs').then(({SPRITES})=>{for(const s of
 *   Object.values(SPRITES))for(const r of s.rows)console.log(r.replace(/./g,
 *   c=>({'.':'  ',c:'##',s:'++',u:'--',p:'PP'}[c])))})"
 *
 * Cells: '.' empty · c coat · s shade · u cream · p pink. Face, ears variant,
 * tail, lighting and outline are applied procedurally in PetStage so breeds
 * and moods stay dynamic.
 *
 * Proportions aim for a natural sitting pet seen from the front (not chibi):
 * head ≈ 40% of shoulder width, protruding cream muzzle, visible neck and
 * chest, thin separated front legs, hind paws peeking beside the haunches.
 * Each half row is 19 chars; col 18 is the centre line (full width 37).
 */

const DOG_HALF = [
  '..............cc...', // pointed ear tip (floppy breeds replace these)
  '.............cccc..',
  '.............cpcc..',
  '............ccppcc.',
  '............cccccc.', // ear base
  '............ccccccc', // head dome
  '...........cccccccc',
  '...........cccccccc', // eye row
  '..........ccccccccc', // cheeks
  '..........ccccccccc',
  '..........ccccuuuuu', // muzzle
  '..........cccuuuuuu',
  '...........ccuuuuuu',
  '............cuuuuuu', // chin
  '.............cuuuuu',
  '.............ccccuu', // neck, small cream bib
  '............cccccuu',
  '...........ccccccuu', // shoulder slope
  '..........cccccccuu',
  '.........ccccccccuu',
  '........cccccccccuu',
  '.......ccccccccccuu', // chest
  '......cccccccccccuu',
  '......cccccccccccuu',
  '.....cccccccccccccu',
  '.....cccccccccccccu',
  '....ccccccccccccccu', // haunches
  '....ccccccccccccccu',
  '....ccccccccccccccu',
  '....cccccccc.ccc...', // haunch | gap | front leg | between-legs gap
  '....cccccccc.ccc...',
  '....cccccccc.ccc...',
  '....sccccccc.ccc...', // haunch shading
  '....sscccccc.ccc...',
  '.....scccccc.ccc...',
  '.....uuccccc.ccc...', // hind toes peek out
  '.....uuu....uuuu...', // hind paw | front paw
]

const CAT_HALF = [
  '............cc.....', // tall ear
  '...........cpcc....',
  '...........cppcc...',
  '..........ccppcc...',
  '..........cccccc...', // ear base
  '..........ccccccccc', // head dome (rounder than the dog)
  '.........cccccccccc',
  '.........cccccccccc', // eye row
  '.........cccccccccc',
  '.........cccccccccc',
  '..........cccuuuuuu', // small muzzle
  '..........ccuuuuuuu',
  '...........cuuuuuuu', // chin
  '............ccccuuu', // slim neck
  '...........ccccccuu',
  '..........cccccccuu',
  '.........ccccccccuu',
  '........cccccccccuu',
  '.......ccccccccccuu', // chest
  '.......ccccccccccuu',
  '......cccccccccccuu',
  '......cccccccccccuu',
  '.....ccccccccccccuu', // haunches
  '.....ccccccccccccuu',
  '.....cccccccccccccu',
  '.....cccccccccccccu',
  '.....cccccccc.ccc..', // haunch | gap | front leg | gap
  '.....cccccccc.ccc..',
  '.....sccccccc.ccc..',
  '.....sscccccc.ccc..',
  '......ssccccc.ccc..',
  '......uuccccc.ccc..', // hind toes
  '......uuu....uuuu..', // hind paw | front paw
]

/** Mirror a half into full rows: [...half, reverse(half minus centre col)]. */
function expand(half) {
  return half.map((row) => row + row.slice(0, 18).split('').reverse().join(''))
}

export const SPRITES = {
  dog: {
    rows: expand(DOG_HALF),
    /** grid row the sprite starts on (sprite x offset is 5, centre col 23) */
    top: 4,
    eyeRow: 11,
    noseRow: 14,
    /** grid row the collar sits on */
    neckRow: 19,
    /** x centres for the floppy-ear variant's hanging ellipses */
    earX: [14, 33],
    /** cats only; 0 = none */
    whiskerRow: 0,
  },
  cat: {
    rows: expand(CAT_HALF),
    top: 8,
    eyeRow: 15,
    noseRow: 18,
    neckRow: 21,
    earX: [13, 34],
    whiskerRow: 20,
  },
}
