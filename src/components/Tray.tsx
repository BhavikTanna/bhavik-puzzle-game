import { bounds, rotated } from '../game/polyomino'
import type { Brick, PlacementMap, Puzzle } from '../game/types'
import { BrickView } from './BrickView'

/** Room for the horizontal scrollbar, so it cannot clip the bottom row. */
const SCROLLBAR_ALLOWANCE = 12

interface Props {
  puzzle: Puzzle
  placements: PlacementMap
  /** Tray tiles are drawn smaller than the board's; a brick grows when lifted. */
  cellSize: number
  draggingId: string | null
  /** Shown in place of the bricks once the puzzle is solved. */
  banner?: React.ReactNode
  onBrickPointerDown: (
    brick: Brick,
    event: React.PointerEvent<HTMLDivElement>,
    sourceCellSize: number,
  ) => void
}

export function Tray({
  puzzle,
  placements,
  cellSize,
  draggingId,
  banner,
  onBrickPointerDown,
}: Props) {
  // Keep bricks in puzzle order so they do not shuffle around as you play, and
  // keep the dragged brick in place (dimmed) so the tray does not reflow mid-drag.
  const bricks = puzzle.bricks.filter((brick) => !placements[brick.id])
  const tallestBrick = Math.max(...puzzle.bricks.map((brick) => bounds(brick.cells).rows))

  return (
    <div
      className="game-tray flex min-h-0 flex-col border-t border-white/10 bg-white/5 px-3 pt-2"
      // Clears the iOS home indicator without eating space on other devices.
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
    >
      <div className="mb-1.5 flex shrink-0 items-baseline justify-between gap-3">
        <h2 className="text-[0.7rem] font-semibold tracking-widest text-slate-400 uppercase">
          Bricks
        </h2>
        <span className="truncate text-xs text-slate-500">
          {banner ? '' : `${bricks.length} left`}
          {!banner && puzzle.allowRotation && bricks.length > 0 ? ' · R to rotate' : ''}
        </span>
      </div>

      {banner ? (
        banner
      ) : (
        // A single scrolling rail at every size: predictable, and its height
        // never changes as bricks leave, so the board is never resized mid-game.
        // Sized by the puzzle's tallest brick — not the tallest remaining one,
        // for that same reason — but capped at the space actually available, so
        // a cramped landscape panel scrolls instead of clipping a brick in half.
        <div
          className="flex min-h-0 flex-1 snap-x gap-3 overflow-auto overscroll-contain"
          style={{ maxHeight: tallestBrick * cellSize + SCROLLBAR_ALLOWANCE }}
        >
          {bricks.map((brick) => (
            <BrickView
              key={brick.id}
              cells={rotated(brick.cells, 0)}
              colour={brick.colour}
              cellSize={cellSize}
              lifted={brick.id === draggingId}
              className={`shrink-0 snap-start cursor-grab self-start active:cursor-grabbing ${
                brick.id === draggingId ? 'opacity-25' : 'animate-pop'
              }`}
              onPointerDown={(event) => onBrickPointerDown(brick, event, cellSize)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
