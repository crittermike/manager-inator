import { join } from 'path'
import { mkdirSync, writeFileSync } from 'fs'

/**
 * Test data helpers for setting up fixture directories and files
 */

export interface MockReport {
  name: string
  displayName: string
  role?: string
  github?: string
  meetingDay?: string
  location?: string
}

export interface MockMeeting {
  filename: string
  title: string
  date: string
  speakers?: string[]
  content?: string
}

/**
 * Create a mock data repository structure in the given directory
 */
export function createMockDataRepo(repoPath: string, options: {
  reports?: MockReport[]
  meetings?: MockMeeting[]
  contexts?: MockMeeting[]
  settingsFile?: string
} = {}): void {
  // Create base directories
  const dirs = [
    'reports',
    'contexts',
    'meetings',
    'transcripts/processed',
    'people'
  ]
  
  for (const dir of dirs) {
    mkdirSync(join(repoPath, dir), { recursive: true })
  }
  
  // Create report profiles
  if (options.reports) {
    for (const report of options.reports) {
      const reportDir = join(repoPath, 'reports', report.name)
      mkdirSync(reportDir, { recursive: true })
      mkdirSync(join(reportDir, 'check-ins', 'monthly'), { recursive: true })
      mkdirSync(join(reportDir, 'feedback'), { recursive: true })
      mkdirSync(join(reportDir, 'prep'), { recursive: true })
      
      const profile = `---
name: ${report.displayName}
role: ${report.role || 'Software Engineer'}
github: ${report.github || report.name}
meetingDay: ${report.meetingDay || 'Monday'}
location: ${report.location || 'Remote'}
---

# About ${report.displayName}

Test profile for ${report.displayName}.
`
      writeFileSync(join(reportDir, 'profile.md'), profile, 'utf-8')
    }
  }
  
  if (options.contexts) {
    for (const meeting of options.contexts) {
      const speakers = meeting.speakers || []
      const speakerYaml = speakers.length > 0
        ? `\nspeakers:\n${speakers.map(s => `  - ${s}`).join('\n')}`
        : ''

      const content = `---
title: ${meeting.title}${speakerYaml}
---

${meeting.content || `# ${meeting.title}\n\nTest meeting content.`}
`
      writeFileSync(
        join(repoPath, 'contexts', meeting.filename),
        content,
        'utf-8'
      )
    }
  }

  if (options.meetings) {
    for (const meeting of options.meetings) {
      const speakers = meeting.speakers || []
      const speakerYaml = speakers.length > 0
        ? `\nspeakers:\n${speakers.map(s => `  - ${s}`).join('\n')}`
        : ''
      
      const content = `---
title: ${meeting.title}${speakerYaml}
---

${meeting.content || `# ${meeting.title}\n\nTest meeting content.`}
`
      writeFileSync(
        join(repoPath, 'meetings', meeting.filename),
        content,
        'utf-8'
      )
    }
  }
  
  // Create settings.md
  if (options.settingsFile) {
    writeFileSync(
      join(repoPath, 'settings.md'),
      options.settingsFile,
      'utf-8'
    )
  } else {
    // Default settings file
    const defaultSettings = `# Settings

## Roles
- Software Engineer
- Senior Software Engineer
- Staff Engineer

## Relationships
- Direct Report
- Skip Level
- Peer
`
    writeFileSync(join(repoPath, 'settings.md'), defaultSettings, 'utf-8')
  }
  
  // Initialize as git repo (needed for git operations)
  // Note: This is just file structure, actual git init should be done with bash
}

/**
 * Create authenticated electron-store seed data
 */
export function createAuthenticatedStoreSeed(options: {
  repoPath: string
  githubToken?: string
  repoOwner?: string
  repoName?: string
  defaultModel?: string
}): Record<string, unknown> {
  return {
    githubToken: options.githubToken || 'mock_test_token_12345',
    repoPath: options.repoPath,
    repoOwner: options.repoOwner || 'test-owner',
    repoName: options.repoName || 'test-repo',
    defaultModel: options.defaultModel || 'gpt-4.1',
    checkInFrequency: 'monthly',
    feedbackReminderDays: 14,
    sprintLengthWeeks: 2,
    endOfWeekDay: 'friday',
    sprintStartDate: '2026-01-06',
    staleActionDays: 5,
    aiCustomInstructions: '',
    disabledPractices: [],
    snoozedPractices: {},
    customPractices: [],
    practiceCompletions: {},
    practiceSchedules: {},
    snoozedActionItems: {},
    ptoReports: {}
  }
}

/**
 * Wait for an element with retry logic (useful for flaky Electron context issues)
 */
export async function waitForElement(
  page: any,
  selector: string,
  options: { timeout?: number; retries?: number } = {}
): Promise<void> {
  const timeout = options.timeout || 5000
  const retries = options.retries || 3
  
  for (let i = 0; i < retries; i++) {
    try {
      await page.locator(selector).waitFor({ timeout, state: 'visible' })
      return
    } catch (err) {
      if (i === retries - 1) throw err
      await page.waitForTimeout(500)
    }
  }
}
