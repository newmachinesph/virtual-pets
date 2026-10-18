/**
 * How each breed looks (spec §8 — breeds should differ visibly, and the
 * differences should teach something true about the breed).
 *
 * The user's coat colour stays the base; the breed contributes ear shape,
 * markings and a typical default colour the creation form pre-selects.
 */

export type EarStyle = 'pointed' | 'floppy'

export type Marking =
  | 'none'
  | 'points' // dark ears/paws/tail/face-centre — Siamese, Ragdoll
  | 'mask' // light face blaze + chest — Husky
  | 'saddle' // dark back over the shoulders — German Shepherd
  | 'spots' // rosettes — Bengal, Dalmatian-ish
  | 'hairless' // skin tones, no coat — Sphynx

export type BreedLook = {
  ears: EarStyle
  marking: Marking
  /** pre-selected in the creation form; the user can still override */
  typicalColor: string
  /** curled over the back instead of wagging (spitz breeds) */
  curlTail?: boolean
}

const DOG: Record<string, BreedLook> = {
  'Border Collie': { ears: 'floppy', marking: 'saddle', typicalColor: '#2f2b28' },
  Bulldog: { ears: 'floppy', marking: 'none', typicalColor: '#d99a5b' },
  'Labrador Retriever': { ears: 'floppy', marking: 'none', typicalColor: '#d9b477' },
  'German Shepherd': { ears: 'pointed', marking: 'saddle', typicalColor: '#a8763e' },
  'Golden Retriever': { ears: 'floppy', marking: 'none', typicalColor: '#d9a54e' },
  Chihuahua: { ears: 'pointed', marking: 'none', typicalColor: '#c9863f' },
  Poodle: { ears: 'floppy', marking: 'none', typicalColor: '#e0d5c3' },
  Beagle: { ears: 'floppy', marking: 'saddle', typicalColor: '#b5793f' },
  'Siberian Husky': { ears: 'pointed', marking: 'mask', typicalColor: '#8a8f98', curlTail: true },
  Dachshund: { ears: 'floppy', marking: 'none', typicalColor: '#6b4226' },
}

const CAT: Record<string, BreedLook> = {
  Persian: { ears: 'pointed', marking: 'none', typicalColor: '#e0d5c3' },
  Siamese: { ears: 'pointed', marking: 'points', typicalColor: '#e8dcc0' },
  'Maine Coon': { ears: 'pointed', marking: 'saddle', typicalColor: '#8c5a33' },
  Ragdoll: { ears: 'pointed', marking: 'points', typicalColor: '#ded5c8' },
  Bengal: { ears: 'pointed', marking: 'spots', typicalColor: '#d99a5b' },
  'British Shorthair': { ears: 'pointed', marking: 'none', typicalColor: '#9aa0ad' },
  Sphynx: { ears: 'pointed', marking: 'hairless', typicalColor: '#d9a08c' },
  'Domestic Shorthair': { ears: 'pointed', marking: 'none', typicalColor: '#c9863f' },
}

const DEFAULT_LOOK: BreedLook = { ears: 'pointed', marking: 'none', typicalColor: '#c9863f' }

export function breedLook(species: 'dog' | 'cat', breed: string): BreedLook {
  return (species === 'dog' ? DOG : CAT)[breed] ?? DEFAULT_LOOK
}
