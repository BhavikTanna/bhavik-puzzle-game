import { normalise } from './polyomino'
import { shuffle, type Rng } from './rng'
import type { Brick, BrickCell } from './types'

const PALETTE_SIZE = 6

interface Cell {
  r: number
  c: number
}

const key = (r: number, c: number) => `${r},${c}`
const NEIGHBOURS: Cell[] = [
  { r: -1, c: 0 },
  { r: 1, c: 0 },
  { r: 0, c: -1 },
  { r: 0, c: 1 },
]

export interface CarveOptions {
  /** Preferred minimum cells per brick. Small leftovers are merged away. */
  minSize?: number
  /** Preferred maximum cells per brick. A merge may exceed this by one. */
  maxSize?: number
}

/**
 * Partition every filled cell of `solution` into connected polyominoes.
 *
 * Regions are grown one at a time from a random seed: pick a random cell on the
 * region's frontier, absorb it, extend the frontier. A region that gets boxed in
 * below `minSize` is merged into its smallest neighbour afterwards, so the
 * result never contains stray single cells unless the grid itself is tiny.
 */
export function carve(
  solution: (string | null)[][],
  rng: Rng,
  { minSize = 3, maxSize = 5 }: CarveOptions = {},
): Brick[] {
  const rows = solution.length
  const cols = solution[0]?.length ?? 0

  const filled: Cell[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (solution[r][c] !== null) filled.push({ r, c })
    }
  }
  if (filled.length === 0) return []

  /** cell key -> region index */
  const owner = new Map<string, number>()
  const regions: Cell[][] = []

  const isFree = (r: number, c: number) =>
    r >= 0 &&
    r < rows &&
    c >= 0 &&
    c < cols &&
    solution[r][c] !== null &&
    !owner.has(key(r, c))

  for (const seed of shuffle(rng, filled)) {
    if (owner.has(key(seed.r, seed.c))) continue

    const index = regions.length
    const region: Cell[] = []
    const frontier: Cell[] = []
    const target = minSize + Math.floor(rng() * (maxSize - minSize + 1))

    const absorb = (cell: Cell) => {
      owner.set(key(cell.r, cell.c), index)
      region.push(cell)
      for (const d of NEIGHBOURS) {
        const n = { r: cell.r + d.r, c: cell.c + d.c }
        if (isFree(n.r, n.c) && !frontier.some((f) => f.r === n.r && f.c === n.c)) {
          frontier.push(n)
        }
      }
    }

    absorb(seed)
    while (region.length < target && frontier.length > 0) {
      const [next] = frontier.splice(Math.floor(rng() * frontier.length), 1)
      // The frontier can go stale as other cells of this region absorb it.
      if (!isFree(next.r, next.c)) continue
      absorb(next)
    }

    regions.push(region)
  }

  mergeRunts(regions, owner, minSize, maxSize)

  const live = regions.filter((region) => region.length > 0)
  const colours = colourRegions(live, owner, regions)

  return live.map((region, i) => {
    const cells: BrickCell[] = region.map(({ r, c }) => ({
      r,
      c,
      letter: solution[r][c] as string,
    }))
    // Sorted so a brick's cells render in a stable order regardless of the
    // order the carve happened to absorb them in.
    cells.sort((a, b) => a.r - b.r || a.c - b.c)
    const home = {
      r: Math.min(...cells.map((cell) => cell.r)),
      c: Math.min(...cells.map((cell) => cell.c)),
    }
    return { id: `brick-${i}`, cells: normalise(cells), colour: colours[i], home }
  })
}

/**
 * Fold undersized regions into an adjacent one. Emptied regions are left in
 * place as holes in `regions` so the indices stored in `owner` stay valid.
 */
function mergeRunts(
  regions: Cell[][],
  owner: Map<string, number>,
  minSize: number,
  maxSize: number,
): void {
  // Smallest first: a 1-cell runt should find a home before a 2-cell one does.
  const order = regions
    .map((_, index) => index)
    .sort((a, b) => regions[a].length - regions[b].length)

  for (const index of order) {
    const region = regions[index]
    if (region.length === 0 || region.length >= minSize) continue

    // Prefer a neighbour that can take the runt without busting the size cap,
    // but a slightly oversized brick beats leaving a stranded single cell — so
    // fall back to the smallest neighbour regardless of the cap.
    let capped = -1
    let any = -1
    for (const cell of region) {
      for (const d of NEIGHBOURS) {
        const other = owner.get(key(cell.r + d.r, cell.c + d.c))
        if (other === undefined || other === index) continue
        if (any === -1 || regions[other].length < regions[any].length) any = other
        if (regions[other].length + region.length > maxSize + 1) continue
        if (capped === -1 || regions[other].length < regions[capped].length) capped = other
      }
    }
    const best = capped !== -1 ? capped : any
    if (best === -1) continue

    for (const cell of region) {
      owner.set(key(cell.r, cell.c), best)
      regions[best].push(cell)
    }
    regions[index] = []
  }
}

/**
 * Greedy graph colouring over region adjacency, so no two touching bricks share
 * a colour where it can be avoided.
 */
function colourRegions(
  live: Cell[][],
  owner: Map<string, number>,
  allRegions: Cell[][],
): number[] {
  // Map original region indices onto the compacted `live` array.
  const compact = new Map<number, number>()
  let next = 0
  allRegions.forEach((region, index) => {
    if (region.length > 0) compact.set(index, next++)
  })

  const colours = new Array<number>(live.length).fill(-1)
  live.forEach((region, i) => {
    const taken = new Set<number>()
    for (const cell of region) {
      for (const d of NEIGHBOURS) {
        const raw = owner.get(key(cell.r + d.r, cell.c + d.c))
        if (raw === undefined) continue
        const j = compact.get(raw)
        if (j !== undefined && j !== i && colours[j] !== -1) taken.add(colours[j])
      }
    }
    let colour = 0
    while (taken.has(colour) && colour < PALETTE_SIZE - 1) colour++
    colours[i] = colour
  })
  return colours
}
