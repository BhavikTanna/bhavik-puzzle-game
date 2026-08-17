import { carve } from './carve'
import { hashSeed, mulberry32 } from './rng'
import type { Puzzle } from './types'

export type Difficulty = 'easy' | 'medium' | 'hard'

export interface PuzzleSpec {
  id: string
  theme: string
  /**
   * The cryptic clue shown in place of the theme. It must not contain the
   * theme's own words or any of the answers — there is a test that enforces
   * this, so a clue cannot accidentally give the game away.
   */
  clue: string
  blurb: string
  /** One word per row, top to bottom. Letters only. */
  words: string[]
  difficulty: Difficulty
}

const CARVE_BY_DIFFICULTY: Record<
  Difficulty,
  { minSize: number; maxSize: number; allowRotation: boolean }
> = {
  // Bigger bricks mean fewer pieces and fewer ways to go wrong.
  easy: { minSize: 4, maxSize: 5, allowRotation: false },
  medium: { minSize: 3, maxSize: 4, allowRotation: false },
  hard: { minSize: 2, maxSize: 4, allowRotation: true },
}

export const PUZZLE_SPECS: PuzzleSpec[] = [
  {
    id: 'greek',
    theme: 'Greek letters',
    clue: 'The first and the last, with rays and river mouths in between.',
    blurb: 'Alpha opens the alphabet, omega closes it; gamma names a ray and delta a river mouth.',
    words: ['ALPHA', 'GAMMA', 'DELTA', 'SIGMA', 'OMEGA'],
    difficulty: 'easy',
  },
  {
    id: 'planets',
    theme: 'Planets',
    clue: 'A messenger, a beauty, a warrior and a farmer — all circling the same fire.',
    blurb: 'Named for Roman gods: the messenger, the goddess of beauty, the god of war, the god of farming.',
    words: ['MERCURY', 'VENUS', 'EARTH', 'MARS', 'JUPITER', 'SATURN'],
    difficulty: 'easy',
  },
  {
    id: 'weather',
    theme: 'Weather',
    clue: 'Four reasons to take the umbrella, in rising order of how little it will help.',
    blurb: 'Four ways the sky can ruin your afternoon.',
    words: ['THUNDER', 'DRIZZLE', 'MONSOON', 'CYCLONE'],
    difficulty: 'medium',
  },
  {
    id: 'chess',
    theme: 'Chess pieces',
    clue: 'A castle, a clergyman and a horse walk onto sixty-four squares.',
    blurb: 'Every piece on the board, from the humblest up.',
    words: ['PAWN', 'ROOK', 'KNIGHT', 'BISHOP', 'QUEEN', 'KING'],
    difficulty: 'medium',
  },
  {
    id: 'coffee',
    theme: 'Coffee',
    clue: 'Two ways to order it, and the two beans it is poured from.',
    blurb: 'What you ask for at the counter, and the species behind it.',
    words: ['LATTE', 'MOCHA', 'ESPRESSO', 'ARABICA', 'ROBUSTA'],
    difficulty: 'medium',
  },
  {
    id: 'instruments',
    theme: 'Instruments',
    clue: 'Some you pluck, some you bow, one you hit. All of them make a racket.',
    blurb: 'Strings, keys and percussion.',
    words: ['GUITAR', 'VIOLIN', 'CELLO', 'PIANO', 'DRUMS', 'BANJO'],
    difficulty: 'hard',
  },
  {
    id: 'oceans',
    theme: 'Oceans and seas',
    clue: 'Seventy per cent of the map — plus one impostor that is really a lake.',
    blurb: 'The great bodies of salt water. The Caspian is the impostor: it is landlocked.',
    words: ['PACIFIC', 'ATLANTIC', 'INDIAN', 'ARCTIC', 'CASPIAN'],
    difficulty: 'hard',
  },
  {
    id: 'spices',
    theme: 'Spices',
    clue: 'Small jars at the back of the cupboard. One of them outprices gold by weight.',
    blurb: 'The back of the cupboard, in order of how long it has been there. Saffron is the costly one.',
    words: ['PAPRIKA', 'CUMIN', 'NUTMEG', 'SAFFRON', 'CLOVES', 'GINGER'],
    difficulty: 'hard',
  },
]

/**
 * Lay the words out as centred rows and carve the result into bricks.
 *
 * Centring keeps the filled area connected (every row covers the middle column)
 * and gives a more interesting silhouette than a ragged left-aligned block.
 */
export function buildPuzzle(spec: PuzzleSpec, seed?: string): Puzzle {
  const words = spec.words.map((w) => w.toUpperCase().replace(/[^A-Z]/g, ''))
  const rows = words.length
  const cols = Math.max(...words.map((w) => w.length))

  const solution: (string | null)[][] = words.map((word) => {
    const row = new Array<string | null>(cols).fill(null)
    const offset = Math.floor((cols - word.length) / 2)
    for (let i = 0; i < word.length; i++) row[offset + i] = word[i]
    return row
  })

  const { minSize, maxSize, allowRotation } = CARVE_BY_DIFFICULTY[spec.difficulty]
  const rng = mulberry32(hashSeed(seed ?? spec.id))
  const bricks = carve(solution, rng, { minSize, maxSize })

  return {
    id: spec.id,
    theme: spec.theme,
    clue: spec.clue,
    blurb: spec.blurb,
    rows,
    cols,
    solution,
    words,
    bricks,
    allowRotation,
  }
}

export function specById(id: string): PuzzleSpec | undefined {
  return PUZZLE_SPECS.find((spec) => spec.id === id)
}
