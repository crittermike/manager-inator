/**
 * Reconcile raw names from AI/transcripts against known people.
 *
 * Captures often misspell names ("Rita" for "Rayta", "Sigfried" for "Sigfrid",
 * "Catherine" for "Kathryn"). Without reconciliation, slugifying these raw
 * names produces orphaned `people/<misspelled>.md` entries unrelated to the
 * actual person. This utility resolves each raw name to a known person when
 * possible, returning the canonical name plus a confidence marker.
 *
 * Strategy, in order (first match wins for a given raw name):
 *   1. Exact case-insensitive match against `name` or any alias.
 *   2. Unique first-name match (only one known person shares that first name).
 *   3. Fuzzy match by Levenshtein distance — ≤2 for short names, ≤3 for ≥6 chars.
 *      If two known people tie for closest, no match is returned (don't guess).
 */

export type MatchConfidence = 'exact' | 'alias' | 'first-name' | 'fuzzy' | 'ai' | 'none'

export interface ReconcileResult {
  /** The original raw name (preserves casing). */
  raw: string
  /** Canonical display name when matched, else `raw`. */
  name: string
  /** Slug of the matched person, when matched. */
  matchedSlug?: string
  /** How the match was made. */
  confidence: MatchConfidence
}

export interface KnownPerson {
  name: string
  slug: string
  aliases: string[]
}

function norm(s: string): string {
  return s.trim().toLowerCase()
}

function firstName(s: string): string {
  return norm(s).split(/\s+/)[0] || ''
}

/** Levenshtein distance with early exit when candidate exceeds `cutoff`. */
function levenshtein(a: string, b: string, cutoff: number): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > cutoff) return cutoff + 1
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m

  let prev = new Array(n + 1)
  let curr = new Array(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j

  for (let i = 1; i <= m; i++) {
    curr[0] = i
    let rowMin = curr[0]
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      curr[j] = Math.min(
        curr[j - 1] + 1,      // insert
        prev[j] + 1,          // delete
        prev[j - 1] + cost,   // substitute
      )
      if (curr[j] < rowMin) rowMin = curr[j]
    }
    if (rowMin > cutoff) return cutoff + 1
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]
}

function fuzzyCutoff(rawLen: number): number {
  return rawLen >= 6 ? 3 : 2
}

/**
 * Reconcile a list of raw names against known people.
 * Order of input is preserved. Duplicate raw names produce duplicate results.
 */
export function reconcileNames(
  rawNames: string[],
  knownPeople: KnownPerson[],
): ReconcileResult[] {
  const results: ReconcileResult[] = []

  // Build lookup tables once.
  const byName = new Map<string, KnownPerson>()
  const byAlias = new Map<string, KnownPerson>()
  const byFirstName = new Map<string, KnownPerson[]>()
  for (const p of knownPeople) {
    byName.set(norm(p.name), p)
    for (const a of p.aliases) {
      const na = norm(a)
      if (na) byAlias.set(na, p)
    }
    const fn = firstName(p.name)
    if (fn) {
      const list = byFirstName.get(fn) ?? []
      list.push(p)
      byFirstName.set(fn, list)
    }
  }

  for (const raw of rawNames) {
    const trimmed = raw.trim()
    if (!trimmed) {
      results.push({ raw, name: raw, confidence: 'none' })
      continue
    }
    const key = norm(trimmed)

    // 1. Exact name
    const exact = byName.get(key)
    if (exact) {
      results.push({ raw: trimmed, name: exact.name, matchedSlug: exact.slug, confidence: 'exact' })
      continue
    }

    // 2. Alias
    const alias = byAlias.get(key)
    if (alias) {
      results.push({ raw: trimmed, name: alias.name, matchedSlug: alias.slug, confidence: 'alias' })
      continue
    }

    // 3. Unique first name
    const fnKey = firstName(trimmed)
    const fnCandidates = byFirstName.get(fnKey)
    if (fnCandidates && fnCandidates.length === 1) {
      const p = fnCandidates[0]
      results.push({ raw: trimmed, name: p.name, matchedSlug: p.slug, confidence: 'first-name' })
      continue
    }

    // 4. Fuzzy by Levenshtein on full name AND first name. Tie => no match.
    const cutoff = fuzzyCutoff(trimmed.length)
    let best: { person: KnownPerson; dist: number } | null = null
    let tied = false
    for (const p of knownPeople) {
      const candidates = [norm(p.name), firstName(p.name), ...p.aliases.map(norm)]
      let minDist = cutoff + 1
      for (const c of candidates) {
        if (!c) continue
        const d = levenshtein(key, c, cutoff)
        if (d < minDist) minDist = d
        // Also check first-name-of-raw vs candidate (handles "Rita Smith" vs "Rayta")
        if (fnKey && fnKey !== key) {
          const d2 = levenshtein(fnKey, c, cutoff)
          if (d2 < minDist) minDist = d2
        }
      }
      if (minDist > cutoff) continue
      if (!best || minDist < best.dist) {
        best = { person: p, dist: minDist }
        tied = false
      } else if (minDist === best.dist && p.slug !== best.person.slug) {
        tied = true
      }
    }

    if (best && !tied) {
      results.push({ raw: trimmed, name: best.person.name, matchedSlug: best.person.slug, confidence: 'fuzzy' })
    } else {
      results.push({ raw: trimmed, name: trimmed, confidence: 'none' })
    }
  }

  return results
}

/**
 * Convenience: given reconcile results, return `[slug, rawSpelling]` pairs
 * for matches whose raw spelling differs from the canonical name AND isn't
 * already in the known person's alias list. Used by capture flow to enrich
 * `aliases:` frontmatter so the same misspelling auto-resolves next time.
 */
export function aliasAdditionsFromResults(
  results: ReconcileResult[],
  knownPeople: KnownPerson[],
): { slug: string; alias: string }[] {
  const bySlug = new Map(knownPeople.map(p => [p.slug, p]))
  const out: { slug: string; alias: string }[] = []
  const seen = new Set<string>()
  for (const r of results) {
    if (!r.matchedSlug) continue
    if (norm(r.raw) === norm(r.name)) continue
    const known = bySlug.get(r.matchedSlug)
    if (!known) continue
    const aliasLower = norm(r.raw)
    if (norm(known.name) === aliasLower) continue
    if (known.aliases.some(a => norm(a) === aliasLower)) continue
    const dedupKey = `${r.matchedSlug}::${aliasLower}`
    if (seen.has(dedupKey)) continue
    seen.add(dedupKey)
    out.push({ slug: r.matchedSlug, alias: r.raw.trim() })
  }
  return out
}
