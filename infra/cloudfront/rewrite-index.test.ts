import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Loads and evaluates the real function source, rather than a copy of the
 * logic. If the deployed file and the tested behaviour ever drift, the URL
 * quietly starts serving the CV instead of the game — so the artifact itself
 * is what gets tested.
 */
const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'rewrite-index.js'),
  'utf8',
)
const handler = new Function(`${source}; return handler`)() as (event: {
  request: { uri: string }
}) => { uri: string }

const rewrite = (uri: string) => handler({ request: { uri } }).uri

describe('rewrite-index CloudFront Function', () => {
  it('resolves the bare path to the game, not the CV', () => {
    // The whole point: without this, the distribution's catch-all wins.
    expect(rewrite('/brickwords')).toBe('/brickwords/index.html')
    expect(rewrite('/brickwords/')).toBe('/brickwords/index.html')
  })

  it('passes real files through untouched', () => {
    expect(rewrite('/brickwords/index.html')).toBe('/brickwords/index.html')
    expect(rewrite('/brickwords/assets/index-a1b2c3.js')).toBe(
      '/brickwords/assets/index-a1b2c3.js',
    )
    expect(rewrite('/brickwords/assets/index-a1b2c3.css')).toBe(
      '/brickwords/assets/index-a1b2c3.css',
    )
  })

  it('never rewrites a path twice', () => {
    expect(rewrite(rewrite('/brickwords'))).toBe('/brickwords/index.html')
  })

  it('handles a nested directory-style path', () => {
    expect(rewrite('/brickwords/puzzles')).toBe('/brickwords/puzzles/index.html')
  })

  it('leaves a dotted filename in a nested directory alone', () => {
    expect(rewrite('/brickwords/sub/favicon.ico')).toBe('/brickwords/sub/favicon.ico')
  })

  it('uses only syntax the CloudFront Functions runtime supports', () => {
    // Comments are stripped first: prose is free to say "endsWith" or use
    // backticks, it is the executable syntax that has to stay ES5.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

    // Runtime 1.0 is ES5.1: no endsWith/includes/startsWith, no let/const,
    // arrow functions or template literals.
    expect(code).not.toMatch(/\b(endsWith|includes|startsWith)\s*\(/)
    expect(code).not.toMatch(/^\s*(let|const)\s/m)
    expect(code).not.toMatch(/=>/)
    expect(code).not.toMatch(/`/)

    // Guard against the strip regex silently eating everything.
    expect(code).toMatch(/function handler\s*\(/)
  })
})
