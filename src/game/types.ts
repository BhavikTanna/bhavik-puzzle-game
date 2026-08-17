/** A single cell of a brick: offset from the brick's own origin, plus its letter. */
export interface BrickCell {
  r: number
  c: number
  letter: string
}

/**
 * A polyomino carrying one letter per cell. Cell coordinates are normalised so
 * the minimum row and column are both 0 (see `normalise` in polyomino.ts).
 */
export interface Brick {
  id: string
  cells: BrickCell[]
  /** Index into the palette, so a brick keeps its colour across rotations. */
  colour: number
  /**
   * Board position this brick was carved from, at rotation 0. Letters alone
   * cannot identify it — the same letters in the same shape may fit elsewhere —
   * so the carve records it rather than searching for it later.
   */
  home: { r: number; c: number }
}

/** Quarter-turns clockwise. */
export type Rotation = 0 | 1 | 2 | 3

/** Where a brick currently sits on the board, in board coordinates. */
export interface Placement {
  r: number
  c: number
  rotation: Rotation
}

/**
 * The board is a rectangle of `rows` x `cols`, but not every position is
 * playable: `solution[r][c] === null` marks a hole (outside the puzzle).
 */
export interface Puzzle {
  id: string
  /** The answer to the clue. Hidden until the puzzle is solved or revealed. */
  theme: string
  /**
   * The cryptic clue shown while playing. It gestures at the theme without
   * naming it or any of the answers — working out the connection is half the
   * game, so this is what the player sees instead of the theme.
   */
  clue: string
  /** Shown after the puzzle is solved, or when the theme is revealed. */
  blurb: string
  rows: number
  cols: number
  /** The finished board. `null` marks a hole. */
  solution: (string | null)[][]
  /** One word per row, in row order. */
  words: string[]
  bricks: Brick[]
  /** Whether bricks may be rotated. Off makes for a much gentler puzzle. */
  allowRotation: boolean
}

/** Brick id -> placement, or absent when the brick is still in the tray. */
export type PlacementMap = Record<string, Placement | undefined>

export interface DragState {
  brickId: string
  rotation: Rotation
  /** Which cell of the (rotated) brick the pointer grabbed, in brick coords. */
  grabR: number
  grabC: number
  /** Current pointer position in viewport coordinates. */
  x: number
  y: number
  /** Board cell the grabbed cell is hovering, or null when off-board. */
  target: { r: number; c: number } | null
  /** Viewport position of the board's top-left, so the drag can snap to it. */
  boardX: number
  boardY: number
  /** Whether dropping at `target` would be a legal placement. */
  valid: boolean
  /** Where the drag started, so an illegal drop can animate home. */
  origin: 'tray' | 'board'
  /**
   * Pixels to raise the brick above the pointer. Zero for a mouse; about a tile
   * for touch, where a fingertip would otherwise cover the cells being placed.
   * Hit testing uses the same offset, so the brick lands where it is drawn.
   */
  lift: number
}
