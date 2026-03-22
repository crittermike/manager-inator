import Store from 'electron-store'
import { safeStorage } from 'electron'
import type { CheckInFrequency, DayOfWeek } from '../shared/types'

interface StoreSchema {
  githubToken: string | null
  repoOwner: string
  repoName: string
  repoPath: string
  defaultModel: string
  checkInFrequency: CheckInFrequency
  feedbackReminderDays: number
  sprintLengthWeeks: number
  endOfWeekDay: DayOfWeek
  sprintStartDate: string
  aiCustomInstructions: string
}

const storeDefaults: StoreSchema = {
  githubToken: null,
  repoOwner: '',
  repoName: '',
  repoPath: '',
  defaultModel: 'gpt-4.1',
  checkInFrequency: 'monthly',
  feedbackReminderDays: 14,
  sprintLengthWeeks: 2,
  endOfWeekDay: 'friday',
  sprintStartDate: '',
  aiCustomInstructions: ''
}

function createStore(): Store<StoreSchema> {
  try {
    const s = new Store<StoreSchema>({
      defaults: storeDefaults,
      encryptionKey: 'manager-inator-v1'
    })
    s.get('repoPath')
    return s
  } catch (err) {
    console.error('[Store] Corrupted store file, resetting:', (err as Error).message)
    const s = new Store<StoreSchema>({
      defaults: storeDefaults,
      encryptionKey: 'manager-inator-v1'
    })
    s.clear()
    return s
  }
}

const store = createStore()

export function getToken(): string | null {
  const raw = store.get('githubToken')
  if (!raw) return null

  if (!safeStorage.isEncryptionAvailable()) return raw

  try {
    return safeStorage.decryptString(Buffer.from(raw, 'base64'))
  } catch {
    // Legacy plaintext token — migrate it on read
    try {
      const encrypted = safeStorage.encryptString(raw)
      store.set('githubToken', encrypted.toString('base64'))
    } catch { /* migration failed, keep as-is */ }
    return raw
  }
}

export function setToken(token: string): void {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(token)
    store.set('githubToken', encrypted.toString('base64'))
  } else {
    console.warn('[Store] OS encryption unavailable — token stored without OS-level encryption')
    store.set('githubToken', token)
  }
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
    defaultModel: store.get('defaultModel'),
    aiCustomInstructions: store.get('aiCustomInstructions')
  }
}

/** Settings safe for the renderer — excludes the raw token */
export function getSettingsForRenderer() {
  return {
    hasToken: !!store.get('githubToken'),
    repoOwner: store.get('repoOwner'),
    repoName: store.get('repoName'),
    repoPath: store.get('repoPath'),
    defaultModel: store.get('defaultModel'),
    checkInFrequency: store.get('checkInFrequency'),
    feedbackReminderDays: store.get('feedbackReminderDays'),
    sprintLengthWeeks: store.get('sprintLengthWeeks'),
    endOfWeekDay: store.get('endOfWeekDay'),
    sprintStartDate: store.get('sprintStartDate'),
    aiCustomInstructions: store.get('aiCustomInstructions')
  }
}

export function saveSettings(settings: Partial<StoreSchema>): void {
  for (const [key, value] of Object.entries(settings)) {
    store.set(key as keyof StoreSchema, value)
  }
}
