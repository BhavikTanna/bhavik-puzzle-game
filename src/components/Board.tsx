import { rotated } from '../game/polyomino'
import type { Brick, DragState, PlacementMap, Puzzle } from '../game/types'
import { BrickView } from './BrickView'

interface Props {
  puzzle: Puzzle
  placements: PlacementMap
  cellSize: number
  drag: DragState | null
  solved: boolean[]
  boardRef: React.RefObject<HTMLDivElement | null>
  onBrickPointerDown: (brick: Brick, event: React.PointerEvent<HTMLDivElement>) => void
}

export function Board({
  puzzle,
  placements,
  cellSize,
  drag,
  solved,
  boardRef,
  onBrickPointerDown,
}: Props) {
  const draggedBrick = drag ? puzzle.bricks.find((b) => b.id === drag.brickId) : undefined
  // Only illegal drops need an outline: a legal one is shown by the brick
  // itself snapping into the grid.
  const rejectedCells =
    drag && draggedBrick && drag.target && !drag.valid
      ? rotated(draggedBrick.cells, drag.rotation).map((cell) => ({
          r: drag.target!.r + cell.r,
          c: drag.target!.c + cell.c,
        }))
      : []

  return (
    <div
      ref={boardRef}
      className="relative rounded-2xl bg-slate-950/40 ring-1 ring-white/10"
      style={{ width: puzzle.cols * cellSize, height: puzzle.rows * cellSize }}
    >
      {/* Empty sockets: one per playable square. */}
      {puzzle.solution.map((row, r) =>
        row.map((letter, c) =>
          letter === null ? null : (
            <div
              key={`socket-${r}-${c}`}
              className={`absolute rounded-md border border-white/5 bg-white/5 ${
                solved[r] ? 'solved-row' : ''
              }`}
              style={{
                top: r * cellSize + 2,
                left: c * cellSize + 2,
                width: cellSize - 4,
                height: cellSize - 4,
              }}
            />
          ),
        ),
      )}

      {/* A finished row gets a soft glow behind the bricks. */}
      {solved.map((isSolved, r) =>
        isSolved ? (
          <div
            key={`glow-${r}`}
            className="pointer-events-none absolute rounded-lg bg-emerald-400/20 ring-2 ring-emerald-300/50"
            style={{ top: r * cellSize, left: 0, width: puzzle.cols * cellSize, height: cellSize }}
          />
        ) : null,
      )}

      {puzzle.bricks.map((brick) => {
        const placement = placements[brick.id]
        if (!placement || brick.id === drag?.brickId) return null
        return (
          <BrickView
            key={brick.id}
            cells={rotated(brick.cells, placement.rotation)}
            colour={brick.colour}
            cellSize={cellSize}
            className="cursor-grab active:cursor-grabbing"
            style={{
              position: 'absolute',
              top: placement.r * cellSize,
              left: placement.c * cellSize,
            }}
            onPointerDown={(event) => onBrickPointerDown(brick, event)}
          />
        )
      })}

      {rejectedCells.map((cell) => (
        <div
          key={`rejected-${cell.r}-${cell.c}`}
          className="pointer-events-none absolute rounded-md border-2 border-rose-400 bg-rose-400/20"
          style={{
            top: cell.r * cellSize + 1,
            left: cell.c * cellSize + 1,
            width: cellSize - 2,
            height: cellSize - 2,
          }}
        />
      ))}
    </div>
  )
}
