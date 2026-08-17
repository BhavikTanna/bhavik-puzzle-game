import { memo } from 'react'
import { bounds } from '../game/polyomino'
import type { BrickCell } from '../game/types'
import { BRICK_COLOURS } from './palette'

interface Props {
  /** Cells already rotated into their display orientation. */
  cells: BrickCell[]
  colour: number
  cellSize: number
  /** Dims the brick and disables its shadow, for the board's drag preview. */
  ghost?: boolean
  lifted?: boolean
  className?: string
  style?: React.CSSProperties
  onPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void
}

/**
 * Renders one brick as a block of tiles. Sides that face outwards get a heavy
 * border and sides shared with a neighbouring tile of the same brick get a
 * hairline, which is what makes a polyomino read as a single object.
 */
function BrickViewImpl({
  cells,
  colour,
  cellSize,
  ghost = false,
  lifted = false,
  className = '',
  style,
  onPointerDown,
}: Props) {
  const { rows, cols } = bounds(cells)
  const palette = BRICK_COLOURS[colour % BRICK_COLOURS.length]
  const filled = new Set(cells.map((cell) => `${cell.r},${cell.c}`))
  const has = (r: number, c: number) => filled.has(`${r},${c}`)

  return (
    <div
      className={`touch-none ${ghost ? 'opacity-40' : ''} ${className}`}
      style={{
        // Positioning lives in the style object, not a class: the board places
        // bricks absolutely, and a caller's `absolute` class cannot reliably
        // beat a `relative` class here (CSS order decides, not class order).
        position: 'relative',
        width: cols * cellSize,
        height: rows * cellSize,
        filter: ghost || lifted ? undefined : 'drop-shadow(0 3px 0 rgba(0,0,0,0.35))',
        ...style,
      }}
      onPointerDown={onPointerDown}
    >
      {cells.map((cell) => {
        const edges = [
          has(cell.r - 1, cell.c) ? 'border-t-[1px]' : 'border-t-[3px]',
          has(cell.r, cell.c + 1) ? 'border-r-[1px]' : 'border-r-[3px]',
          has(cell.r + 1, cell.c) ? 'border-b-[1px]' : 'border-b-[3px]',
          has(cell.r, cell.c - 1) ? 'border-l-[1px]' : 'border-l-[3px]',
        ].join(' ')

        // Only corners on the brick's silhouette get rounded.
        const radius = [
          !has(cell.r - 1, cell.c) && !has(cell.r, cell.c - 1) ? 'rounded-tl-lg' : '',
          !has(cell.r - 1, cell.c) && !has(cell.r, cell.c + 1) ? 'rounded-tr-lg' : '',
          !has(cell.r + 1, cell.c) && !has(cell.r, cell.c + 1) ? 'rounded-br-lg' : '',
          !has(cell.r + 1, cell.c) && !has(cell.r, cell.c - 1) ? 'rounded-bl-lg' : '',
        ].join(' ')

        return (
          <div
            key={`${cell.r},${cell.c}`}
            className={`absolute grid place-items-center font-bold select-none ${palette.face} ${palette.edge} ${palette.text} ${edges} ${radius}`}
            style={{
              top: cell.r * cellSize,
              left: cell.c * cellSize,
              width: cellSize,
              height: cellSize,
              fontSize: Math.round(cellSize * 0.46),
            }}
          >
            {cell.letter}
          </div>
        )
      })}
    </div>
  )
}

export const BrickView = memo(BrickViewImpl)
