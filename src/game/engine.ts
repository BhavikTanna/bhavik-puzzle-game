import { rotated } from './polyomino'
import type { Brick, Placement, PlacementMap, Puzzle, Rotation } from './types'

export interface BoardCell {
  brickId: string
  letter: string
  colour: number
}

/** A board-sized grid of what currently occupies each cell. */
export type Board = (BoardCell | null)[][]

/** Absolute board coordinates of a brick placed at `placement`. */
export function cellsAt(brick: Brick, placement: Placement) {
  return rotated(brick.cells, placement.rotation).map((cell) => ({
    r: placement.r + cell.r,
    c: placement.c + cell.c,
    letter: cell.letter,
  }))
}

export function emptyBoard(puzzle: Puzzle): Board {
  return Array.from({ length: puzzle.rows }, () =>
    new Array<BoardCell | null>(puzzle.cols).fill(null),
  )
}

export function buildBoard(puzzle: Puzzle, placements: PlacementMap): Board {
  const board = emptyBoard(puzzle)
  for (const brick of puzzle.bricks) {
    const placement = placements[brick.id]
    if (!placement) continue
    for (const cell of cellsAt(brick, placement)) {
      if (cell.r < 0 || cell.r >= puzzle.rows || cell.c < 0 || cell.c >= puzzle.cols) continue
      board[cell.r][cell.c] = {
        brickId: brick.id,
        letter: cell.letter,
        colour: brick.colour,
      }
    }
  }
  return board
}

/**
 * A placement is legal when every cell lands on a playable square that no other
 * brick already occupies. Letters are deliberately not checked — putting a brick
 * somewhere that fits but spells nonsense is the whole game.
 */
export function canPlace(
  puzzle: Puzzle,
  board: Board,
  brick: Brick,
  r: number,
  c: number,
  rotation: Rotation,
): boolean {
  for (const cell of cellsAt(brick, { r, c, rotation })) {
    if (cell.r < 0 || cell.r >= puzzle.rows || cell.c < 0 || cell.c >= puzzle.cols) return false
    // A hole in the solution is not a playable square.
    if (puzzle.solution[cell.r][cell.c] === null) return false
    const occupant = board[cell.r][cell.c]
    if (occupant && occupant.brickId !== brick.id) return false
  }
  return true
}

/** Rows whose every letter is placed and matches the target word. */
export function solvedRows(puzzle: Puzzle, board: Board): boolean[] {
  return puzzle.solution.map((row, r) =>
    row.every((letter, c) => letter === null || board[r][c]?.letter === letter),
  )
}

export function isSolved(puzzle: Puzzle, board: Board): boolean {
  return solvedRows(puzzle, board).every(Boolean)
}

/** Bricks not currently on the board, in their original order. */
export function trayBricks(puzzle: Puzzle, placements: PlacementMap): Brick[] {
  return puzzle.bricks.filter((brick) => !placements[brick.id])
}

/** Where a brick was carved from — the one placement that is truly correct. */
export function correctPlacement(brick: Brick): Placement {
  return { r: brick.home.r, c: brick.home.c, rotation: 0 }
}

/** Whether a brick currently sits exactly where it was carved from. */
export function isCorrectlyPlaced(brick: Brick, placements: PlacementMap): boolean {
  const placement = placements[brick.id]
  return (
    !!placement &&
    placement.rotation === 0 &&
    placement.r === brick.home.r &&
    placement.c === brick.home.c
  )
}
