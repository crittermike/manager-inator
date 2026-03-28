import type { TeamMemberActivity, GitHubActivityItem } from '../../shared/types'
import type { TimelineItem } from '../pages/today-components/types'

export function formatActivityCounts(items: GitHubActivityItem[]): string {
  const prs = items.filter(i => i.type === 'pr').length
  const issues = items.filter(i => i.type === 'issue').length
  const discussions = items.filter(i => i.type === 'discussion').length
  const parts: string[] = []
  if (prs > 0) parts.push(`${prs} PR${prs !== 1 ? 's' : ''}`)
  if (issues > 0) parts.push(`${issues} issue${issues !== 1 ? 's' : ''}`)
  if (discussions > 0) parts.push(`${discussions} disc${discussions !== 1 ? 's' : ''}`)
  return parts.join(' · ') || 'No activity'
}

export function computeActivitySuggestions(
  teamActivity: TeamMemberActivity[],
  doneIds: Set<string>,
  ptoReports: Record<string, string>
): TimelineItem[] {
  const items: TimelineItem[] = []
  const now = new Date()

  for (const member of teamActivity) {
    const ptoExpiry = ptoReports[member.reportName]
    const onPto = ptoExpiry && new Date(ptoExpiry) > now

    if (member.error) continue

    // Silence detection — no activity and not on PTO
    if (member.items.length === 0 && !onPto) {
      const id = `activity-quiet-${member.reportName}`
      items.push({
        id,
        section: doneIds.has(id) ? 'done' : 'this-week',
        title: `${member.displayName} has been quiet on GitHub`,
        subtitle: 'No recent activity — might be heads-down, stuck, or in meetings all day',
        reportName: member.reportName,
        route: `/report/${member.reportName}`,
        actionLabel: 'Check in',
        actionType: 'navigate'
      })
      continue
    }

    if (member.items.length === 0) continue
    if (onPto) continue

    const prs = member.items.filter(i => i.type === 'pr')
    const issues = member.items.filter(i => i.type === 'issue')

    // Heavy PR reviewer — lots of comments on others' PRs
    const totalReviewComments = prs.reduce((sum, pr) => sum + (pr.reviewComments?.length ?? 0), 0)
    if (totalReviewComments >= 5) {
      const id = `activity-feedback-reviewer-${member.reportName}`
      items.push({
        id,
        section: doneIds.has(id) ? 'done' : 'this-week',
        title: `${member.displayName} left ${totalReviewComments} review comments today`,
        subtitle: 'Solid code review effort — consider recognizing it',
        reportName: member.reportName,
        actionLabel: 'Give feedback',
        actionType: 'feedback'
      })
    }

    // Rubber-stamp review detection — APPROVED reviews with very short/empty bodies
    const approvals = prs.flatMap(pr =>
      (pr.reviewComments ?? []).filter(rc => rc.reviewState === 'APPROVED')
    )
    const rubberStamps = approvals.filter(rc => rc.body.trim().length < 20)
    if (approvals.length >= 3 && rubberStamps.length >= approvals.length * 0.7) {
      const id = `activity-review-quality-${member.reportName}`
      items.push({
        id,
        section: doneIds.has(id) ? 'done' : 'this-week',
        title: `${member.displayName}'s reviews might need more depth`,
        subtitle: `${rubberStamps.length} of ${approvals.length} approvals had minimal feedback`,
        reportName: member.reportName,
        route: `/report/${member.reportName}`,
        actionLabel: 'Discuss',
        actionType: 'navigate'
      })
    }

    // Stale open PR — open for 5+ days with no recent comments
    const stalePrs = prs.filter(pr => {
      if (pr.state !== 'open') return false
      const ageMs = now.getTime() - new Date(pr.createdAt).getTime()
      const ageDays = ageMs / (1000 * 60 * 60 * 24)
      return ageDays >= 5 && pr.comments === 0
    })
    if (stalePrs.length > 0) {
      const id = `activity-stale-pr-${member.reportName}`
      const prTitles = stalePrs.map(p => p.title).slice(0, 2).join(', ')
      items.push({
        id,
        section: doneIds.has(id) ? 'done' : 'this-week',
        title: `${member.displayName} has ${stalePrs.length} PR${stalePrs.length > 1 ? 's' : ''} waiting for review`,
        subtitle: prTitles,
        reportName: member.reportName,
        route: `/report/${member.reportName}`,
        actionLabel: 'Check in',
        actionType: 'navigate'
      })
    }

    // Shipping machine — 3+ merged PRs
    const mergedPrs = prs.filter(pr => pr.state === 'merged')
    if (mergedPrs.length >= 3) {
      const id = `activity-feedback-shipping-${member.reportName}`
      items.push({
        id,
        section: doneIds.has(id) ? 'done' : 'this-week',
        title: `${member.displayName} merged ${mergedPrs.length} PRs recently`,
        subtitle: 'On a roll — acknowledge the momentum',
        reportName: member.reportName,
        actionLabel: 'Give feedback',
        actionType: 'feedback'
      })
    }

    // Cross-team collaboration — active on issues with lots of comments
    const highCollabIssues = issues.filter(i => i.comments >= 5)
    if (highCollabIssues.length >= 2) {
      const id = `activity-feedback-collab-${member.reportName}`
      items.push({
        id,
        section: doneIds.has(id) ? 'done' : 'this-week',
        title: `${member.displayName} is driving ${highCollabIssues.length} active discussions`,
        subtitle: 'High collaboration signal — great for visibility',
        reportName: member.reportName,
        actionLabel: 'Give feedback',
        actionType: 'feedback'
      })
    }
  }

  return items
}
