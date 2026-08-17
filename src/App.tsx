import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Board } from './components/Board'
import { BrickView } from './components/BrickView'
import { Tray } from './components/Tray'
import {
  buildBoard,
  cellsAt,
  correctPlacement,
  isCorrectlyPlaced,
  isSolved,
  solvedRows,
} from './game/engine'
import { rotated } from './game/polyomino'
import { PUZZLE_SPECS, buildPuzzle } from './game/puzzles'
import { loadProgress, saveProgress, type Progress } from './game/storage'
import type { PlacementMap } from './game/types'
import { useBrickDrag } from './hooks/useBrickDrag'
import { useCellSize, useTrayCellSize } from './hooks/useCellSize'

const DIFFICULTY_STYLES: Record<string, string> = {
  easy: 'bg-emerald-400/15 text-emerald-300 ring-emerald-400/30',
  medium: 'bg-amber-400/15 text-amber-300 ring-amber-400/30',
  hard: 'bg-rose-400/15 text-rose-300 ring-rose-400/30',
}

export default function App() {
  // Carving is deterministic, so building every puzzle once up front costs
  // almost nothing and lets the picker show which ones are already finished.
  const puzzles = useMemo(() => PUZZLE_SPECS.map((spec) => buildPuzzle(spec)), [])
  const [puzzleId, setPuzzleId] = useState(puzzles[0].id)
  const puzzle = puzzles.find((p) => p.id === puzzleId) ?? puzzles[0]

  // Progress is stored per puzzle in one object, so switching puzzles cannot
  // race a save of the previous puzzle's placements against the new id.
  const [progress, setProgress] = useState<Progress>(() => loadProgress())
  useEffect(() => saveProgress(progress), [progress])

  const placements = useMemo<PlacementMap>(() => progress[puzzle.id] ?? {}, [progress, puzzle.id])
  const setPlacements = useCallback<React.Dispatch<React.SetStateAction<PlacementMap>>>(
    (update) => {
      setProgress((prev) => {
        const current = prev[puzzle.id] ?? {}
        const next = typeof update === 'function' ? update(current) : update
        return { ...prev, [puzzle.id]: next }
      })
    },
    [puzzle.id],
  )

  const boardAreaRef = useRef<HTMLDivElement>(null)
  const cellSize = useCellSize(boardAreaRef, puzzle.rows, puzzle.cols)
  const trayCellSize = useTrayCellSize()
  const boardRef = useRef<HTMLDivElement>(null)
  const { drag, startDrag, rotate } = useBrickDrag({
    puzzle,
    placements,
    setPlacements,
    cellSize,
    boardRef,
  })

  const board = useMemo(() => buildBoard(puzzle, placements), [puzzle, placements])
  const solved = useMemo(() => solvedRows(puzzle, board), [puzzle, board])
  const won = isSolved(puzzle, board)

  const completedIds = useMemo(
    () =>
      new Set(
        puzzles
          .filter((p) => isSolved(p, buildBoard(p, progress[p.id] ?? {})))
          .map((p) => p.id),
      ),
    [puzzles, progress],
  )

  // Themes revealed by giving up. Kept out of stored progress on purpose, so a
  // reload gives an unsolved puzzle's clue another chance to land.
  const [revealedIds, setRevealedIds] = useState<ReadonlySet<string>>(new Set())
  const themeShown = won || revealedIds.has(puzzle.id)
  const difficulty = PUZZLE_SPECS.find((s) => s.id === puzzle.id)?.difficulty ?? 'easy'

  const reset = useCallback(() => setPlacements({}), [setPlacements])

  /** The next puzzle in the list, wrapping around at the end. */
  const nextPuzzleId = useMemo(() => {
    const index = puzzles.findIndex((p) => p.id === puzzle.id)
    return puzzles[(index + 1) % puzzles.length].id
  }, [puzzles, puzzle.id])

  /** Place one brick where it truly belongs, evicting whatever is in the way. */
  const hint = useCallback(() => {
    const candidate = puzzle.bricks.find((brick) => !isCorrectlyPlaced(brick, placements))
    if (!candidate) return
    const target = correctPlacement(candidate)

    const claimed = new Set(
      cellsAt(candidate, target).map((cell) => `${cell.r},${cell.c}`),
    )
    setPlacements((prev) => {
      const next = { ...prev }
      for (const brick of puzzle.bricks) {
        const placement = next[brick.id]
        if (!placement || brick.id === candidate.id) continue
        const overlaps = cellsAt(brick, placement).some((cell) =>
          claimed.has(`${cell.r},${cell.c}`),
        )
        if (overlaps) delete next[brick.id]
      }
      next[candidate.id] = target
      return next
    })
  }, [placements, puzzle, setPlacements])

  const draggedBrick = drag ? puzzle.bricks.find((b) => b.id === drag.brickId) : undefined

  return (
    // Layout areas are defined in index.css; it is a fixed-height grid rather
    // than a scrolling page so the board and the tray are always both visible.
    <div className="game-layout">
      <header
        className="game-header flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pt-3 sm:pt-6 short:sm:pt-3"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <div className="min-w-0">
          <h1 className="text-xl font-black tracking-tight sm:text-3xl short:sm:text-xl">Brickwords</h1>
          {/* Costs a third of the clue's height on a phone, so phones skip it. */}
          <p className="mt-1 hidden text-sm text-slate-400 sm:block [@media(max-height:560px)]:sm:hidden">
            Drop every brick into the grid. Each row spells a word — and the clue
            says what they have in common.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="puzzle" className="sr-only sm:not-sr-only sm:text-xs sm:text-slate-400 sm:uppercase">
            Puzzle
          </label>
          <select
            id="puzzle"
            value={puzzle.id}
            onChange={(event) => setPuzzleId(event.target.value)}
            className="max-w-[52vw] truncate rounded-lg bg-white/10 px-3 py-2 text-sm ring-1 ring-white/15 outline-none focus:ring-white/40 sm:max-w-none"
          >
            {/*
              Naming the themes here would hand over every answer at once, so
              an unsolved puzzle is listed by number and only gives up its
              theme once you have earned it.
            */}
            {puzzles.map((p, index) => (
              <option key={p.id} value={p.id} className="bg-slate-900">
                {completedIds.has(p.id)
                  ? `✓ ${p.theme}`
                  : `Puzzle ${index + 1} · ${PUZZLE_SPECS[index].difficulty}`}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="game-clue mx-auto w-full max-w-lg px-4 pt-3 text-center short:pt-1.5">
        <p className="text-[0.7rem] font-semibold tracking-[0.2em] text-slate-500 uppercase short:hidden">
          Clue
        </p>
        <p className="mt-1 text-base leading-snug font-medium text-balance text-slate-100 italic sm:text-lg short:text-sm short:sm:text-base">
          “{puzzle.clue}”
        </p>

        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 short:mt-1">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${DIFFICULTY_STYLES[difficulty]}`}
          >
            {difficulty}
          </span>
          <span className="text-sm text-slate-400">
            {puzzle.words.length} words · {solved.filter(Boolean).length} solved
          </span>
          {themeShown ? (
            <span className="text-sm font-semibold text-emerald-300">{puzzle.theme}</span>
          ) : (
            <button
              type="button"
              onClick={() => setRevealedIds((prev) => new Set(prev).add(puzzle.id))}
              className="text-sm text-slate-400 underline underline-offset-4 hover:text-slate-200"
            >
              Give up on the clue
            </button>
          )}
        </div>
      </div>

      {/*
        The board fills whatever is left between the clue and the controls, and
        `useCellSize` measures this box. Its height comes from its siblings, so
        the board resizing cannot feed back into the measurement.
      */}
      <div className="game-board min-h-0 overflow-hidden px-3 py-3 short:py-1.5">
        {/*
          The measured element carries no padding of its own: getBoundingClientRect
          reports the border box, so padding here would be counted as space the
          board could use and the last column would overflow.
        */}
        <div ref={boardAreaRef} className="grid h-full w-full place-items-center">
          <Board
            puzzle={puzzle}
            placements={placements}
            cellSize={cellSize}
            drag={drag}
            solved={solved}
            boardRef={boardRef}
            onBrickPointerDown={startDrag}
          />
        </div>
      </div>

      <div className="game-controls flex flex-wrap justify-center gap-2 px-4 pb-3 short:pb-1.5">
        {won ? (
          <button
            type="button"
            onClick={() => setPuzzleId(nextPuzzleId)}
            className="rounded-lg bg-emerald-400/20 px-4 py-2 text-sm font-semibold text-emerald-100 ring-1 ring-emerald-300/40 hover:bg-emerald-400/30 short:py-1.5"
          >
            Next puzzle
          </button>
        ) : (
          <button
            type="button"
            onClick={hint}
            className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium ring-1 ring-white/15 hover:bg-white/15 short:py-1.5"
          >
            Place a brick for me
          </button>
        )}
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 ring-1 ring-white/10 hover:bg-white/10 short:py-1.5"
        >
          Clear board
        </button>
      </div>

      {/*
        The win banner lives in the tray, which is empty by the time you win.
        Putting it anywhere else would change the layout height and resize the
        board at the exact moment you want to look at it.
      */}
      <Tray
        puzzle={puzzle}
        placements={placements}
        cellSize={trayCellSize}
        draggingId={drag?.brickId ?? null}
        onBrickPointerDown={startDrag}
        banner={
          won ? (
            <div className="animate-pop rounded-xl bg-emerald-400/15 p-3 text-center ring-1 ring-emerald-300/40">
              <p className="text-[0.7rem] font-semibold tracking-[0.2em] text-emerald-300/70 uppercase">
                Solved · the theme was
              </p>
              <p className="mt-0.5 text-lg font-bold text-emerald-100">{puzzle.theme}</p>
              <p className="mt-1 text-sm text-balance text-emerald-100/70">{puzzle.blurb}</p>
            </div>
          ) : undefined
        }
      />

      {/*
        The dragged brick. Over a legal cell it snaps into the grid so you can
        read the row it would complete; otherwise it hangs off the pointer,
        leaving the board's red outline visible underneath.
      */}
      {drag && draggedBrick ? (
        <div
          className="pointer-events-none fixed z-50"
          style={
            drag.target && drag.valid
              ? {
                  top: drag.boardY + drag.target.r * cellSize,
                  left: drag.boardX + drag.target.c * cellSize,
                }
              : {
                  top: drag.y - drag.grabR * cellSize - cellSize / 2 - drag.lift,
                  left: drag.x - drag.grabC * cellSize - cellSize / 2,
                }
          }
        >
          <BrickView
            cells={rotated(draggedBrick.cells, drag.rotation)}
            colour={draggedBrick.colour}
            cellSize={cellSize}
            // Going translucent on an illegal drop lets the board's red
            // outline read through the brick instead of hiding under it.
            className={drag.valid ? '' : 'scale-105 opacity-55'}
          />
        </div>
      ) : null}

      {/* Touch users have no R key, so give them a button while dragging. */}
      {drag && puzzle.allowRotation ? (
        <button
          type="button"
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
            rotate()
          }}
          className="fixed right-4 bottom-1/3 z-50 rounded-full bg-white/90 px-5 py-4 text-base font-bold text-slate-900 shadow-lg"
        >
          Rotate
        </button>
      ) : null}
    </div>
  )
}
