#!/usr/bin/env node

/**
 * One-time migration: meetings/*.md → contexts/*.md
 * 
 * Run from the manager-inator-app directory:
 *   node migrate-meetings-to-contexts.mjs /path/to/data-repo
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'

const repoPath = process.argv[2]
if (!repoPath) {
  console.error('Usage: node migrate-meetings-to-contexts.mjs /path/to/data-repo')
  process.exit(1)
}

const meetingsDir = join(repoPath, 'meetings')
const contextsDir = join(repoPath, 'contexts')
const peopleDir = join(repoPath, 'people')
const reportsDir = join(repoPath, 'reports')

if (!existsSync(meetingsDir)) {
  console.error(`No meetings/ directory found at ${meetingsDir}`)
  process.exit(1)
}

mkdirSync(contextsDir, { recursive: true })

// Build slug lookup from people/ and reports/
const slugsByName = new Map()  // lowercase name → slug
const slugsByFirstName = new Map()  // lowercase first name → slug

if (existsSync(peopleDir)) {
  for (const f of readdirSync(peopleDir).filter(f => f.endsWith('.md'))) {
    const content = readFileSync(join(peopleDir, f), 'utf-8')
    const slug = f.replace('.md', '')
    const nameMatch = content.match(/^name:\s*(.+)$/m)
    if (nameMatch) {
      const name = nameMatch[1].trim()
      slugsByName.set(name.toLowerCase(), slug)
      const firstName = name.split(' ')[0].toLowerCase()
      if (!slugsByFirstName.has(firstName)) slugsByFirstName.set(firstName, slug)
    }
    const aliasMatch = content.match(/^aliases:\s*(.+)$/m)
    if (aliasMatch) {
      for (const alias of aliasMatch[1].split(',').map(a => a.trim()).filter(Boolean)) {
        slugsByName.set(alias.toLowerCase(), slug)
      }
    }
  }
}

// Also map report directory names
if (existsSync(reportsDir)) {
  for (const d of readdirSync(reportsDir)) {
    if (d.startsWith('_') || d.startsWith('.')) continue
    const profilePath = join(reportsDir, d, 'profile.md')
    if (!existsSync(profilePath)) continue
    const content = readFileSync(profilePath, 'utf-8')
    const nameMatch = content.match(/^#\s+(.+)$/m)
    if (nameMatch) {
      const name = nameMatch[1].trim()
      if (!slugsByName.has(name.toLowerCase())) slugsByName.set(name.toLowerCase(), d)
      const firstName = name.split(' ')[0].toLowerCase()
      if (!slugsByFirstName.has(firstName)) slugsByFirstName.set(firstName, d)
    }
  }
}

function resolveSpeakerToSlug(speaker) {
  const lower = speaker.trim().toLowerCase()
  if (slugsByName.has(lower)) return slugsByName.get(lower)
  const firstName = lower.split(' ')[0]
  if (slugsByFirstName.has(firstName)) return slugsByFirstName.get(firstName)
  return null
}

function parseSpeakers(content) {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!fmMatch) return []
  const speakersMatch = fmMatch[1].match(/^speakers:\s*$/m)
  if (!speakersMatch) {
    const inlineMatch = fmMatch[1].match(/^speakers:\s*\[([^\]]*)\]/m)
    if (inlineMatch) return inlineMatch[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
    return []
  }
  const afterSpeakers = fmMatch[1].slice(speakersMatch.index + speakersMatch[0].length)
  const lines = afterSpeakers.split('\n')
  const result = []
  for (const line of lines) {
    const m = line.match(/^\s+-\s+(.+)/)
    if (m) result.push(m[1].trim())
    else if (line.trim() && !line.match(/^\s+-/)) break
  }
  return result
}

function slugsFromFilename(filename) {
  const name = filename.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-?/, '')
  if (!name) return []
  const segments = name.split('-')
  const slugs = new Set()
  for (const seg of segments) {
    if (['1', 'on', 'meeting', 'chat', 'sync', 'check', 'in', 'standup', 'retro', 'review'].includes(seg)) continue
    if (slugsByFirstName.has(seg)) slugs.add(slugsByFirstName.get(seg))
  }
  return [...slugs]
}

const files = readdirSync(meetingsDir).filter(f => f.endsWith('.md')).sort()
let migrated = 0
let skipped = 0

for (const f of files) {
  const destPath = join(contextsDir, f)
  if (existsSync(destPath)) {
    console.log(`SKIP (already exists): ${f}`)
    skipped++
    continue
  }

  const content = readFileSync(join(meetingsDir, f), 'utf-8')
  const dateMatch = f.match(/^(\d{4}-\d{2}-\d{2})/)
  const date = dateMatch?.[1] || ''

  const speakers = parseSpeakers(content)
  const speakerSlugs = speakers.map(s => resolveSpeakerToSlug(s)).filter(Boolean)
  const filenameSlugs = slugsFromFilename(f)
  const allSlugs = [...new Set([...speakerSlugs, ...filenameSlugs])]

  // Filter out mike/mike-crittenden since that's the user
  const peopleSlugs = allSlugs.filter(s => s !== 'mike' && s !== 'mike-crittenden')

  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)

  let newContent
  if (fmMatch) {
    let fm = fmMatch[1]
    if (!fm.match(/^date:/m)) fm = `date: ${date}\n${fm}`
    if (!fm.match(/^source:/m)) fm = `${fm}\nsource: meeting`
    if (!fm.match(/^people:/m) && peopleSlugs.length > 0) {
      fm = `${fm}\npeople:\n${peopleSlugs.map(s => `  - ${s}`).join('\n')}`
    }
    newContent = `---\n${fm}\n---${content.slice(fmMatch[0].length)}`
  } else {
    let fm = `date: ${date}\nsource: meeting`
    if (peopleSlugs.length > 0) {
      fm += `\npeople:\n${peopleSlugs.map(s => `  - ${s}`).join('\n')}`
    }
    newContent = `---\n${fm}\n---\n\n${content}`
  }

  writeFileSync(destPath, newContent, 'utf-8')
  migrated++
  const ppl = peopleSlugs.length > 0 ? ` [${peopleSlugs.join(', ')}]` : ''
  console.log(`OK: ${f}${ppl}`)
}

console.log(`\nMigrated: ${migrated}, Skipped: ${skipped}, Total: ${files.length}`)

if (migrated > 0) {
  console.log(`\nDeleting meetings/ directory...`)
  rmSync(meetingsDir, { recursive: true, force: true })
  console.log(`Done. meetings/ deleted.`)
} else {
  console.log(`\nNo files migrated. meetings/ directory left intact.`)
}
