/**
 * Fetch and parse hubbers.yml from github/thehub to auto-detect
 * the user's team (direct reports, manager, skip-level).
 */
import { parse as parseYaml } from 'yaml'

export interface HubberEntry {
  github_login: string
  name: string
  title: string
  manager: string
  cost_center: string
  country: string
  state?: string
  employment_type: string
}

export interface TeamDetectionResult {
  user: {
    name: string
    title: string
    github: string
    manager?: { name: string; github: string; title: string }
    skipLevel?: { name: string; github: string; title: string }
  }
  directReports: {
    name: string
    github: string
    title: string
    location: string
  }[]
}

/**
 * Fetch hubbers.yml from github/thehub using a PAT.
 * Returns a Map keyed by login (the YAML top-level key).
 */
export async function fetchHubbersData(token: string): Promise<Map<string, HubberEntry>> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)

  try {
    const res = await fetch(
      'https://api.github.com/repos/github/thehub/contents/docs/_data/hubbers.yml',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.raw'
        },
        signal: controller.signal
      }
    )

    if (!res.ok) {
      if (res.status === 404 || res.status === 403) {
        throw new Error('Cannot access hubbers.yml. Your token may not have access to github/thehub.')
      }
      throw new Error(`Failed to fetch hubbers.yml: HTTP ${res.status}`)
    }

    const text = await res.text()
    const raw = parseYaml(text) as Record<string, Record<string, string>>

    const hubbers = new Map<string, HubberEntry>()
    for (const [key, entry] of Object.entries(raw)) {
      if (!entry || typeof entry !== 'object') continue
      hubbers.set(key, {
        github_login: entry.github_login || key,
        name: entry.name || key,
        title: entry.title || '',
        manager: entry.manager || '',
        cost_center: entry.cost_center || '',
        country: entry.country || '',
        state: entry.state,
        employment_type: entry.employment_type || ''
      })
    }

    return hubbers
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Find the user's entry and their direct reports from hubbers data.
 * The userLogin is matched against both the YAML key and the github_login field.
 */
export function detectTeamFromHubbers(
  hubbers: Map<string, HubberEntry>,
  userLogin: string
): TeamDetectionResult | null {
  const login = userLogin.toLowerCase()

  // Find the user's own entry
  let userEntry: HubberEntry | undefined
  for (const [key, entry] of hubbers) {
    if (key.toLowerCase() === login || entry.github_login.toLowerCase() === login) {
      userEntry = entry
      break
    }
  }

  if (!userEntry) return null

  // Find manager
  let managerEntry: HubberEntry | undefined
  if (userEntry.manager) {
    const mgrLogin = userEntry.manager.toLowerCase()
    for (const [key, entry] of hubbers) {
      if (key.toLowerCase() === mgrLogin || entry.github_login.toLowerCase() === mgrLogin) {
        managerEntry = entry
        break
      }
    }
  }

  // Find skip-level (manager's manager)
  let skipLevelEntry: HubberEntry | undefined
  if (managerEntry?.manager) {
    const skipLogin = managerEntry.manager.toLowerCase()
    for (const [key, entry] of hubbers) {
      if (key.toLowerCase() === skipLogin || entry.github_login.toLowerCase() === skipLogin) {
        skipLevelEntry = entry
        break
      }
    }
  }

  // Find direct reports (all hubbers whose manager matches this user)
  const directReports: TeamDetectionResult['directReports'] = []
  for (const [key, entry] of hubbers) {
    const mgrKey = entry.manager?.toLowerCase()
    if (mgrKey === login || mgrKey === userEntry.github_login.toLowerCase()) {
      // Also match against the YAML key if github_login differs
      directReports.push({
        name: entry.name,
        github: entry.github_login || key,
        title: entry.title,
        location: [entry.country, entry.state].filter(Boolean).join(', ')
      })
    }
  }

  // Sort by name
  directReports.sort((a, b) => a.name.localeCompare(b.name))

  return {
    user: {
      name: userEntry.name,
      title: userEntry.title,
      github: userEntry.github_login,
      manager: managerEntry
        ? { name: managerEntry.name, github: managerEntry.github_login, title: managerEntry.title }
        : undefined,
      skipLevel: skipLevelEntry
        ? { name: skipLevelEntry.name, github: skipLevelEntry.github_login, title: skipLevelEntry.title }
        : undefined
    },
    directReports
  }
}

/**
 * High-level: fetch hubbers.yml and detect the user's team.
 * Returns null if the token can't access thehub or the user isn't found.
 */
export async function detectTeam(
  userLogin: string,
  token: string
): Promise<TeamDetectionResult | null> {
  try {
    const hubbers = await fetchHubbersData(token)
    const result = detectTeamFromHubbers(hubbers, userLogin)
    return result
  } catch (err) {
    console.error('[Hubbers] Team detection failed:', (err as Error).message)
    return null
  }
}
