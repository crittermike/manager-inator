import Store from 'electron-store'

interface StoreSchema {
  githubToken: string | null
  repoOwner: string
  repoName: string
  repoPath: string
  defaultModel: string
  cachedReports: Record<string, { data: unknown; timestamp: number }>
}

const store = new Store<StoreSchema>({
  defaults: {
    githubToken: null,
    repoOwner: '',
    repoName: '',
    repoPath: '',
    defaultModel: 'gpt-4.1',
    cachedReports: {}
  },
  encryptionKey: 'manager-inator-v1'
})

export function getToken(): string | null {
  return store.get('githubToken')
}

export function setToken(token: string): void {
  store.set('githubToken', token)
}

export function clearToken(): void {
  store.set('githubToken', null)
}

export function getRepoConfig(): { owner: string; name: string } {
  return {
    owner: store.get('repoOwner'),
    name: store.get('repoName')
  }
}

export function setRepoConfig(owner: string, name: string): void {
  store.set('repoOwner', owner)
  store.set('repoName', name)
}

export function getSettings() {
  return {
    githubToken: store.get('githubToken'),
    repoOwner: store.get('repoOwner'),
    repoName: store.get('repoName'),
    repoPath: store.get('repoPath'),
    defaultModel: store.get('defaultModel')
  }
}

export function saveSettings(settings: Partial<StoreSchema>): void {
  for (const [key, value] of Object.entries(settings)) {
    store.set(key as keyof StoreSchema, value)
  }
}

// Cache helpers
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export function getCached<T>(key: string): T | null {
  const cached = store.get('cachedReports') as Record<string, { data: unknown; timestamp: number }>
  const entry = cached[key]
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data as T
  }
  return null
}

export function setCache(key: string, data: unknown): void {
  const cached = store.get('cachedReports') as Record<string, { data: unknown; timestamp: number }>
  cached[key] = { data, timestamp: Date.now() }
  store.set('cachedReports', cached)
}

export function clearCache(): void {
  store.set('cachedReports', {})
}
