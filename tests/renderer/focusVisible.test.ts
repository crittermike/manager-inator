import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

describe('focus-visible keyboard navigation styles', () => {
  const css = readFileSync(
    resolve(__dirname, '../../src/renderer/styles/globals.css'),
    'utf-8'
  )

  it('has a global :focus-visible rule', () => {
    expect(css).toContain(':focus-visible')
  })

  it('uses brand color for the focus outline', () => {
    expect(css).toContain('outline: 2px solid var(--color-brand)')
  })

  it('has outline-offset for visual separation', () => {
    expect(css).toContain('outline-offset: 2px')
  })

  it('does not set border-radius (browsers follow element shape natively)', () => {
    const focusBlock = css.slice(
      css.indexOf(':focus-visible {'),
      css.indexOf('}', css.indexOf(':focus-visible {')) + 1
    )
    expect(focusBlock).not.toContain('border-radius')
  })

  it('suppresses outline on text inputs but not checkboxes or radios', () => {
    expect(css).toContain('input:not([type="checkbox"]):not([type="radio"]):focus-visible')
    expect(css).toContain('textarea:focus-visible')
    expect(css).toContain('select:focus-visible')
    expect(css).toContain('[contenteditable]:focus-visible')
    expect(css).not.toMatch(/(?<!\:not\(\[type="checkbox"\]\)\:not\(\[type="radio"\]\))input:focus-visible[^,{]*\{[^}]*outline:\s*none/)
  })

  it('sets outline: none for suppressed elements', () => {
    const inputSuppressStart = css.indexOf('input:not([type="checkbox"])')
    const inputSuppressBlock = css.slice(
      inputSuppressStart,
      css.indexOf('}', inputSuppressStart) + 1
    )
    expect(inputSuppressBlock).toContain('outline: none')
  })
})
