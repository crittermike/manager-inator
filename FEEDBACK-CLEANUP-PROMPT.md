# Feedback log.md Cleanup Prompt

Use this prompt with an AI agent that has access to your data repo (the `manager-inator` repo, NOT the app repo).

---

## Prompt to give the agent:

I need you to clean up all `feedback/log.md` files across my direct reports. These files are located at `reports/{person-name}/feedback/log.md`.

### The problems to fix:

1. **Cross-contamination**: Some files contain feedback entries that belong to OTHER people (e.g., Nic's log.md has feedback about Tara). Remove any entry that is clearly about a different person than the file owner.

2. **Inconsistent format**: Entries use different header formats. Standardize ALL entries to this canonical format:

```markdown
### YYYY-MM-DD
**Type:** positive/constructive/mixed
**Source:** meeting-slug-or-description

The actual feedback content goes here as plain text (not in a blockquote).

---
```

3. **Chronological ordering**: Entries should be in reverse chronological order (newest first). If entries are out of order, re-sort them.

4. **Duplicate entries**: If the same feedback appears multiple times (same date, same content), keep only one copy.

5. **Header/template cruft**: Some files have random headers, templates, or boilerplate at the top that isn't actual feedback. Remove any non-entry content. The file should contain ONLY feedback entries separated by `---`.

### Format rules:

- Each entry starts with `### YYYY-MM-DD`
- Next line: `**Type:** ` followed by exactly one of: `positive`, `constructive`, `mixed`
- Next line (optional): `**Source:** ` followed by the meeting or context name
- Then a blank line, then the feedback content as plain text (NOT in a `>` blockquote)
- Entries separated by a single `---` with blank lines around it
- Newest entries at the top of the file
- No other headings, templates, or boilerplate in the file

### How to identify cross-contaminated entries:

- If the file is `reports/nic-daantos/feedback/log.md`, entries should ONLY be about Nic
- If an entry mentions another person's name in the heading or is clearly about someone else's behavior, it belongs in that other person's file (move it there or just remove it)
- Be careful: entries CAN mention other people in passing (e.g., "Nic collaborated well with Tara") — that's fine, it's still about Nic

### Process:

1. List all `reports/*/feedback/log.md` files
2. For each file, read it and identify the person it belongs to
3. Parse all entries, fixing format issues
4. Remove entries that belong to other people
5. Sort remaining entries reverse-chronologically
6. Remove duplicates
7. Write the cleaned file back

Do this for ALL report directories. Show me a summary of changes made per file when done.
