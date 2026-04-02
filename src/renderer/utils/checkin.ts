import { Report, MonthlyActivityStats } from '../../shared/types'

export async function getCheckInContext(report: Report, name: string, now = new Date()) {
  let targetYear = now.getFullYear()
  let targetMonth = now.getMonth()

  if (now.getDate() <= 7) {
    targetMonth -= 1
    if (targetMonth < 0) {
      targetMonth = 11
      targetYear -= 1
    }
  }

  const month = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`
  const monthName = new Date(targetYear, targetMonth, 1).toLocaleString('default', { month: 'long', year: 'numeric' })
  const startDate = `${month}-01`
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate()
  const endDate = `${month}-${String(lastDay).padStart(2, '0')}`

  const recentSummaries = report.summaries.slice(-8)
  const checkInPaths = recentSummaries.map(s => `contexts/${s.filename || `${s.date}-${name}-1-1.md`}`)
  const checkInMap = await window.api.getFilesContentBulk(checkInPaths)
  const summariesText = recentSummaries.map(s => {
    const content = checkInMap[`contexts/${s.filename || `${s.date}-${name}-1-1.md`}`]
    return content ? `### ${s.date}\n${content}` : ''
  }).filter(Boolean).join('\n\n---\n\n')

  const recentCheckIns = report.checkIns.slice(-3)
  const checkInHistoryText = recentCheckIns.length > 0
    ? recentCheckIns.map(c => `### ${c.date}\n${c.content || c.accomplishments.join('\n') || '(no content)'}`).join('\n\n---\n\n')
    : undefined

  let githubActivityText: string | undefined
  try {
    const stats: MonthlyActivityStats | null = await window.api.getMonthlyActivity(name, targetYear, targetMonth + 1)
    if (stats && (stats.counts.prsMerged > 0 || stats.counts.prsReviewed > 0 || stats.counts.issuesCreated > 0 || stats.counts.issuesClosed > 0 || stats.counts.discussionsCreated > 0)) {
      const sections: string[] = []
      sections.push(`Summary: ${stats.counts.prsMerged} PRs merged, ${stats.counts.prsReviewed} PRs reviewed, ${stats.counts.issuesCreated} issues created, ${stats.counts.issuesClosed} issues closed, ${stats.counts.discussionsCreated} discussions created`)
      if (stats.prsMerged.length > 0) {
        sections.push('PRs merged:\n' + stats.prsMerged.map(pr => `- [${pr.title}](${pr.url}) (${pr.repo})`).join('\n'))
      }
      if (stats.prsReviewed.length > 0) {
        sections.push('PRs reviewed:\n' + stats.prsReviewed.map(pr => `- [${pr.title}](${pr.url}) (${pr.repo})`).join('\n'))
      }
      if (stats.discussionsCreated.length > 0) {
        sections.push('Discussions created:\n' + stats.discussionsCreated.map(d => `- [${d.title}](${d.url}) (${d.repo})`).join('\n'))
      }
      if (stats.issuesCreated.length > 0) {
        sections.push('Issues created:\n' + stats.issuesCreated.map(i => `- [${i.title}](${i.url}) (${i.repo}, ${i.state})`).join('\n'))
      }
      if (stats.issuesClosed.length > 0) {
        sections.push('Issues closed:\n' + stats.issuesClosed.map(i => `- [${i.title}](${i.url}) (${i.repo})`).join('\n'))
      }
      githubActivityText = sections.join('\n\n')
    }
  } catch { /* monthly activity unavailable is non-fatal */ }

  try {
    const enriched = await window.api.fetchActivityForPerson(name, startDate, endDate)
    if (enriched && enriched.items.length > 0) {
      const contentPreviews: string[] = []
      for (const item of enriched.items) {
        if (item.reviewComments?.length) {
          for (const rc of item.reviewComments.slice(0, 3)) {
            contentPreviews.push(`- Review on "${item.title}": ${rc.reviewState ? `[${rc.reviewState}] ` : ''}${rc.body.slice(0, 200)}`)
          }
        }
        if (item.issueComments?.length) {
          for (const ic of item.issueComments.slice(0, 3)) {
            contentPreviews.push(`- Comment on "${item.title}": ${ic.body.slice(0, 200)}`)
          }
        }
      }
      if (contentPreviews.length > 0) {
        const enrichedSection = '\n\nCode review & comment content (for assessing quality and engagement):\n' + contentPreviews.slice(0, 20).join('\n')
        githubActivityText = (githubActivityText || '') + enrichedSection
      }
    }
  } catch { /* content enrichment unavailable is non-fatal */ }

  const context = {
    reportName: report.profile.displayName,
    displayName: report.profile.displayName,
    month,
    monthName,
    about: report.profile.about || undefined,
    jobExpectations: report.jobExpectations || undefined,
    summaries: summariesText || 'No recent summaries available.',
    checkInHistory: checkInHistoryText,
    feedback: report.feedback.map(f => `${f.date}: ${f.content}`).join('\n---\n'),
    actionItems: report.actionItems.filter(a => !a.completed).slice(0, 20).map(a => `- ${a.text}`).join('\n'),
    contextNotes: report.contextNotes.length > 0
      ? report.contextNotes.map(n => `### ${n.date} (${n.source})\n${n.summary}\n\n${n.content}`).join('\n\n---\n\n')
      : undefined,
    githubActivity: githubActivityText
  }

  return { context, month }
}
