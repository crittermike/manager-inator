import { useParams, useNavigate } from 'react-router-dom'
import { useReportData, useFileContent } from '../hooks/useData'
import { useAI } from '../hooks/useAI'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Github,
  Briefcase,
  FileText,
  MessageSquare,
  CheckSquare,
  Star,
  BookOpen,
  Sparkles,
  X,
  Clock
} from 'lucide-react'

type Tab = 'overview' | 'checkins' | 'transcripts' | 'feedback' | 'actions' | 'reviews'

export function ReportDetail() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const { report, loading, error } = useReportData(name)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const { content: fileContent, loading: fileLoading } = useFileContent(selectedFile)
  const { streaming, streamedText, generate, cancel, reset } = useAI()
  const [showAI, setShowAI] = useState(false)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-400">
        {error || 'Report not found'}
      </div>
    )
  }

  const tabs: { id: Tab; label: string; icon: typeof FileText; count?: number }[] = [
    { id: 'overview', label: 'Overview', icon: BookOpen },
    { id: 'checkins', label: 'Check-ins', icon: FileText, count: report.checkIns.length },
    { id: 'transcripts', label: 'Transcripts', icon: MessageSquare, count: report.transcripts.length },
    { id: 'feedback', label: 'Feedback', icon: Star, count: report.feedback.length },
    { id: 'actions', label: 'Action items', icon: CheckSquare, count: report.actionItems.length },
    { id: 'reviews', label: 'Reviews', icon: BookOpen, count: report.reviews.length }
  ]

  const handlePrepOneOnOne = async () => {
    setShowAI(true)
    reset()

    // Load actual content for recent summaries
    const recentSummaryDates = report.summaries.slice(-5)
    const summaryContents = await Promise.all(
      recentSummaryDates.map(async (s) => {
        try {
          const content = await window.api.getFileContent(`reports/${name}/summaries/${s.date}.md`)
          return content
        } catch { return '' }
      })
    )
    const summariesText = summaryContents.filter(Boolean).join('\n\n---\n\n')
    const openActions = report.actionItems.filter(a => !a.completed).map(a => `- [ ] ${a.text}`).join('\n')

    await generate('prep-one-on-one', {
      reportName: report.profile.displayName,
      summaries: summariesText || 'No recent summaries available.',
      actionItems: openActions || 'No open action items.',
      feedback: report.feedback.slice(-3).map(f => `${f.date} (${f.type}): ${f.content}`).join('\n---\n')
    })
  }

  const handleGenerateCheckIn = async () => {
    setShowAI(true)
    reset()
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    await generate('generate-checkin', {
      reportName: report.profile.displayName,
      displayName: report.profile.displayName,
      month,
      monthName: now.toLocaleString('default', { month: 'long', year: 'numeric' }),
      summaries: report.summaries.slice(-8).map(s => s.date).join(', '),
      feedback: report.feedback.map(f => `${f.date}: ${f.content}`).join('\n---\n'),
      goals: report.goals.map(g => `${g.title}: ${g.status}`).join('\n'),
      actionItems: report.actionItems.filter(a => !a.completed).slice(0, 20).map(a => `- ${a.text}`).join('\n')
    })
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Back button */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to dashboard
      </button>

      {/* Profile header */}
      <div className="flex items-start gap-5">
        <div className="w-16 h-16 rounded-2xl bg-brand/20 flex items-center justify-center text-xl font-bold text-brand-light shrink-0">
          {report.profile.displayName.split(' ').map(n => n[0]).join('')}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-zinc-100">
            {report.profile.displayName}
          </h1>
          <div className="flex items-center gap-4 mt-1.5 text-sm text-zinc-500 flex-wrap">
            {report.profile.role && (
              <span className="flex items-center gap-1">
                <Briefcase className="w-3.5 h-3.5" />
                {report.profile.role}
              </span>
            )}
            {report.profile.github && (
              <span className="flex items-center gap-1">
                <Github className="w-3.5 h-3.5" />
                @{report.profile.github}
              </span>
            )}
            {report.profile.meetingDay && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {report.profile.meetingDay}s
              </span>
            )}
            {report.profile.location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {report.profile.location}
              </span>
            )}
          </div>
        </div>

        {/* AI actions */}
        <div className="flex gap-2 shrink-0">
          <button
            onClick={handlePrepOneOnOne}
            className="flex items-center gap-2 px-3 py-2 bg-brand/10 text-brand-light rounded-lg text-sm hover:bg-brand/20 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Prep 1:1
          </button>
          <button
            onClick={handleGenerateCheckIn}
            className="flex items-center gap-2 px-3 py-2 bg-surface-raised text-zinc-300 rounded-lg text-sm hover:bg-surface-overlay transition-colors"
          >
            <FileText className="w-4 h-4" />
            Generate check-in
          </button>
        </div>
      </div>

      {/* AI panel (slides in when active) */}
      {showAI && (
        <div className="bg-surface rounded-xl border border-brand/20 p-5 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-sm font-medium text-brand-light">
              <Sparkles className="w-4 h-4" />
              AI output
            </div>
            <div className="flex items-center gap-2">
              {streaming && (
                <button
                  onClick={cancel}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Stop generating
                </button>
              )}
              <button
                onClick={() => setShowAI(false)}
                className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className={`prose-dark max-h-96 overflow-y-auto ${streaming ? 'cursor-blink' : ''}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {streamedText || '_Generating..._'}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            onClick={() => { setActiveTab(id); setSelectedFile(null) }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === id
                ? 'border-brand text-brand-light'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {count !== undefined && count > 0 && (
              <span className="text-[11px] bg-surface-raised px-1.5 py-0.5 rounded-full">
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-h-[400px]">
        {/* Overview */}
        {activeTab === 'overview' && report.dashboard && (
          <div className="prose-dark">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.dashboard}</ReactMarkdown>
          </div>
        )}

        {/* Check-ins */}
        {activeTab === 'checkins' && (
          <div className="space-y-2">
            {report.checkIns.length === 0 ? (
              <EmptyState icon={FileText} text="No check-ins yet" action="Generate check-in" onAction={handleGenerateCheckIn} />
            ) : (
              <>
                {selectedFile && fileContent ? (
                  <div>
                    <button onClick={() => setSelectedFile(null)} className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 mb-4">
                      <ArrowLeft className="w-3 h-3" /> Back to list
                    </button>
                    <div className="prose-dark">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{fileContent}</ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  report.checkIns.map((c) => (
                    <button
                      key={c.date}
                      onClick={() => setSelectedFile(`reports/${name}/check-ins/monthly/${c.date}.md`)}
                      className="w-full flex items-center gap-3 p-3 bg-surface rounded-lg border border-border hover:border-brand/30 transition-all text-left"
                    >
                      <Calendar className="w-4 h-4 text-zinc-500 shrink-0" />
                      <span className="text-sm text-zinc-300">{c.date}</span>
                    </button>
                  ))
                )}
              </>
            )}
          </div>
        )}

        {/* Transcripts */}
        {activeTab === 'transcripts' && (
          <div className="space-y-2">
            {report.transcripts.length === 0 ? (
              <EmptyState icon={MessageSquare} text="No transcripts yet" />
            ) : (
              <>
                {selectedFile && fileContent ? (
                  <div>
                    <button onClick={() => setSelectedFile(null)} className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 mb-4">
                      <ArrowLeft className="w-3 h-3" /> Back to list
                    </button>
                    <div className="prose-dark">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{fileContent}</ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  [...report.transcripts].reverse().map((t) => (
                    <button
                      key={t.date}
                      onClick={() => setSelectedFile(`reports/${name}/transcripts/${t.date}.md`)}
                      className="w-full flex items-center gap-3 p-3 bg-surface rounded-lg border border-border hover:border-brand/30 transition-all text-left"
                    >
                      <MessageSquare className="w-4 h-4 text-zinc-500 shrink-0" />
                      <span className="text-sm text-zinc-300">{t.date}</span>
                      {t.hasSummary && (
                        <span className="text-[11px] bg-success/10 text-success px-2 py-0.5 rounded-full">
                          Summarized
                        </span>
                      )}
                    </button>
                  ))
                )}
              </>
            )}
          </div>
        )}

        {/* Feedback */}
        {activeTab === 'feedback' && (
          <div className="space-y-3">
            {report.feedback.length === 0 ? (
              <EmptyState icon={Star} text="No feedback logged yet" />
            ) : (
              report.feedback.map((f, i) => (
                <div key={i} className="p-4 bg-surface rounded-xl border border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-sm font-medium ${
                      f.type === 'positive' ? 'text-success' :
                      f.type === 'constructive' ? 'text-warning' : 'text-info'
                    }`}>
                      {f.type === 'positive' ? '🌟' : f.type === 'constructive' ? '🔧' : '💬'}
                      {' '}{f.type.charAt(0).toUpperCase() + f.type.slice(1)}
                    </span>
                    <span className="text-xs text-zinc-600">·</span>
                    <span className="text-xs text-zinc-500">{f.date}</span>
                    {f.source && (
                      <>
                        <span className="text-xs text-zinc-600">·</span>
                        <span className="text-xs text-zinc-500">from {f.source}</span>
                      </>
                    )}
                  </div>
                  <p className="text-sm text-zinc-300 leading-relaxed">{f.content}</p>
                  {f.context && (
                    <a
                      href={f.context}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-brand-light hover:text-brand mt-2"
                    >
                      View context →
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Action items */}
        {activeTab === 'actions' && (
          <div className="space-y-1">
            {report.actionItems.length === 0 ? (
              <EmptyState icon={CheckSquare} text="No action items" />
            ) : (
              <>
                <div className="flex items-center gap-4 mb-4 text-sm text-zinc-500">
                  <span>{report.actionItems.filter(a => !a.completed).length} open</span>
                  <span>{report.actionItems.filter(a => a.completed).length} completed</span>
                </div>
                {report.actionItems.filter(a => !a.completed).slice(0, 50).map((a, i) => (
                  <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-surface transition-colors">
                    <div className="w-4 h-4 mt-0.5 border border-zinc-600 rounded shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-zinc-300">{a.text}</span>
                      {a.owner && a.owner !== 'Unknown' && (
                        <span className="ml-2 text-xs text-zinc-500">({a.owner})</span>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* Reviews */}
        {activeTab === 'reviews' && (
          <div className="space-y-2">
            {report.reviews.length === 0 ? (
              <EmptyState icon={BookOpen} text="No reviews on file" />
            ) : (
              <>
                {selectedFile && fileContent ? (
                  <div>
                    <button onClick={() => setSelectedFile(null)} className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 mb-4">
                      <ArrowLeft className="w-3 h-3" /> Back to list
                    </button>
                    <div className="prose-dark">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{fileContent}</ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  report.reviews.map((r) => (
                    <button
                      key={r.period}
                      onClick={() => setSelectedFile(`reports/${name}/reviews/${r.period}.md`)}
                      className="w-full flex items-center gap-3 p-3 bg-surface rounded-lg border border-border hover:border-brand/30 transition-all text-left"
                    >
                      <BookOpen className="w-4 h-4 text-zinc-500 shrink-0" />
                      <span className="text-sm text-zinc-300">{r.period}</span>
                    </button>
                  ))
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Empty state component
function EmptyState({
  icon: Icon,
  text,
  action,
  onAction
}: {
  icon: typeof FileText
  text: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="w-8 h-8 text-zinc-700 mb-3" />
      <p className="text-sm text-zinc-500">{text}</p>
      {action && onAction && (
        <button
          onClick={onAction}
          className="mt-3 text-sm text-brand-light hover:text-brand transition-colors"
        >
          {action}
        </button>
      )}
    </div>
  )
}
