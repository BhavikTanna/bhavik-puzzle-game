import type { BrickCell, Rotation } from './types'

/** Shift cells so the minimum row and column are both 0. */
export function normalise(cells: BrickCell[]): BrickCell[] {
  const minR = Math.min(...cells.map((c) => c.r))
  const minC = Math.min(...cells.map((c) => c.c))
  return cells.map((cell) => ({ ...cell, r: cell.r - minR, c: cell.c - minC }))
}

/** Rotate a quarter turn clockwise: (r, c) -> (c, -r). */
function rotateOnce(cells: BrickCell[]): BrickCell[] {
  return normalise(cells.map((cell) => ({ ...cell, r: cell.c, c: -cell.r })))
}

/** Cells of a brick after `rotation` quarter turns clockwise, normalised. */
export function rotated(cells: BrickCell[], rotation: Rotation): BrickCell[] {
  let out = normalise(cells)
  for (let i = 0; i < rotation; i++) out = rotateOnce(out)
  return out
}

export function bounds(cells: BrickCell[]): { rows: number; cols: number } {
  return {
    rows: Math.max(...cells.map((c) => c.r)) + 1,
    cols: Math.max(...cells.map((c) => c.c)) + 1,
  }
}

export function nextRotation(rotation: Rotation, step = 1): Rotation {
  return (((rotation + step) % 4) + 4) % 4 as Rotation
}

/**
 * A shape signature ignoring letters, used to tell whether rotating a brick
 * actually changes anything (a 2x2 square, for instance, never does).
 */
export function shapeKey(cells: BrickCell[]): string {
  return normalise(cells)
    .map((c) => `${c.r},${c.c}`)
    .sort()
    .join(' ')
}

/** How many distinct orientations this shape has (1, 2, or 4). */
export function distinctRotations(cells: BrickCell[]): number {
  const seen = new Set<string>()
  for (let i = 0; i < 4; i++) seen.add(shapeKey(rotated(cells, i as Rotation)))
  return seen.size
}
