export type DiffOp = 'equal' | 'add' | 'remove'

export interface DiffLine {
  op: DiffOp
  text: string
}

/**
 * Simple line-based diff using LCS. Returns a flat sequence of equal/add/remove
 * operations suitable for rendering as a unified diff.
 */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split('\n')
  const b = after.split('\n')
  const n = a.length
  const m = b.length

  // Build LCS length table
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const result: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ op: 'equal', text: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ op: 'remove', text: a[i] })
      i++
    } else {
      result.push({ op: 'add', text: b[j] })
      j++
    }
  }
  while (i < n) {
    result.push({ op: 'remove', text: a[i] })
    i++
  }
  while (j < m) {
    result.push({ op: 'add', text: b[j] })
    j++
  }
  return result
}

/** Convenience: true when the two texts are byte-identical. */
export function hasChanges(before: string, after: string): boolean {
  return before !== after
}
