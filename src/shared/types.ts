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
  timezone: string
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
  updatedAt?: string
}

// ── 1:1 Summary ──
export interface Summary {
  date: string // YYYY-MM-DD
  content: string
  keyTopics: string[]
  actionItems: ActionItem[]
  sentiment: string
  filename?: string // e.g. "2026-03-19-steve-1-1.md" — used for unique keys & navigation
}

// ── Transcript ──
export interface Transcript {
  date: string // YYYY-MM-DD
  content: string
  filename?: string // e.g. "2026-03-19-steve-1-1.md" — used for unique keys & navigation
}

// ── Action Item ──
export interface ActionItem {
  text: string
  owner: string
  due?: string
  completed: boolean
  sourceFile?: string // path to the file containing this item (e.g. contexts/2026-03-11-nic-1-1.md)
  sourceLine?: string // the exact line text (kept for display/debug)
  sourceLineNumber?: number // 0-based line index in sourceFile for precise toggle
}

// ── Feedback entry ──
export interface FeedbackEntry {
  date: string
  type: 'positive' | 'constructive' | 'mixed' | 'observation'
  source: string
  context?: string
  content: string
}

// ── Team-wide action item (extends ActionItem with report context) ──
export interface TeamActionItem extends ActionItem {
  reportName: string
  displayName: string
}


// ── Cadence settings (customizable management rhythm) ──
export type CheckInFrequency = 'monthly' | 'bimonthly' | 'quarterly'
export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday'
export type CadenceType = 'daily' | 'weekly' | 'sprint' | 'monthly' | 'quarterly' | 'semi-annual'
export interface PracticeSchedule {
  anchorDate: string   // ISO date of next/reference occurrence
  intervalDays: number // days between occurrences
}

export interface CadenceSettings {
  checkInFrequency: CheckInFrequency
  feedbackReminderDays: number
  sprintLengthWeeks: number       // 1 | 2 | 3 | 4
  endOfWeekDay: DayOfWeek         // when weekly reflection triggers
  snippetDay: DayOfWeek           // when weekly snippet triggers
  sprintStartDate: string         // ISO date of a known sprint start (for calculating sprint boundaries)
  staleActionDays: number         // days before an open action item is flagged as stale
}

// ── Custom practice definition (user-created) ──
export interface CustomPractice {
  id: string
  name: string
  description: string
  cadence: CadenceType
  frequency: string
  trigger: string
  perReport: boolean
}

// ── Captured context note ──
export interface ContextNote {
  date: string // YYYY-MM-DD
  source: 'slack' | 'github' | 'email' | 'meeting' | 'feedback' | 'other'
  title: string // display title (from YAML frontmatter or derived from filename)
  summary: string
  tags: string[]
  people: string[] // person slugs (e.g. ['nic-daantos', 'steve-grant'])
  content: string // raw pasted content
  filename: string // e.g. "2026-03-26-slack-thread.md"
}

export type ContextSource = ContextNote['source']

// ── 1:1 Prep entry ──
export interface PrepEntry {
  date: string // YYYY-MM-DD
  content: string
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
  reviews: { period: string; title: string; content: string }[]
  preps: PrepEntry[]
  contextNotes: ContextNote[]
  jobExpectations: string
}

// ── Team overview data ──
export interface TeamOverview {
  reports: ReportStatus[]
  attentionItems: string[]
  lastUpdated: string
}

export interface ReportStatus {
  name: string
  displayName: string
  github: string
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
export type WorkflowCategory = 'daily' | 'weekly' | 'monthly' | 'weekend-preview'
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
  sprintLengthWeeks: number
  endOfWeekDay: DayOfWeek
  snippetDay: DayOfWeek
  sprintStartDate: string
  staleActionDays: number
  aiCustomInstructions: string
  disabledPractices: string[]
  snoozedPractices: Record<string, string>
  customPractices: CustomPractice[]
  practiceCompletions: Record<string, string>
  practiceSchedules: Record<string, PracticeSchedule>
  snoozedActionItems: Record<string, string>
  snoozedItems: Record<string, string>
  ptoReports: Record<string, string>
  deactivatedReports: string[]
  hasGithubOrgToken: boolean
  githubOrgName: string
  userName: string
  userGithub: string
}

// ── Context entry (from listContexts) ──
export interface ContextEntry {
  date: string
  source: ContextSource
  title: string
  filename: string
  processed: boolean
}

export interface ContentSearchResult {
  filename: string
  directory: 'contexts' | 'reports' | 'people' | 'notes'
  title: string
  snippet: string
  date?: string
  source?: ContextSource
}

// ── GitHub Activity (org-level PR/issue tracking) ──
export interface ActivityComment {
  author: string
  body: string
  createdAt: string
  /** For PR reviews: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' */
  reviewState?: string
}

export interface GitHubActivityItem {
  id: number
  type: 'pr' | 'issue' | 'discussion'
  title: string
  url: string
  repo: string              // e.g. "org/repo-name"
  state: 'open' | 'closed' | 'merged'
  createdAt: string         // ISO 8601
  updatedAt: string         // ISO 8601
  /** Number of comments on the item */
  comments: number
  /** Labels applied to the item */
  labels: string[]
  /** How the person relates to this item */
  role?: 'author' | 'commenter'
  /** PR review comments (only populated when content is fetched) */
  reviewComments?: ActivityComment[]
  /** Issue/PR comments (only populated when content is fetched) */
  issueComments?: ActivityComment[]
  /** AI-generated content summary (set after analysis) */
  contentSummary?: string
}

export interface PersonActivityResult {
  reportName: string
  displayName: string
  githubUsername: string
  items: GitHubActivityItem[]
  startDate: string
  endDate: string
  fetchedAt: string
}

export interface TeamMemberActivity {
  reportName: string        // directory name from reports/
  displayName: string
  githubUsername: string
  items: GitHubActivityItem[]
  /** null = not yet fetched, string = error message */
  error: string | null
}

export interface MonthlyActivityStats {
  prsMerged: { title: string; url: string; repo: string; mergedAt: string }[]
  prsReviewed: { title: string; url: string; repo: string }[]
  issuesCreated: { title: string; url: string; repo: string; state: string }[]
  issuesClosed: { title: string; url: string; repo: string }[]
  discussionsCreated: { title: string; url: string; repo: string }[]
  counts: {
    prsMerged: number
    prsReviewed: number
    issuesCreated: number
    issuesClosed: number
    discussionsCreated: number
  }
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

// ── Context reference (from getPersonContexts) ──
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

// ── Create report optional fields ──
export interface CreateReportFields {
  role?: string
  team?: string
  github?: string
  meetingDay?: string
  location?: string
  startDate?: string
}

// ── IPC channel types ──
export interface IpcApi {
  // Auth
  getAuthStatus: () => Promise<{ authenticated: boolean; user?: string }>
  startAuth: () => Promise<{ userCode: string; verificationUri: string }>
  pollAuth: () => Promise<{ success: boolean; error?: string; retryAfter?: number; user?: string }>
  logout: () => Promise<void>

  // Settings
  getSettings: () => Promise<AppSettings>
  saveSettings: (settings: Partial<AppSettings>) => Promise<void>

  // GitHub data
  getReports: () => Promise<string[]>
  initializeRepo: (repoDir: string) => Promise<void>
  isGitRepo: (path: string) => Promise<boolean>
  createReport: (displayName: string, fields?: CreateReportFields) => Promise<string>
  getReportProfile: (name: string) => Promise<ReportProfile>
  getReportData: (name: string) => Promise<Report>
  getTeamOverview: () => Promise<TeamOverview>
  getFileContent: (path: string) => Promise<string>
  getFileBase64: (path: string) => Promise<string>
  getFilesContentBulk: (paths: string[]) => Promise<Record<string, string>>
  commitFile: (path: string, content: string, message: string) => Promise<void>
  commitBinaryFile: (path: string, base64Data: string, message: string) => Promise<void>
  validateGithubToken: (token: string) => Promise<boolean>
  deleteFile: (path: string) => Promise<void>
  listContexts: () => Promise<ContextEntry[]>
  listPeople: () => Promise<PersonEntry[]>
  getPersonContexts: (slug: string) => Promise<MeetingRef[]>
  findPersonByName: (name: string) => Promise<string | null>
  getImpactLog: () => Promise<string>
  listWeeklyLog: () => Promise<{ filename: string; title: string; date: string; category: string }[]>
  getSettingsOptions: () => Promise<SettingsOptions>
  saveMeetingTitle: (filename: string, title: string) => Promise<void>
  saveMeetingSpeakers: (filename: string, speakers: string[]) => Promise<void>
  addPersonToContext: (contextFilename: string, personSlug: string) => Promise<void>
  toggleActionItem: (sourceFile: string, lineNumber: number) => Promise<void>
  resolveAndToggleActionItem: (reportName: string, prepText: string) => Promise<boolean>
  getOpenActionItemsForPeople: (slugs: string[]) => Promise<{ slug: string; items: ActionItem[] }[]>
  getTeamActionItems: () => Promise<TeamActionItem[]>
  getTodayBootstrap: () => Promise<{ contexts: ContextEntry[]; teamActionItems: TeamActionItem[] }>
  clearCaches: () => Promise<void>
  getPrewarmStatus: () => Promise<boolean>
  getPrewarmProgress: () => Promise<{ ready: boolean; message: string }>
  getTeamActivity: () => Promise<TeamMemberActivity[]>
  getRecentTeamContext: (days: number) => Promise<Record<string, { date: string; source: string; title: string; summary: string }[]>>
  getMonthlyActivity: (reportName: string, year: number, month: number) => Promise<MonthlyActivityStats | null>
  fetchActivityForPerson: (reportName: string, startDate: string, endDate: string) => Promise<PersonActivityResult | null>
  saveActivitySnapshot: (reportName: string, startDate: string, endDate: string) => Promise<string>
  updateFeedbackEntry: (reportName: string, entryIndex: number, newContent: string, newType: FeedbackEntry['type']) => Promise<void>
  deleteFeedbackEntry: (reportName: string, entryIndex: number) => Promise<void>
  searchContent: (query: string) => Promise<ContentSearchResult[]>
  onLoadingProgress: (cb: (data: { message: string }) => void) => () => void
  onUpdateReady: (cb: (version: string) => void) => () => void
  installUpdate: () => Promise<void>
  startPrewarm: () => Promise<void>
  onPushStatus: (cb: (data: { success: boolean; error?: string }) => void) => () => void
  onAiToolStatus: (cb: (data: { requestId: string; toolName: string; args: Record<string, unknown> }) => void) => () => void
  onAiStreamReset: (cb: (data: { requestId: string }) => void) => () => void
  onAiFilesChanged: (cb: (data: { requestId: string; files: string[] }) => void) => () => void
  onDataFilesChanged?: (cb: (data: { paths: string[] }) => void) => () => void

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

  // Native macOS integration
  onNavigate: (cb: (route: string) => void) => () => void
  onOpenCapture: (cb: () => void) => () => void
  onTrayCapture: (cb: (content: string) => void) => () => void
  trayCaptureSubmit: (content: string) => Promise<void>
  trayCaptureClose: () => Promise<void>
  onTrayCaptureReset: (cb: () => void) => () => void
  findInPage: (text: string, options?: { forward?: boolean; findNext?: boolean }) => Promise<{ matches: number; activeMatchOrdinal: number } | null>
  stopFindInPage: () => Promise<void>
  onFindToggle: (cb: () => void) => () => void
  onFindNext: (cb: () => void) => () => void
  onFindPrev: (cb: () => void) => () => void
}
