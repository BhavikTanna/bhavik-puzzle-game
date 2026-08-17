import { describe, expect, it } from 'vitest'
import { PUZZLE_SPECS, buildPuzzle } from '../game/puzzles'
import { fitCellSize } from './useCellSize'

const puzzles = PUZZLE_SPECS.map((spec) => buildPuzzle(spec))

/**
 * Space the layout takes around the board, measured from the running app at
 * 375px wide rather than guessed. If the header, clue, controls or tray grow,
 * these need remeasuring — which is the point: the board pays for every pixel
 * spent on chrome, and this test says how much it can afford.
 */
const BOARD_PADDING_X = 24
/** Header + clue + controls + tray + board padding, full size. */
const CHROME_Y_TALL = 400
/** The same, with the `short:` variant active (viewport height <= 700). */
const CHROME_Y_SHORT = 345

const chromeY = (viewportHeight: number) =>
  viewportHeight <= 700 ? CHROME_Y_SHORT : CHROME_Y_TALL

/** Smallest tile that is still comfortably tappable. */
const MIN_TAPPABLE = 28

/** Phone sizes worth caring about, smallest first. */
const VIEWPORTS = [
  { name: 'iPhone SE (1st gen)', width: 320, height: 568 },
  { name: 'iPhone SE (modern)', width: 375, height: 667 },
  { name: 'iPhone 14', width: 390, height: 844 },
  { name: 'Pixel 7', width: 412, height: 915 },
  { name: 'iPad mini', width: 768, height: 1024 },
] as const

describe('fitCellSize', () => {
  it('fits the tighter of the two axes', () => {
    // Width-bound: 300 / 10 cols = 30, vs height 300 / 5 rows = 60.
    expect(fitCellSize(300, 300, 5, 10)).toBe(30)
    // Height-bound: the other way round.
    expect(fitCellSize(300, 300, 10, 5)).toBe(30)
  })

  it('never exceeds the box it was given', () => {
    for (const cols of [4, 5, 6, 7, 8]) {
      for (const rows of [4, 5, 6]) {
        const size = fitCellSize(351, 400, rows, cols)
        // The clamp floor can force an overflow, but not at these sizes.
        expect(size * cols).toBeLessThanOrEqual(351)
        expect(size * rows).toBeLessThanOrEqual(400)
      }
    }
  })

  it('clamps rather than producing absurd tiles', () => {
    expect(fitCellSize(4000, 4000, 5, 5)).toBe(72)
    expect(fitCellSize(10, 10, 5, 5)).toBe(22)
  })

  it('rounds down, so a fractional fit never overflows', () => {
    // 351 / 7 = 50.14 — must floor to 50, not round to 50.14 or up to 51.
    expect(fitCellSize(351, 999, 1, 7)).toBe(50)
    expect(fitCellSize(351, 999, 1, 7) * 7).toBeLessThanOrEqual(351)
  })
})

describe.each(VIEWPORTS.map((v) => [v.name, v] as const))('%s', (_name, viewport) => {
  it.each(puzzles.map((p) => [`${p.rows}x${p.cols}`, p] as const))(
    'fits a %s board without overflowing',
    (_shape, puzzle) => {
      const boardWidth = viewport.width - BOARD_PADDING_X
      const boardHeight = viewport.height - chromeY(viewport.height)
      const size = fitCellSize(boardWidth, boardHeight, puzzle.rows, puzzle.cols)

      expect(size * puzzle.cols).toBeLessThanOrEqual(boardWidth)
      expect(size * puzzle.rows).toBeLessThanOrEqual(boardHeight)
      // Tiles this small stop being tappable, which is the real failure here.
      expect(size).toBeGreaterThanOrEqual(MIN_TAPPABLE)
    },
  )
})
