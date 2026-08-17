import { describe, expect, it } from 'vitest'
import { carve } from './carve'
import { buildBoard, canPlace, cellsAt, correctPlacement, isSolved } from './engine'
import { bounds, distinctRotations, rotated, shapeKey } from './polyomino'
import { PUZZLE_SPECS, buildPuzzle } from './puzzles'
import { mulberry32 } from './rng'
import type { PlacementMap, Rotation } from './types'

const puzzles = PUZZLE_SPECS.map((spec) => buildPuzzle(spec))

describe.each(puzzles.map((p) => [p.theme, p] as const))('%s', (_theme, puzzle) => {
  it('lays every word out along its own row', () => {
    puzzle.words.forEach((word, r) => {
      const row = puzzle.solution[r].filter((letter) => letter !== null).join('')
      expect(row).toBe(word)
    })
  })

  it('carves bricks that tile the grid exactly, with no gaps or overlaps', () => {
    const seen = new Map<string, number>()
    for (const brick of puzzle.bricks) {
      for (const cell of cellsAt(brick, correctPlacement(brick))) {
        const key = `${cell.r},${cell.c}`
        seen.set(key, (seen.get(key) ?? 0) + 1)
        expect(puzzle.solution[cell.r]?.[cell.c]).toBe(cell.letter)
      }
    }

    const playable = puzzle.solution.flat().filter((letter) => letter !== null).length
    expect(seen.size).toBe(playable)
    expect([...seen.values()].every((count) => count === 1)).toBe(true)
  })

  it('has bricks that are all orthogonally connected', () => {
    for (const brick of puzzle.bricks) {
      const cells = new Set(brick.cells.map((c) => `${c.r},${c.c}`))
      const queue = [brick.cells[0]]
      const seen = new Set([`${brick.cells[0].r},${brick.cells[0].c}`])
      while (queue.length) {
        const cell = queue.pop()!
        for (const [dr, dc] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ]) {
          const key = `${cell.r + dr},${cell.c + dc}`
          if (cells.has(key) && !seen.has(key)) {
            seen.add(key)
            queue.push({ r: cell.r + dr, c: cell.c + dc, letter: '' })
          }
        }
      }
      expect(seen.size).toBe(brick.cells.length)
    }
  })

  it('is solved once every brick sits at its home position', () => {
    const placements: PlacementMap = {}
    for (const brick of puzzle.bricks) placements[brick.id] = correctPlacement(brick)
    expect(isSolved(puzzle, buildBoard(puzzle, placements))).toBe(true)
  })

  it('is not solved while any brick is missing', () => {
    const placements: PlacementMap = {}
    for (const brick of puzzle.bricks.slice(1)) placements[brick.id] = correctPlacement(brick)
    expect(isSolved(puzzle, buildBoard(puzzle, placements))).toBe(false)
  })

  it('accepts every brick at its home on an empty board', () => {
    const empty = buildBoard(puzzle, {})
    for (const brick of puzzle.bricks) {
      const home = correctPlacement(brick)
      expect(canPlace(puzzle, empty, brick, home.r, home.c, home.rotation)).toBe(true)
    }
  })

  it('refuses any placement that would cover an occupied cell', () => {
    const first = puzzle.bricks[0]
    const home = correctPlacement(first)
    const board = buildBoard(puzzle, { [first.id]: home })
    const taken = new Set(cellsAt(first, home).map((cell) => `${cell.r},${cell.c}`))

    for (const brick of puzzle.bricks.slice(1)) {
      // Its own home is by construction clear of every other brick.
      const own = correctPlacement(brick)
      expect(canPlace(puzzle, board, brick, own.r, own.c, own.rotation)).toBe(true)

      for (let r = 0; r < puzzle.rows; r++) {
        for (let c = 0; c < puzzle.cols; c++) {
          const overlaps = cellsAt(brick, { r, c, rotation: 0 }).some((cell) =>
            taken.has(`${cell.r},${cell.c}`),
          )
          if (overlaps) expect(canPlace(puzzle, board, brick, r, c, 0)).toBe(false)
        }
      }
    }
  })

  it('never allows a brick off the edge of the board', () => {
    const empty = buildBoard(puzzle, {})
    for (const brick of puzzle.bricks) {
      expect(canPlace(puzzle, empty, brick, -1, 0, 0)).toBe(false)
      expect(canPlace(puzzle, empty, brick, 0, -1, 0)).toBe(false)
      expect(canPlace(puzzle, empty, brick, puzzle.rows, 0, 0)).toBe(false)
      expect(canPlace(puzzle, empty, brick, 0, puzzle.cols, 0)).toBe(false)
    }
  })
})

describe('clues', () => {
  // Words too common to count as a giveaway if a clue happens to contain them.
  const STOP_WORDS = new Set(['and', 'the', 'that', 'them', 'with', 'from', 'over', 'into'])

  it.each(PUZZLE_SPECS.map((spec) => [spec.theme, spec] as const))(
    '%s: never names one of its own answers',
    (_theme, spec) => {
      const clue = spec.clue.toLowerCase()
      for (const word of spec.words) {
        expect(clue).not.toContain(word.toLowerCase())
      }
    },
  )

  it.each(PUZZLE_SPECS.map((spec) => [spec.theme, spec] as const))(
    '%s: never names the theme it is hiding',
    (_theme, spec) => {
      const clue = spec.clue.toLowerCase()
      const themeWords = spec.theme
        .toLowerCase()
        .split(/\W+/)
        .filter((word) => word.length > 2 && !STOP_WORDS.has(word))

      expect(themeWords.length).toBeGreaterThan(0)
      for (const word of themeWords) {
        // Also catches the singular, so "Spices" cannot be clued as "spice".
        const stem = word.replace(/(es|s)$/, '')
        expect(clue).not.toContain(stem)
      }
    },
  )

  it('gives every puzzle a clue that reads like a sentence', () => {
    for (const spec of PUZZLE_SPECS) {
      expect(spec.clue.length).toBeGreaterThan(20)
      expect(spec.clue).toMatch(/[.!?]$/)
      expect(spec.blurb.length).toBeGreaterThan(0)
    }
  })
})

describe('polyomino', () => {
  it('returns to the original shape after four quarter turns', () => {
    for (const puzzle of puzzles) {
      for (const brick of puzzle.bricks) {
        expect(shapeKey(rotated(brick.cells, 0))).toBe(shapeKey(rotated(brick.cells, 0)))
        let cells = brick.cells
        for (let i = 0; i < 4; i++) cells = rotated(cells, 1)
        expect(shapeKey(cells)).toBe(shapeKey(brick.cells))
      }
    }
  })

  it('swaps width and height on a quarter turn', () => {
    const cells = [
      { r: 0, c: 0, letter: 'A' },
      { r: 0, c: 1, letter: 'B' },
      { r: 0, c: 2, letter: 'C' },
    ]
    expect(bounds(cells)).toEqual({ rows: 1, cols: 3 })
    expect(bounds(rotated(cells, 1))).toEqual({ rows: 3, cols: 1 })
  })

  it('keeps letters attached to their cells through a full turn', () => {
    const cells = [
      { r: 0, c: 0, letter: 'A' },
      { r: 0, c: 1, letter: 'B' },
      { r: 1, c: 1, letter: 'C' },
    ]
    const back = rotated(rotated(rotated(rotated(cells, 1), 1), 1), 1)
    expect(back.map((c) => `${c.r}${c.c}${c.letter}`).sort()).toEqual(
      cells.map((c) => `${c.r}${c.c}${c.letter}`).sort(),
    )
  })

  it('counts a square as having one distinct orientation', () => {
    const square = [
      { r: 0, c: 0, letter: 'A' },
      { r: 0, c: 1, letter: 'B' },
      { r: 1, c: 0, letter: 'C' },
      { r: 1, c: 1, letter: 'D' },
    ]
    expect(distinctRotations(square)).toBe(1)
  })
})

describe('carve', () => {
  it('is deterministic for a given seed', () => {
    const grid = puzzles[0].solution
    const a = carve(grid, mulberry32(42))
    const b = carve(grid, mulberry32(42))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('produces different layouts for different seeds', () => {
    const grid = puzzles[0].solution
    const a = carve(grid, mulberry32(1))
    const b = carve(grid, mulberry32(999))
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
  })

  it('never strands a single-cell brick, and mostly respects the size range', () => {
    const sizes: number[] = []
    for (const puzzle of puzzles) {
      for (let seed = 0; seed < 200; seed++) {
        const bricks = carve(puzzle.solution, mulberry32(seed), { minSize: 3, maxSize: 5 })
        for (const brick of bricks) sizes.push(brick.cells.length)
      }
    }

    // Hard invariant: absorbing runts must never leave a lone cell behind.
    expect(Math.min(...sizes)).toBeGreaterThan(1)

    // Soft target: merging a runt can push a brick past the cap, but that is
    // the exception, not the rule.
    const inRange = sizes.filter((n) => n >= 3 && n <= 5).length
    expect(inRange / sizes.length).toBeGreaterThan(0.8)
  })

  it('tiles the grid exactly across many seeds', () => {
    for (const puzzle of puzzles) {
      for (let seed = 0; seed < 40; seed++) {
        const bricks = carve(puzzle.solution, mulberry32(seed))
        const covered = bricks.flatMap((b) => cellsAt(b, correctPlacement(b)))
        const keys = new Set(covered.map((c) => `${c.r},${c.c}`))
        const playable = puzzle.solution.flat().filter((l) => l !== null).length
        expect(covered.length).toBe(playable)
        expect(keys.size).toBe(playable)
      }
    }
  })

  it('gives touching bricks different colours', () => {
    for (const puzzle of puzzles) {
      const owner = new Map<string, { id: string; colour: number }>()
      for (const brick of puzzle.bricks) {
        for (const cell of cellsAt(brick, correctPlacement(brick))) {
          owner.set(`${cell.r},${cell.c}`, { id: brick.id, colour: brick.colour })
        }
      }
      for (const [key, self] of owner) {
        const [r, c] = key.split(',').map(Number)
        for (const [dr, dc] of [
          [1, 0],
          [0, 1],
        ]) {
          const other = owner.get(`${r + dr},${c + dc}`)
          if (other && other.id !== self.id) expect(other.colour).not.toBe(self.colour)
        }
      }
    }
  })
})

describe('rotation and placement', () => {
  it('rejects a rotated brick that no longer matches the solution letters', () => {
    // A brick turned 90 degrees may still fit geometrically, but it must not
    // silently count as solved.
    const puzzle = puzzles.find((p) => p.allowRotation)!
    const placements: PlacementMap = {}
    for (const brick of puzzle.bricks) {
      const home = correctPlacement(brick)
      placements[brick.id] = { ...home, rotation: 1 as Rotation }
    }
    expect(isSolved(puzzle, buildBoard(puzzle, placements))).toBe(false)
  })
})
