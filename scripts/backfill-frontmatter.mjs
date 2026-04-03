#!/usr/bin/env node
/**
 * Backfill missing `title` and `speakers` in context file frontmatter.
 * 
 * - title: extracted from first # heading, or derived from filename
 * - speakers: extracted from speaker patterns like "**Name:**" or "Name:" in content
 * 
 * Usage: node scripts/backfill-frontmatter.mjs /path/to/data-repo
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'

const dataDir = process.argv[2]
if (!dataDir) {
  console.error('Usage: node scripts/backfill-frontmatter.mjs /path/to/data-repo')
  process.exit(1)
}

const contextsDir = join(dataDir, 'contexts')
const files = readdirSync(contextsDir).filter(f => f.endsWith('.md'))

let updatedCount = 0
let skippedCount = 0

for (const filename of files) {
  const filepath = join(contextsDir, filename)
  const raw = readFileSync(filepath, 'utf-8')

  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/)
  if (!fmMatch) {
    skippedCount++
    continue
  }

  const fm = fmMatch[1]
  const body = raw.slice(fmMatch[0].length)
  const hasTitle = /^title:/m.test(fm)
  const hasSpeakers = /^speakers:/m.test(fm)

  if (hasTitle && hasSpeakers) {
    skippedCount++
    continue
  }

  let newFm = fm
  let changed = false

  // Backfill title
  if (!hasTitle) {
    let title = ''
    // Try first # heading in body
    const headingMatch = body.match(/^#\s+(.+)/m)
    if (headingMatch) {
      title = headingMatch[1].trim()
    } else {
      // Derive from filename: strip date prefix, replace hyphens with spaces
      const base = filename.replace('.md', '')
      const slugMatch = base.match(/^\d{4}-\d{2}-\d{2}-?(.*)/)
      title = (slugMatch?.[1] || base).replace(/-/g, ' ').trim()
    }
    if (title) {
      // Escape YAML special chars
      const safeTitle = /[:#\[\]{}|>&*!?,]/.test(title) ? `"${title.replace(/"/g, '\\"')}"` : title
      newFm = `title: ${safeTitle}\n${newFm}`
      changed = true
    }
  }

  // Backfill speakers
  if (!hasSpeakers) {
    const speakers = new Set()
    // Pattern 1: **Name:** (bold speaker turns)
    const boldPattern = /\*\*([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*):\*\*/g
    let match
    while ((match = boldPattern.exec(body)) !== null) {
      speakers.add(match[1])
    }
    // Pattern 2: "Name:" at start of line (plain speaker turns)  
    if (speakers.size === 0) {
      const plainPattern = /^([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*):/gm
      while ((match = plainPattern.exec(body)) !== null) {
        // Skip common false positives
        const name = match[1]
        if (!['Summary', 'Note', 'Notes', 'Action', 'Actions', 'Context', 'Date', 'Source', 'Tags', 'Topic', 'Agenda', 'Decision', 'Background', 'Status', 'Update', 'Discussion', 'Resolution', 'Follow', 'Risk', 'Impact', 'Priority', 'Owner', 'Type', 'Title', 'Description', 'Key'].includes(name)) {
          speakers.add(name)
        }
      }
    }

    if (speakers.size > 0) {
      const speakersYaml = [...speakers].map(s => `  - ${s}`).join('\n')
      newFm = newFm + `\nspeakers:\n${speakersYaml}`
    } else {
      newFm = newFm + `\nspeakers: []`
    }
    changed = true
  }

  if (changed) {
    const newContent = `---\n${newFm}\n---${body}`
    writeFileSync(filepath, newContent, 'utf-8')
    updatedCount++
    if (updatedCount <= 10) {
      const title = newFm.match(/^title:\s*(.+)/m)?.[1] || '(none)'
      const speakerCount = (newFm.match(/  - /g) || []).length
      console.log(`  ✓ ${filename} — title: ${title}, speakers: ${speakerCount}`)
    }
  }
}

if (updatedCount > 10) {
  console.log(`  ... and ${updatedCount - 10} more`)
}
console.log(`\nDone: ${updatedCount} updated, ${skippedCount} already complete (${files.length} total)`)
