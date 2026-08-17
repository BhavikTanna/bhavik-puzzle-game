import type { PlacementMap } from './types'

const KEY = 'brickwords:v1'

/** Puzzle id -> the placements the player has made so far. */
export type Progress = Record<string, PlacementMap>

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Progress) : {}
  } catch {
    // Private browsing, disabled storage, or corrupt JSON: start fresh.
    return {}
  }
}

export function saveProgress(progress: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress))
  } catch {
    // Progress is a convenience, not a requirement.
  }
}
