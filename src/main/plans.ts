import { randomUUID } from 'crypto'
import {
  getFileContent,
  fileExists,
  commitFile,
  deleteFile as deleteRepoFile,
  listFilesInDir,
} from './github'
import type { Plan, PlanSummary } from '../shared/types'

const PLANS_DIR = 'plans'

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function planPath(slug: string): string {
  return `${PLANS_DIR}/${slug}.json`
}

export function listPlans(): PlanSummary[] {
  const files = listFilesInDir(PLANS_DIR).filter(f => f.endsWith('.json'))
  const out: PlanSummary[] = []
  for (const f of files) {
    try {
      const raw = getFileContent(`${PLANS_DIR}/${f}`)
      const p = JSON.parse(raw) as Plan
      out.push({ slug: p.slug, name: p.name, updatedAt: p.updatedAt })
    } catch {}
  }
  return out.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
}

export function getPlan(slug: string): Plan | null {
  const path = planPath(slug)
  if (!fileExists(path)) return null
  try {
    const raw = getFileContent(path)
    const plan = JSON.parse(raw) as Plan
    return normalizePlan(plan)
  } catch {
    return null
  }
}

function normalizePlan(plan: Plan): Plan {
  return {
    ...plan,
    iterations: Array.isArray(plan.iterations) ? plan.iterations : [],
    people: Array.isArray(plan.people) ? plan.people : [],
    projects: Array.isArray(plan.projects) ? plan.projects : [],
    assignments: Array.isArray(plan.assignments) ? plan.assignments : [],
  }
}

function uniqueSlug(base: string): string {
  let slug = base || 'plan'
  let i = 2
  while (fileExists(planPath(slug))) {
    slug = `${base}-${i++}`
  }
  return slug
}

export async function createPlan(name: string): Promise<Plan> {
  const trimmed = name.trim() || 'Untitled plan'
  const baseSlug = slugify(trimmed) || 'plan'
  const slug = uniqueSlug(baseSlug)
  const now = new Date().toISOString()
  const plan: Plan = {
    slug,
    name: trimmed,
    iterations: [],
    people: [],
    projects: [],
    assignments: [],
    createdAt: now,
    updatedAt: now,
  }
  await commitFile(planPath(slug), JSON.stringify(plan, null, 2), `Create plan: ${trimmed}`)
  return plan
}

export async function savePlan(plan: Plan): Promise<void> {
  if (!plan.slug) throw new Error('Plan slug is required')
  const next: Plan = normalizePlan({ ...plan, updatedAt: new Date().toISOString() })
  // Strip orphaned assignments referencing nonexistent column/person/project
  const colIds = new Set(next.iterations.flatMap(it => it.columns.map(c => c.id)))
  const personIds = new Set(next.people.map(p => p.id))
  const projectIds = new Set(next.projects.map(p => p.id))
  next.assignments = next.assignments.filter(
    a => colIds.has(a.columnId) && personIds.has(a.personId) && projectIds.has(a.projectId)
  )
  await commitFile(planPath(next.slug), JSON.stringify(next, null, 2), `Update plan: ${next.name}`)
}

export async function deletePlan(slug: string): Promise<void> {
  const path = planPath(slug)
  if (!fileExists(path)) return
  await deleteRepoFile(path)
}

// Re-export for tests / convenience
export const __test = { slugify, uniqueSlug, normalizePlan, planPath }

export function newId(): string {
  return randomUUID()
}
