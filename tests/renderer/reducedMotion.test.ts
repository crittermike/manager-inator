import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

describe('prefers-reduced-motion', () => {
  const css = readFileSync(
    resolve(__dirname, '../../src/renderer/styles/globals.css'),
    'utf-8'
  )

  it('contains a prefers-reduced-motion media query', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('sets animation-duration to near-zero', () => {
    expect(css).toContain('animation-duration: 0.01ms !important')
  })

  it('limits animation-iteration-count to 1', () => {
    expect(css).toContain('animation-iteration-count: 1 !important')
  })

  it('sets transition-duration to near-zero', () => {
    expect(css).toContain('transition-duration: 0.01ms !important')
  })

  it('applies to all elements via universal selector', () => {
    const mediaBlock = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(mediaBlock).toContain('*, *::before, *::after')
  })
})
