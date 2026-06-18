import { describe, it, expect } from 'vitest'
import { reconcileNames, aliasAdditionsFromResults, type KnownPerson } from '../../src/renderer/utils/reconcileNames'

const known: KnownPerson[] = [
  { name: 'Rayta Smith', slug: 'rayta', aliases: ['Ray'] },
  { name: 'Steven Park', slug: 'steven', aliases: [] },
  { name: 'Kathryn Lee', slug: 'kathryn', aliases: ['Kate'] },
  { name: 'Mike Chen', slug: 'mike', aliases: [] },
]

describe('reconcileNames', () => {
  it('matches exact case-insensitively', () => {
    const [r] = reconcileNames(['rayta smith'], known)
    expect(r).toMatchObject({ name: 'Rayta Smith', matchedSlug: 'rayta', confidence: 'exact' })
  })

  it('matches by alias', () => {
    const [r] = reconcileNames(['Kate'], known)
    expect(r.matchedSlug).toBe('kathryn')
    expect(r.confidence).toBe('alias')
    expect(r.name).toBe('Kathryn Lee')
  })

  it('matches by unique first name', () => {
    const [r] = reconcileNames(['Mike'], known)
    expect(r.matchedSlug).toBe('mike')
    expect(r.confidence).toBe('first-name')
  })

  it('matches Rita to Rayta via fuzzy (Levenshtein)', () => {
    const [r] = reconcileNames(['Rita'], known)
    expect(r.matchedSlug).toBe('rayta')
    expect(r.confidence).toBe('fuzzy')
    expect(r.raw).toBe('Rita')
    expect(r.name).toBe('Rayta Smith')
  })

  it('does not guess when two candidates tie', () => {
    const ambiguous: KnownPerson[] = [
      { name: 'Steve', slug: 'steve', aliases: [] },
      { name: 'Steven', slug: 'steven', aliases: [] },
    ]
    const [r] = reconcileNames(['Stevn'], ambiguous)
    expect(r.matchedSlug).toBeUndefined()
    expect(r.confidence).toBe('none')
  })

  it('returns "none" for unknown person', () => {
    const [r] = reconcileNames(['Zebedee Xenophon'], known)
    expect(r.matchedSlug).toBeUndefined()
    expect(r.confidence).toBe('none')
    expect(r.name).toBe('Zebedee Xenophon')
  })

  it('preserves input order and handles empty input', () => {
    expect(reconcileNames([], known)).toEqual([])
    const out = reconcileNames(['Mike', 'Kate'], known)
    expect(out.map(r => r.matchedSlug)).toEqual(['mike', 'kathryn'])
  })

  it('does not match by first-name when multiple known people share that first name', () => {
    const sameFirst: KnownPerson[] = [
      { name: 'Mike Chen', slug: 'mike-chen', aliases: [] },
      { name: 'Mike Park', slug: 'mike-park', aliases: [] },
    ]
    const [r] = reconcileNames(['Mike'], sameFirst)
    // exact match against an unambiguous full name is fine, but a bare first
    // name with two known people sharing it should not auto-resolve.
    expect(r.confidence).toBe('none')
  })
})

describe('aliasAdditionsFromResults', () => {
  it('returns raw spelling for matches whose canonical differs', () => {
    const results = reconcileNames(['Rita'], known)
    const out = aliasAdditionsFromResults(results, known)
    expect(out).toEqual([{ slug: 'rayta', alias: 'Rita' }])
  })

  it('skips when raw equals canonical', () => {
    const results = reconcileNames(['Rayta Smith'], known)
    expect(aliasAdditionsFromResults(results, known)).toEqual([])
  })

  it('skips when alias already exists', () => {
    const results = reconcileNames(['Ray'], known)
    expect(aliasAdditionsFromResults(results, known)).toEqual([])
  })

  it('dedupes the same misspelling', () => {
    const results = reconcileNames(['Rita', 'rita'], known)
    expect(aliasAdditionsFromResults(results, known)).toHaveLength(1)
  })

  it('skips unmatched results', () => {
    const results = reconcileNames(['Zebedee'], known)
    expect(aliasAdditionsFromResults(results, known)).toEqual([])
  })
})
