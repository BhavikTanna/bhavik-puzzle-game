/**
 * Face / edge / text classes per palette slot, indexed by `Brick.colour`.
 * The carve assigns these by graph colouring, so touching bricks differ.
 */
export const BRICK_COLOURS = [
  { face: 'bg-amber-400', edge: 'border-amber-600', text: 'text-amber-950' },
  { face: 'bg-teal-400', edge: 'border-teal-600', text: 'text-teal-950' },
  { face: 'bg-rose-400', edge: 'border-rose-600', text: 'text-rose-950' },
  { face: 'bg-sky-400', edge: 'border-sky-600', text: 'text-sky-950' },
  { face: 'bg-lime-400', edge: 'border-lime-600', text: 'text-lime-950' },
  { face: 'bg-violet-400', edge: 'border-violet-600', text: 'text-violet-950' },
] as const
