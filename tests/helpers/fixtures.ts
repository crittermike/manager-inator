/**
 * Fixture repo builder for integration tests.
 * Creates a real temporary directory with the standard data-repo layout.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

export interface FixtureRepo {
  dir: string
  cleanup: () => void
}

/**
 * Create a fixture data repo in a temp directory with realistic data.
 * Caller MUST call cleanup() in afterAll/afterEach.
 */
export function createFixtureRepo(): FixtureRepo {
  const dir = mkdtempSync(join(tmpdir(), 'manager-inator-test-'))

  // ── reports/alice/ (full report) ──
  const alice = join(dir, 'reports', 'alice')
  mkdirSync(join(alice, 'check-ins', 'monthly'), { recursive: true })
  mkdirSync(join(alice, 'check-ins', 'shared'), { recursive: true })
  mkdirSync(join(alice, 'feedback'), { recursive: true })
  mkdirSync(join(alice, 'reviews'), { recursive: true })

  writeFileSync(join(alice, 'profile.md'), `# Alice Smith

| Field | Value |
|-------|-------|
| **Role** | Senior Engineer |
| **Team** | Platform |
| **GitHub** | @alicesmith |
| **Start Date** | 2023-01-15 |
| **Meeting Day** | Tuesday |
| **Location** | San Francisco |
| **Timezone** | America/Los_Angeles |
| **Manager** | Mike |

## About

Alice is a strong technical leader who excels at system design.

## Communication Preferences

- **Preferred channel**: Slack DM
- **Meeting style**: Agenda-driven
`)

  writeFileSync(join(alice, 'check-ins', 'monthly', '2026-01.md'), `# January 2026 Check-in

## Accomplishments
- Shipped the new auth system
- Mentored two interns

## Concerns
- Feeling stretched thin across projects
`)

  writeFileSync(join(alice, 'check-ins', 'monthly', '2026-02.md'), `# February 2026 Check-in

## Accomplishments
- Completed platform migration
- Led design review for new API

## Concerns
- None
`)

  writeFileSync(join(alice, 'feedback', 'log.md'), `# Feedback Log

## 2026-01-15 - Positive

**Source**: Peer review
**Context**: Q4 project delivery

> Alice demonstrated exceptional leadership during the platform migration. She kept the team focused and delivered on time.

## 2026-02-10 - Constructive

**Source**: Skip-level meeting
**Context**: Communication feedback

> Could improve on providing written status updates to stakeholders. Verbal updates are great but need documentation.
`)

  writeFileSync(join(alice, 'reviews', '2025-H2.md'), `# H2 2025 Performance Review

## Summary
Alice exceeded expectations this half. Strong delivery, solid mentorship.

## Rating
Exceeds Expectations
`)

  writeFileSync(join(alice, 'DASHBOARD.md'), `# Alice Dashboard

## Status: On Track

- Last 1:1: 2026-03-11
- Open action items: 2
`)

  writeFileSync(join(alice, 'job-expectations.md'), `# Senior Engineer Expectations

## Technical
- Lead system design for medium-complexity projects
- Write clean, well-tested code

## Leadership
- Mentor junior engineers
- Drive technical decisions within the team
`)

  // ── reports/bob/ (minimal report) ──
  const bob = join(dir, 'reports', 'bob')
  mkdirSync(bob, { recursive: true })
  writeFileSync(join(bob, 'profile.md'), `# Bob Jones

| Field | Value |
|-------|-------|
| **Role** | Software Engineer |
| **Team** | Frontend |
| **GitHub** | @bobjones |
| **Start Date** | 2024-06-01 |
| **Meeting Day** | Thursday |
| **Location** | Remote |
`)

  // ── reports/_template/ (should be excluded) ──
  const tmpl = join(dir, 'reports', '_template')
  mkdirSync(tmpl, { recursive: true })
  writeFileSync(join(tmpl, 'profile.md'), `# Template\n\nThis is a template.`)

  // ── meetings/ ──
  mkdirSync(join(dir, 'meetings'), { recursive: true })

  writeFileSync(join(dir, 'meetings', '2026-03-11-alice-1-1.md'), `---
title: Alice 1:1
speakers:
  - Mike Crittenden
  - Alice Smith
---

# Alice 1:1 - March 11

## Topics
- Platform migration status
- Q2 planning

## Action Items
- [ ] **Alice**: Update migration docs by Friday
- [ ] **Mike**: Schedule skip-level with Alice's team
- [x] **Alice**: Send Q1 metrics summary
`)

  writeFileSync(join(dir, 'meetings', '2026-03-04-alice-1-1.md'), `# Alice 1:1 - March 4

Quick sync on migration progress. No blockers.
`)

  writeFileSync(join(dir, 'meetings', '2026-03-10-bob-1-1.md'), `---
title: Bob 1:1
speakers:
  - Mike Crittenden
  - Bob Jones
---

# Bob 1:1 - March 10

## Topics
- Sprint retro
- Career growth discussion

## Action Items
- [ ] **Bob**: Draft career growth plan
`)

  writeFileSync(join(dir, 'meetings', '2026-03-12-team-standup.md'), `---
title: Team Standup
speakers:
  - Mike Crittenden
  - Alice Smith
  - Bob Jones
---

# Team Standup - March 12

Brief sync. Alice mentioned the migration is on track.
`)

  // ── transcripts/raw/ ──
  mkdirSync(join(dir, 'transcripts', 'raw'), { recursive: true })
  mkdirSync(join(dir, 'transcripts', 'processed'), { recursive: true })

  writeFileSync(join(dir, 'transcripts', 'raw', '2026-03-15-alice-1-1.txt'),
    'Mike: Hey Alice, how are things?\nAlice: Good! Migration is done.\n')

  writeFileSync(join(dir, 'transcripts', 'raw', '2026-03-15-retro.md'),
    '# Retro Transcript\n\nTeam retro discussion...\n')

  // ── people/ ──
  mkdirSync(join(dir, 'people'), { recursive: true })

  writeFileSync(join(dir, 'people', 'alice-smith.md'), `---
name: Alice Smith
slug: alice-smith
aliases: Ali
role: Senior Engineer
github: alicesmith
location: San Francisco
relationship: Direct Report
---

# Alice Smith

Senior engineer on the Platform team.
`)

  writeFileSync(join(dir, 'people', 'bob-jones.md'), `---
name: Bob Jones
slug: bob-jones
aliases: Bobby, Robert
role: Software Engineer
github: bobjones
location: Remote
relationship: Direct Report
---

# Bob Jones

Frontend engineer, joined mid-2024.
`)

  // ── weekly-log/ ──
  mkdirSync(join(dir, 'weekly-log'), { recursive: true })
  writeFileSync(join(dir, 'weekly-log', '2026-W11-planning.md'), `# Week 11 Planning

## Priorities
- Finalize Q2 roadmap
- Alice migration wrap-up
- Bob onboarding checkpoint
`)

  // ── impact log ──
  writeFileSync(join(dir, 'mike-impact-log.md'), `# Impact Log

## 2026-03-10 - Team Process Improvement

Introduced async standup format, reducing meeting time by 30 minutes per week.

## 2026-03-05 - Mentorship

Coached Alice through a difficult cross-team negotiation.
`)

  // ── settings.md ──
  writeFileSync(join(dir, 'settings.md'), `# Settings

## Roles
- Software Engineer
- Senior Engineer
- Staff Engineer
- Engineering Manager

## Relationships
- Direct Report
- Skip-Level
- Peer
- Stakeholder
`)

  return {
    dir,
    cleanup: () => {
      try { rmSync(dir, { recursive: true, force: true }) } catch {}
    }
  }
}

/**
 * Create a minimal fixture repo for quick tests that don't need full data.
 */
export function createMinimalFixtureRepo(): FixtureRepo {
  const dir = mkdtempSync(join(tmpdir(), 'manager-inator-min-'))

  mkdirSync(join(dir, 'reports', 'alice'), { recursive: true })
  writeFileSync(join(dir, 'reports', 'alice', 'profile.md'), `# Alice\n\n| Field | Value |\n|---|---|\n| **Role** | Engineer |\n`)

  mkdirSync(join(dir, 'meetings'), { recursive: true })
  mkdirSync(join(dir, 'people'), { recursive: true })
  mkdirSync(join(dir, 'transcripts', 'raw'), { recursive: true })

  return {
    dir,
    cleanup: () => {
      try { rmSync(dir, { recursive: true, force: true }) } catch {}
    }
  }
}
