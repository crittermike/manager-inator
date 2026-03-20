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
}

// ── Feedback entry ──
export interface FeedbackEntry {
  date: string
  type: 'positive' | 'constructive' | 'mixed'
  source: string
  context?: string
  content: string
}

// ── Goal ──
export interface Goal {
  title: string
  category: 'Technical' | 'Impact' | 'Leadership' | 'Career'
  description: string
  successCriteria: string
  timeline: string
  status: '🔴 Not Started' | '🟡 In Progress' | '🟢 On Track' | '✅ Complete' | '❌ Missed'
  section: 'active' | 'stretch' | 'development'
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
  goals: Goal[]
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
}

// ── App settings ──
export interface AppSettings {
  githubToken: string | null
  repoOwner: string
  repoName: string
  defaultModel: string
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

  // AI
  aiGenerate: (
    action: string,
    context: Record<string, unknown>,
    onChunk: (chunk: string) => void
  ) => Promise<string>
  aiCancel: () => Promise<void>
}
