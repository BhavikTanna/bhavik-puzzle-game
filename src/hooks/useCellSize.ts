import { useEffect, useState, type RefObject } from 'react'

interface Options {
  min?: number
  max?: number
}

/**
 * Largest tile size that fits a `rows` x `cols` board into a box, clamped.
 *
 * Pure and exported so the responsive behaviour is testable without a DOM —
 * an off-by-a-padding here is what pushes the last column off screen.
 */
export function fitCellSize(
  width: number,
  height: number,
  rows: number,
  cols: number,
  { min = 22, max = 72 }: Options = {},
): number {
  const fitted = Math.floor(Math.min(width / cols, height / rows))
  return Math.max(min, Math.min(max, fitted))
}

/**
 * Size the board's tiles to fill whatever space its container has.
 *
 * The container is a flex child whose height comes from its siblings, not from
 * the board, so measuring it cannot feed back into the size we compute here.
 * Sizing off both dimensions is what lets a tall, narrow phone and a wide
 * desktop use the same layout.
 */
export function useCellSize(
  containerRef: RefObject<HTMLElement | null>,
  rows: number,
  cols: number,
  { min = 22, max = 72 }: Options = {},
): number {
  const [size, setSize] = useState(40)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const measure = () => {
      // The element carries no padding of its own, so the border box this
      // reports is also its content box.
      const { width, height } = element.getBoundingClientRect()
      if (width === 0 || height === 0) return
      setSize(fitCellSize(width, height, rows, cols, { min, max }))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    // Catches viewport chrome changes on mobile that do not resize the element.
    window.addEventListener('orientationchange', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('orientationchange', measure)
    }
  }, [containerRef, rows, cols, min, max])

  return size
}

/**
 * Tile size for bricks sitting in the tray.
 *
 * Deliberately derived from the viewport alone rather than from the board's
 * cell size: the tray's height is part of what leaves room for the board, so
 * tying the two together would make each one's size depend on the other's.
 */
export function useTrayCellSize(): number {
  const [size, setSize] = useState(40)

  useEffect(() => {
    const update = () => {
      const width = window.innerWidth
      // On a short viewport every pixel the tray takes comes out of the
      // board's tile size, so tray tiles shrink first. Matches the `short:`
      // variant's breakpoint in index.css.
      if (window.innerHeight <= 700) {
        setSize(28)
        return
      }
      setSize(width < 400 ? 34 : width < 640 ? 38 : 44)
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  return size
}
