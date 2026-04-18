import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/manager-inator-test-userdata' }
}))

vi.mock('../../src/main/store', () => ({
  getSettings: () => ({
    repoPath: '/dummy',
    repoOwner: '',
    githubToken: null,
    userName: 'Mike Crittenden',
    userGithub: 'mike',
    defaultModel: 'gpt-4.1',
    aiCustomInstructions: '',
    repoName: '',
  }),
}))

vi.mock('../../src/main/github', () => ({
  getReportProfile: vi.fn(),
  getFileContent: vi.fn(),
}))

import {
  parseGithubOwnerFromOrigin,
  isValidGithubUsername,
  isOneOnOneWith,
  extractSummary,
  extractTranscript,
  planWrites,
  __test,
} from '../../src/main/syncToReport'

describe('parseGithubOwnerFromOrigin', () => {
  it('parses HTTPS GitHub URLs with .git suffix', () => {
    expect(parseGithubOwnerFromOrigin('https://github.com/crittermike/manager-inator.git')).toBe('crittermike')
  })
  it('parses HTTPS GitHub URLs without .git suffix', () => {
    expect(parseGithubOwnerFromOrigin('https://github.com/crittermike/manager-inator')).toBe('crittermike')
  })
  it('parses HTTPS GitHub URLs with embedded credentials', () => {
    expect(parseGithubOwnerFromOrigin('https://x-access-token:abc@github.com/myorg/repo.git')).toBe('myorg')
  })
  it('parses SSH GitHub URLs', () => {
    expect(parseGithubOwnerFromOrigin('git@github.com:crittermike/manager-inator.git')).toBe('crittermike')
  })
  it('rejects non-GitHub hosts', () => {
    expect(parseGithubOwnerFromOrigin('https://gitlab.com/crittermike/repo.git')).toBeNull()
    expect(parseGithubOwnerFromOrigin('https://bitbucket.org/owner/repo.git')).toBeNull()
    expect(parseGithubOwnerFromOrigin('git@evil.example.com:owner/repo.git')).toBeNull()
  })
  it('rejects malformed input', () => {
    expect(parseGithubOwnerFromOrigin('')).toBeNull()
    expect(parseGithubOwnerFromOrigin('not a url')).toBeNull()
  })
})

describe('isValidGithubUsername', () => {
  it.each([
    ['crittermike', true],
    ['laser-lemon', true],
    ['a', true],
    ['a1b2c3', true],
    ['39chars-' + 'a'.repeat(40), false],  // 48 chars > 39 max
    ['', false],
    ['-leadinghyphen', false],
    ['trailinghyphen-', false],
    ['double--hyphen', false],
    ['has space', false],
    ['has/slash', false],
    ['has.dot', false],
    ['../etc/passwd', false],
  ])('isValidGithubUsername(%s) === %s', (input, expected) => {
    expect(isValidGithubUsername(input)).toBe(expected)
  })
})

describe('isOneOnOneWith', () => {
  const base = {
    source: 'meeting',
    currentUserName: 'Mike Crittenden',
    reportName: 'Steve Richert',
    reportAliases: [] as string[],
  }

  it('accepts exact {me, report} match', () => {
    expect(isOneOnOneWith({ ...base, speakers: ['Mike Crittenden', 'Steve Richert'] })).toBe(true)
  })

  it('accepts case-insensitive matches', () => {
    expect(isOneOnOneWith({ ...base, speakers: ['mike crittenden', 'STEVE RICHERT'] })).toBe(true)
  })

  it('accepts alias matches for the report', () => {
    expect(isOneOnOneWith({ ...base, reportAliases: ['Steve'], speakers: ['Mike Crittenden', 'Steve'] })).toBe(true)
  })

  it('strips parenthetical suffixes', () => {
    expect(isOneOnOneWith({ ...base, speakers: ['Mike Crittenden (Engineering Manager)', 'Steve Richert (Staff Engineer)'] })).toBe(true)
  })

  it('rejects when source is not "meeting"', () => {
    expect(isOneOnOneWith({ ...base, source: 'slack', speakers: ['Mike Crittenden', 'Steve Richert'] })).toBe(false)
    expect(isOneOnOneWith({ ...base, source: undefined, speakers: ['Mike Crittenden', 'Steve Richert'] })).toBe(false)
  })

  it('rejects team meetings (3+ speakers)', () => {
    // Regression: prevent leakage of team standups into a private 1:1 repo.
    expect(isOneOnOneWith({ ...base, speakers: ['Mike Crittenden', 'Steve Richert', 'Alice Smith'] })).toBe(false)
  })

  it('rejects solo meetings (1 speaker)', () => {
    expect(isOneOnOneWith({ ...base, speakers: ['Mike Crittenden'] })).toBe(false)
  })

  it('rejects when current user is not present', () => {
    expect(isOneOnOneWith({ ...base, speakers: ['Steve Richert', 'Alice Smith'] })).toBe(false)
  })

  it('rejects when the named report is not present', () => {
    expect(isOneOnOneWith({ ...base, speakers: ['Mike Crittenden', 'Alice Smith'] })).toBe(false)
  })

  it('handles duplicate speaker entries (case-insensitive dedup)', () => {
    expect(isOneOnOneWith({ ...base, speakers: ['Mike Crittenden', 'mike crittenden', 'Steve Richert'] })).toBe(true)
  })

  it('rejects when current user name is empty', () => {
    expect(isOneOnOneWith({ ...base, currentUserName: '', speakers: ['Mike Crittenden', 'Steve Richert'] })).toBe(false)
  })
})

describe('extractSummary / extractTranscript', () => {
  const sample = `---
title: 1:1 with Steve
source: meeting
speakers:
  - Mike Crittenden
  - Steve Richert
---

## Summary

We talked about the roadmap.

## Action items

- [ ] Steve to draft ADR

## Raw content

Mike: hey
Steve: hello
Mike: what's up`

  it('extracts everything before "## Raw content" with frontmatter stripped', () => {
    const summary = extractSummary(sample)
    expect(summary).toContain('## Summary')
    expect(summary).toContain('roadmap')
    expect(summary).toContain('## Action items')
    expect(summary).not.toContain('Mike: hey')
    expect(summary).not.toContain('---')
  })

  it('extracts transcript portion after "## Raw content"', () => {
    const transcript = extractTranscript(sample)
    expect(transcript).toContain("Mike: hey")
    expect(transcript).toContain("Steve: hello")
    expect(transcript).not.toContain('## Summary')
  })

  it('returns empty transcript when no "## Raw content" section', () => {
    expect(extractTranscript(`---\ntitle: x\n---\n\n## Summary\n\nContent only.`)).toBe('')
  })

  it('returns full body as summary when no "## Raw content" section', () => {
    expect(extractSummary(`---\ntitle: x\n---\n\nJust a summary.`)).toBe('Just a summary.')
  })
})

describe('planWrites — file mapping', () => {
  const baseOpts = {
    sourceRepoPath: '/src',
    slug: 'steve-richert',
    currentUserName: 'Mike Crittenden',
    reportName: 'Steve Richert',
    reportAliases: ['Steve'],
  }

  function makeContext(speakers: string[], date: string, title: string, summary: string, transcript = '') {
    const speakersBlock = speakers.length > 0 ? `speakers:\n${speakers.map(s => `  - ${s}`).join('\n')}\n` : ''
    return `---\ntitle: ${title}\nsource: meeting\n${speakersBlock}---\n\n## Summary\n\n${summary}\n\n## Raw content\n\n${transcript}\n`
  }

  it('mirrors check-ins and reviews with frontmatter stripped', () => {
    const writes = planWrites({
      ...baseOpts,
      readFile: (p) => {
        if (p.endsWith('check-ins/monthly/2026-02.md')) return `---\ndate: 2026-02-01\n---\n# Feb check-in\n\nGreat month.\n`
        if (p.endsWith('reviews/fy26-h1.md')) return `---\nperiod: fy26-h1\n---\n# H1 review\n\nGood.\n`
        return ''
      },
      listCheckins: () => ['2026-02.md'],
      listReviews: () => ['fy26-h1.md'],
      listContexts: () => [],
    })
    expect(writes).toEqual([
      { source: 'reports/steve-richert/check-ins/monthly/2026-02.md', dest: 'check-ins/2026-02.md', content: '# Feb check-in\n\nGreat month.\n' },
      { source: 'reports/steve-richert/reviews/fy26-h1.md', dest: 'reviews/fy26-h1.md', content: '# H1 review\n\nGood.\n' },
    ])
  })

  it('emits summary AND transcript for a 1:1 context', () => {
    const writes = planWrites({
      ...baseOpts,
      readFile: () => makeContext(['Mike Crittenden', 'Steve Richert'], '2026-04-10', '1:1', 'Talked about roadmap.', 'Mike: hi\nSteve: hello'),
      listCheckins: () => [],
      listReviews: () => [],
      listContexts: () => ['2026-04-10-1-1.md'],
    })
    expect(writes.map(w => w.dest)).toEqual(['summaries/2026-04-10.md', 'transcripts/2026-04-10.md'])
    expect(writes[0].content).toContain('Talked about roadmap.')
    expect(writes[1].content).toContain('Mike: hi')
  })

  it('REGRESSION: excludes team standups (3+ attendees) from sync', () => {
    const writes = planWrites({
      ...baseOpts,
      readFile: () => makeContext(['Mike Crittenden', 'Steve Richert', 'Alice Smith'], '2026-04-10', 'team standup', 'Standup notes.'),
      listCheckins: () => [],
      listReviews: () => [],
      listContexts: () => ['2026-04-10-team-standup.md'],
    })
    expect(writes).toEqual([])
  })

  it('excludes 1:1s with a different report', () => {
    const writes = planWrites({
      ...baseOpts,
      readFile: () => makeContext(['Mike Crittenden', 'Alice Smith'], '2026-04-10', '1:1 with Alice', 'Alice notes.'),
      listCheckins: () => [],
      listReviews: () => [],
      listContexts: () => ['2026-04-10-1-1-alice.md'],
    })
    expect(writes).toEqual([])
  })

  it('REGRESSION: same-date 1:1s get stable -2 / -3 suffixes for both summary and transcript', () => {
    const files = ['2026-04-10-1-1-morning.md', '2026-04-10-1-1-afternoon.md']
    const writes = planWrites({
      ...baseOpts,
      readFile: (p) => {
        if (p.includes('morning')) return makeContext(['Mike Crittenden', 'Steve Richert'], '2026-04-10', 'Morning', 'AM notes.', 'AM transcript')
        if (p.includes('afternoon')) return makeContext(['Mike Crittenden', 'Steve Richert'], '2026-04-10', 'Afternoon', 'PM notes.', 'PM transcript')
        return ''
      },
      listCheckins: () => [],
      listReviews: () => [],
      listContexts: () => files,
    })

    // Two summaries + two transcripts
    expect(writes.map(w => w.dest).sort()).toEqual([
      'summaries/2026-04-10-2.md',
      'summaries/2026-04-10.md',
      'transcripts/2026-04-10-2.md',
      'transcripts/2026-04-10.md',
    ])

    // The afternoon-source file (sorted second alphabetically: 'afternoon' < 'morning')
    // means "afternoon" gets the un-suffixed slot; verify the same source is used
    // for both its summary AND its transcript (paired correctly).
    const summary1 = writes.find(w => w.dest === 'summaries/2026-04-10.md')!
    const transcript1 = writes.find(w => w.dest === 'transcripts/2026-04-10.md')!
    expect(summary1.source).toBe(transcript1.source)

    const summary2 = writes.find(w => w.dest === 'summaries/2026-04-10-2.md')!
    const transcript2 = writes.find(w => w.dest === 'transcripts/2026-04-10-2.md')!
    expect(summary2.source).toBe(transcript2.source)
    expect(summary2.source).not.toBe(summary1.source)
  })

  it('skips empty transcripts but still emits summary', () => {
    const writes = planWrites({
      ...baseOpts,
      readFile: () => `---\nsource: meeting\nspeakers:\n  - Mike Crittenden\n  - Steve Richert\n---\n\n## Summary\n\nNo transcript.\n\n## Raw content\n\n\n`,
      listCheckins: () => [],
      listReviews: () => [],
      listContexts: () => ['2026-04-10-1-1.md'],
    })
    expect(writes.map(w => w.dest)).toEqual(['summaries/2026-04-10.md'])
  })

  it('uses report aliases when matching speakers', () => {
    const writes = planWrites({
      ...baseOpts,
      readFile: () => makeContext(['Mike Crittenden', 'Steve'], '2026-04-10', '1:1', 'Hi.'),
      listCheckins: () => [],
      listReviews: () => [],
      listContexts: () => ['2026-04-10-1-1.md'],
    })
    expect(writes.length).toBeGreaterThan(0)
  })
})

describe('frontmatter helpers', () => {
  it('parses scalar fields and YAML lists', () => {
    const fm = __test.parseFrontmatter(`---\ntitle: hello\nsource: meeting\nspeakers:\n  - Alice\n  - Bob\n---\nbody`)
    expect(fm.title).toBe('hello')
    expect(fm.source).toBe('meeting')
    expect(fm.speakers).toEqual(['Alice', 'Bob'])
  })

  it('returns empty object when no frontmatter', () => {
    expect(__test.parseFrontmatter('# just markdown')).toEqual({})
  })

  it('strips frontmatter cleanly', () => {
    expect(__test.stripFrontmatter('---\nfoo: bar\n---\n\nbody')).toBe('body')
    expect(__test.stripFrontmatter('no fm here')).toBe('no fm here')
  })

  it('extracts date from context filename', () => {
    expect(__test.dateFromContextFilename('2026-04-10-1-1.md')).toBe('2026-04-10')
    expect(__test.dateFromContextFilename('no-date.md')).toBeNull()
  })
})
