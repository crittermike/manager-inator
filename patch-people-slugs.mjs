#!/usr/bin/env node

/**
 * Patch: Add missing people: slugs to migrated context files.
 * Re-resolves speakers/filenames using both YAML name: and # heading patterns.
 * 
 * Run: node patch-people-slugs.mjs /path/to/data-repo
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const repoPath = process.argv[2]
if (!repoPath) {
  console.error('Usage: node patch-people-slugs.mjs /path/to/data-repo')
  process.exit(1)
}

const contextsDir = join(repoPath, 'contexts')
const peopleDir = join(repoPath, 'people')
const reportsDir = join(repoPath, 'reports')

const slugsByName = new Map()
const slugsByFirstName = new Map()

function addSlug(name, slug) {
  slugsByName.set(name.toLowerCase(), slug)
  const firstName = name.split(' ')[0].toLowerCase()
  if (!slugsByFirstName.has(firstName)) slugsByFirstName.set(firstName, slug)
}

if (existsSync(peopleDir)) {
  for (const f of readdirSync(peopleDir).filter(f => f.endsWith('.md'))) {
    const content = readFileSync(join(peopleDir, f), 'utf-8')
    const slug = f.replace('.md', '')
    const nameMatch = content.match(/^name:\s*(.+)$/m)
    if (nameMatch) addSlug(nameMatch[1].trim(), slug)
    const aliasMatch = content.match(/^aliases:\s*(.+)$/m)
    if (aliasMatch) {
      for (const alias of aliasMatch[1].split(',').map(a => a.trim()).filter(Boolean)) {
        slugsByName.set(alias.toLowerCase(), slug)
      }
    }
  }
}

if (existsSync(reportsDir)) {
  for (const d of readdirSync(reportsDir)) {
    if (d.startsWith('_') || d.startsWith('.')) continue
    const profilePath = join(reportsDir, d, 'profile.md')
    if (!existsSync(profilePath)) continue
    const content = readFileSync(profilePath, 'utf-8')
    // Try YAML name: first, then # heading
    const yamlName = content.match(/^name:\s*(.+)$/m)?.[1]?.trim()
    const headingName = content.match(/^#\s+(.+)$/m)?.[1]?.trim()
    const name = yamlName || headingName
    if (name) addSlug(name, d)
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
    if (['1', 'on', 'meeting', 'chat', 'sync', 'check', 'in', 'standup', 'retro', 'review', 'is', 'and', 'team', 'with', 's', 'the', 'a'].includes(seg)) continue
    if (slugsByFirstName.has(seg)) slugs.add(slugsByFirstName.get(seg))
  }
  return [...slugs]
}

const files = readdirSync(contextsDir).filter(f => f.endsWith('.md')).sort()
let patched = 0
let alreadyHasPeople = 0
let noSlugsFound = 0

for (const f of files) {
  const filePath = join(contextsDir, f)
  const content = readFileSync(filePath, 'utf-8')
  
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!fmMatch) continue
  
  if (fmMatch[1].match(/^people:/m)) {
    alreadyHasPeople++
    continue
  }

  const speakers = parseSpeakers(content)
  const speakerSlugs = speakers.map(s => resolveSpeakerToSlug(s)).filter(Boolean)
  const filenameSlugs = slugsFromFilename(f)
  const allSlugs = [...new Set([...speakerSlugs, ...filenameSlugs])]
  const peopleSlugs = allSlugs.filter(s => s !== 'mike' && s !== 'mike-crittenden')

  if (peopleSlugs.length === 0) {
    noSlugsFound++
    continue
  }

  const fm = fmMatch[1]
  const newFm = `${fm}\npeople:\n${peopleSlugs.map(s => `  - ${s}`).join('\n')}`
  const newContent = `---\n${newFm}\n---${content.slice(fmMatch[0].length)}`
  writeFileSync(filePath, newContent, 'utf-8')
  patched++
  console.log(`PATCHED: ${f} [${peopleSlugs.join(', ')}]`)
}

console.log(`\nPatched: ${patched}, Already had people: ${alreadyHasPeople}, No slugs found: ${noSlugsFound}, Total: ${files.length}`)
