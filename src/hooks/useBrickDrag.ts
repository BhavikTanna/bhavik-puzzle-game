import { useCallback, useEffect, useRef, useState } from 'react'
import { buildBoard, canPlace } from '../game/engine'
import { bounds, rotated } from '../game/polyomino'
import type { Brick, DragState, PlacementMap, Puzzle, Rotation } from '../game/types'

interface Options {
  puzzle: Puzzle
  placements: PlacementMap
  setPlacements: React.Dispatch<React.SetStateAction<PlacementMap>>
  cellSize: number
  boardRef: React.RefObject<HTMLDivElement | null>
}

/** How far outside the board the pointer may stray and still target a cell. */
const BOARD_SLOP = 1.5

export function useBrickDrag({ puzzle, placements, setPlacements, cellSize, boardRef }: Options) {
  const [drag, setDrag] = useState<DragState | null>(null)

  // Window listeners need the live values, not the ones captured when the
  // listener was attached, so everything mutable is mirrored into a ref.
  const dragRef = useRef<DragState | null>(null)
  const latest = useRef({ puzzle, placements, cellSize })
  latest.current = { puzzle, placements, cellSize }

  const apply = useCallback((next: DragState | null) => {
    dragRef.current = next
    setDrag(next)
  }, [])

  /** Recompute the hovered board cell and whether dropping there is legal. */
  const withTarget = useCallback(
    (state: DragState, x: number, y: number): DragState => {
      const { puzzle: p, placements: pl, cellSize: size } = latest.current
      const rect = boardRef.current?.getBoundingClientRect()
      const brick = p.bricks.find((b) => b.id === state.brickId)
      if (!rect || !brick) return { ...state, x, y, target: null, valid: false }

      const base = { ...state, x, y, boardX: rect.left, boardY: rect.top }

      // Hit test against the lifted position, so a touch drag lands the brick
      // where it is drawn rather than under the fingertip.
      const aimY = y - state.lift

      const withinSlop =
        x >= rect.left - size * BOARD_SLOP &&
        x <= rect.right + size * BOARD_SLOP &&
        aimY >= rect.top - size * BOARD_SLOP &&
        aimY <= rect.bottom + size * BOARD_SLOP
      if (!withinSlop) return { ...base, target: null, valid: false }

      const r = Math.floor((aimY - rect.top) / size) - state.grabR
      const c = Math.floor((x - rect.left) / size) - state.grabC
      // The dragged brick is out of `placements` already, so it cannot block itself.
      const board = buildBoard(p, pl)
      return {
        ...base,
        target: { r, c },
        valid: canPlace(p, board, brick, r, c, state.rotation),
      }
    },
    [boardRef],
  )

  const startDrag = useCallback(
    (
      brick: Brick,
      event: React.PointerEvent<HTMLDivElement>,
      /**
       * Tile size of the element being grabbed. The tray draws bricks smaller
       * than the board does, and the grabbed cell has to be worked out at the
       * scale actually on screen. Cell indices are scale-free, so the brick
       * still lifts to board scale correctly.
       */
      sourceCellSize?: number,
    ) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return
      event.preventDefault()

      const { placements: pl, cellSize: size } = latest.current
      const grabSize = sourceCellSize ?? size
      const existing = pl[brick.id]
      const rotation: Rotation = existing?.rotation ?? 0
      const cells = rotated(brick.cells, rotation)

      const rect = event.currentTarget.getBoundingClientRect()
      const rawR = Math.floor((event.clientY - rect.top) / grabSize)
      const rawC = Math.floor((event.clientX - rect.left) / grabSize)
      // The pointer may have landed in a notch of the polyomino; snap the grab
      // to the nearest cell the brick actually occupies.
      const grab = cells.reduce((best, cell) => {
        const d = Math.abs(cell.r - rawR) + Math.abs(cell.c - rawC)
        const bd = Math.abs(best.r - rawR) + Math.abs(best.c - rawC)
        return d < bd ? cell : best
      }, cells[0])

      if (existing) {
        setPlacements((prev) => {
          const next = { ...prev }
          delete next[brick.id]
          return next
        })
      }

      document.body.classList.add('dragging')
      apply(
        withTarget(
          {
            brickId: brick.id,
            rotation,
            grabR: grab.r,
            grabC: grab.c,
            x: event.clientX,
            y: event.clientY,
            target: null,
            valid: false,
            boardX: 0,
            boardY: 0,
            origin: existing ? 'board' : 'tray',
            lift: event.pointerType === 'mouse' ? 0 : Math.round(size * 1.1),
          },
          event.clientX,
          event.clientY,
        ),
      )
    },
    [apply, setPlacements, withTarget],
  )

  const rotate = useCallback(() => {
    const state = dragRef.current
    if (!state || !latest.current.puzzle.allowRotation) return
    const brick = latest.current.puzzle.bricks.find((b) => b.id === state.brickId)
    if (!brick) return

    // Rotating clockwise maps (r, c) -> (c, rows - 1 - r); the grabbed cell has
    // to travel with it, or the brick jumps out from under the pointer.
    const { rows } = bounds(rotated(brick.cells, state.rotation))
    apply(
      withTarget(
        {
          ...state,
          rotation: (((state.rotation + 1) % 4) as Rotation),
          grabR: state.grabC,
          grabC: rows - 1 - state.grabR,
        },
        state.x,
        state.y,
      ),
    )
  }, [apply, withTarget])

  const cancel = useCallback(() => {
    document.body.classList.remove('dragging')
    apply(null)
  }, [apply])

  const isDragging = drag !== null

  useEffect(() => {
    if (!isDragging) return

    const onMove = (event: PointerEvent) => {
      const state = dragRef.current
      if (!state) return
      event.preventDefault()
      apply(withTarget(state, event.clientX, event.clientY))
    }

    const onUp = () => {
      const state = dragRef.current
      if (state?.target && state.valid) {
        setPlacements((prev) => ({
          ...prev,
          [state.brickId]: { r: state.target!.r, c: state.target!.c, rotation: state.rotation },
        }))
      }
      // An invalid drop simply leaves the brick out of `placements`, which
      // returns it to the tray.
      cancel()
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'r' || event.key === 'R') {
        event.preventDefault()
        rotate()
      } else if (event.key === 'Escape') {
        cancel()
      }
    }

    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', onKey)
    }
  }, [isDragging, apply, cancel, rotate, setPlacements, withTarget])

  // Never leave the body stuck in its dragging state if we unmount mid-drag.
  useEffect(() => () => document.body.classList.remove('dragging'), [])

  return { drag, startDrag, rotate }
}
