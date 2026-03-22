// ── Report profile parsed from profile.md ──
export interface ReportProfile {
  name: string
  displayName: string
  role: string
  team: string
  github: string
  startDate: string
  meetingDay: string
  location: string
  manager: string
  about: string
  communicationPreferences: Record<string, string>
}

// ── Check-in document ──
export interface CheckIn {
  date: string // YYYY-MM
  content: string
  accomplishments: string[]
  concerns: string[]
  githubActivity: Record<string, string | number>
}

// ── 1:1 Summary ──
export interface Summary {
  date: string // YYYY-MM-DD
  content: string
  keyTopics: string[]
  actionItems: ActionItem[]
  sentiment: string
}

// ── Transcript ──
export interface Transcript {
  date: string // YYYY-MM-DD
  content: string
  hasSummary: boolean
}

// ── Action Item ──
export interface ActionItem {
  text: string
  owner: string
  due?: string
  completed: boolean
  sourceFile?: string // path to the file containing this item (e.g. meetings/2026-03-11-nic-1-1-summary.md)
  sourceLine?: string // the exact line text (kept for display/debug)
  sourceLineNumber?: number // 0-based line index in sourceFile for precise toggle
}

// ── Feedback entry ──
export interface FeedbackEntry {
  date: string
  type: 'positive' | 'constructive' | 'mixed'
  source: string
  context?: string
  content: string
}

// ── Cadence settings (customizable management rhythm) ──
export type CheckInFrequency = 'monthly' | 'bimonthly' | 'quarterly'
export interface CadenceSettings {
  checkInFrequency: CheckInFrequency
  feedbackReminderDays: number
}

// ── Report (aggregate of all data for one person) ──
export interface Report {
  name: string // directory name
  profile: ReportProfile
  checkIns: CheckIn[]
  summaries: Summary[]
  transcripts: Transcript[]
  actionItems: ActionItem[]
  feedback: FeedbackEntry[]
  reviews: { period: string; content: string }[]
  dashboard: string
}

// ── Team dashboard data ──
export interface TeamOverview {
  reports: ReportStatus[]
  attentionItems: string[]
  lastUpdated: string
}

export interface ReportStatus {
  name: string
  displayName: string
  lastOneOnOne: string | null
  daysGap: number
  openActionItems: number
  status: 'on-track' | 'needs-attention' | 'at-risk'
  meetingDay?: string
  lastCheckIn: string | null   // YYYY-MM or null
  lastFeedback: string | null  // YYYY-MM-DD or null
  feedbackCount: number
  checkInCount: number
}

// ── Manager workflow checklist item ──
export type WorkflowCategory = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'weekend-preview'
export type WorkflowPriority = 'high' | 'medium' | 'low'

export interface WorkflowItem {
  id: string
  label: string
  description?: string
  category: WorkflowCategory
  priority: WorkflowPriority
  /** Route to navigate to when clicked */
  route?: string
  /** Name of the report this item relates to (if any) */
  reportName?: string
  /** Whether it's auto-completable from data (vs. manual check-off) */
  autoComplete?: boolean
}

// ── App settings (renderer-safe — token is never exposed) ──
export interface AppSettings {
  hasToken: boolean
  repoOwner: string
  repoName: string
  repoPath: string
  defaultModel: string
  checkInFrequency: CheckInFrequency
  feedbackReminderDays: number
}

// ── Meeting entry (from listMeetings) ──
export interface MeetingEntry {
  date: string
  title: string
  filename: string
  hasSummary: boolean
}

// ── Person entry (from listPeople) ──
export interface PersonEntry {
  name: string
  slug: string
  aliases: string[]
  meetingCount: number
  lastSeen: string
  role: string
  github: string
  location: string
  relationship: string
}

// ── Meeting reference (from getPersonMeetings) ──
export interface MeetingRef {
  date: string
  title: string
  filename: string
}

// ── Settings options (from getSettingsOptions) ──
export interface SettingsOptions {
  roles: string[]
  relationships: string[]
}

// ── IPC channel types ──
export interface IpcApi {
  // Auth
  getAuthStatus: () => Promise<{ authenticated: boolean; user?: string }>
  startAuth: () => Promise<{ userCode: string; verificationUri: string }>
  pollAuth: () => Promise<boolean>
  logout: () => Promise<void>

  // Settings
  getSettings: () => Promise<AppSettings>
  saveSettings: (settings: Partial<AppSettings>) => Promise<void>

  // GitHub data
  getReports: () => Promise<string[]>
  getReportProfile: (name: string) => Promise<ReportProfile>
  getReportData: (name: string) => Promise<Report>
  getTeamOverview: () => Promise<TeamOverview>
  getFileContent: (path: string) => Promise<string>
  commitFile: (path: string, content: string, message: string) => Promise<void>
  listMeetings: () => Promise<MeetingEntry[]>
  listPeople: () => Promise<PersonEntry[]>
  getPersonMeetings: (slug: string) => Promise<MeetingRef[]>
  findPersonByName: (name: string) => Promise<string | null>
  getImpactLog: () => Promise<string>
  getSettingsOptions: () => Promise<SettingsOptions>
  saveMeetingTitle: (filename: string, title: string) => Promise<void>
  toggleActionItem: (sourceFile: string, lineNumber: number) => Promise<void>
  clearCaches: () => Promise<void>
  backfillSummaries: (filenames: string[]) => Promise<{ filename: string; success: boolean; error?: string }[]>
  onBackfillProgress: (cb: (data: { filename: string; status: string; error?: string }) => void) => () => void
  onPushStatus: (cb: (data: { success: boolean; error?: string }) => void) => () => void
  cancelBackfill: () => Promise<void>

  // AI
  aiGenerate: (
    action: string,
    context: Record<string, unknown>,
    onChunk: (chunk: string) => void,
    requestId: string
  ) => Promise<string>
  aiCancel: (requestId?: string) => Promise<void>

  // Electron dialogs
  showOpenDialog: (options: { properties: string[]; title?: string }) => Promise<string | null>
}
