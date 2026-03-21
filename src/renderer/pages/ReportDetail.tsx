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
  Clock,
  Save
} from 'lucide-react'

type Tab = 'overview' | 'checkins' | 'transcripts' | 'feedback' | 'actions' | 'reviews' | 'prep'

function cleanSummaryContent(content: string): string {
  let cleaned = content
  cleaned = cleaned.replace(/^---\n[\s\S]*?\n---\n*/m, '').trim()
  cleaned = cleaned.replace(/^Here(?:'s| is) (?:your |the )?(?:meeting )?summary:?\s*\n*/i, '').trim()
  cleaned = cleaned.replace(/^---\n*/m, '').trim()
  cleaned = cleaned.replace(/\*\*speakers:\*\*\n(?:[-*]\s+.+\n?)*/im, '').trim()
  cleaned = cleaned.replace(/## Attendees\n(?:[-*]\s+.+\n?)*/m, '').trim()
  return cleaned
}

export function ReportDetail() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const { report, loading, error, refresh } = useReportData(name)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [transcriptSubTab, setTranscriptSubTab] = useState<'summary' | 'transcript'>('summary')
  const { content: fileContent, loading: fileLoading } = useFileContent(selectedFile)
  const { streaming, streamedText, generate, cancel, reset, fullTextRef } = useAI()
  const [showAI, setShowAI] = useState(false)
  const [prepContent, setPrepContent] = useState<string | null>(null)
  const [prepLoading, setPrepLoading] = useState(false)
  const [prepSaving, setPrepSaving] = useState(false)

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
    { id: 'prep', label: 'Prep 1:1', icon: Sparkles },
    { id: 'checkins', label: 'Check-ins', icon: FileText, count: report.checkIns.length },
    { id: 'transcripts', label: '1-1s', icon: MessageSquare, count: report.transcripts.length },
    { id: 'feedback', label: 'Feedback', icon: Star, count: report.feedback.length },
    { id: 'actions', label: 'Action items', icon: CheckSquare, count: report.actionItems.length },
    { id: 'reviews', label: 'Reviews', icon: BookOpen, count: report.reviews.length }
  ]

  const handlePrepOneOnOne = async () => {
    setActiveTab('prep')
    setPrepLoading(true)
    setPrepContent(null)
    reset()

    // Load actual content for recent summaries
    const recentSummaryDates = report.summaries.slice(-5)
    const summaryContents = await Promise.all(
      recentSummaryDates.map(async (s) => {
        try {
          const content = await window.api.getFileContent(`meetings/${s.date}-${name}-1-1-summary.md`)
          return content
        } catch { return '' }
      })
    )
    const summariesText = summaryContents.filter(Boolean).join('\n\n---\n\n')
    const openActions = report.actionItems.filter(a => !a.completed).map(a => `- [ ] ${a.text}`).join('\n')

    let result = ''
    try {
      result = await generate('prep-one-on-one', {
        reportName: report.profile.displayName,
        summaries: summariesText || 'No recent summaries available.',
        actionItems: openActions || 'No open action items.',
        feedback: report.feedback.slice(-3).map(f => `${f.date} (${f.type}): ${f.content}`).join('\n---\n')
      })
    } catch (e) {
      console.error('Prep generation failed:', e)
    }
    // Use whatever source has content — result, ref, or state
    const content = result || fullTextRef.current
    console.log('[Prep] result length:', result?.length, 'ref length:', fullTextRef.current?.length)
    if (content) {
      setPrepContent(content)
    } else {
      setPrepContent('_Failed to generate prep. Try clicking Regenerate._')
    }
    setPrepLoading(false)
  }

  const handlePrepCheckboxToggle = (lineIndex: number) => {
    if (!prepContent) return
    const lines = prepContent.split('\n')
    const line = lines[lineIndex]
    if (line.includes('- [ ] ')) {
      lines[lineIndex] = line.replace('- [ ] ', '- [x] ')
    } else if (line.includes('- [x] ')) {
      lines[lineIndex] = line.replace('- [x] ', '- [ ] ')
    }
    setPrepContent(lines.join('\n'))
  }

  const handleSavePrep = async () => {
    if (!prepContent) return
    setPrepSaving(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      await window.api.commitFile(
        `reports/${name}/prep/${today}.md`,
        prepContent,
        `Save 1:1 prep for ${report.profile.displayName} on ${today}`
      )
    } catch (e) {
      console.error('Failed to save prep:', e)
    } finally {
      setPrepSaving(false)
    }
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
            onClick={handleGenerateCheckIn}
            className="flex items-center gap-2 px-3 py-2 bg-surface-raised text-zinc-300 rounded-lg text-sm hover:bg-surface-overlay transition-colors"
          >
            <FileText className="w-4 h-4" />
            Generate check-in
          </button>
        </div>
      </div>

      {/* AI panel for check-in generation */}
      {showAI && (
        <div className="bg-surface rounded-xl border border-brand/20 p-5 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-sm font-medium text-brand-light">
              <Sparkles className="w-4 h-4" />
              Generating check-in
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

        {/* Prep 1:1 */}
        {activeTab === 'prep' && (
          <div className="space-y-4">
            {!prepContent && !prepLoading && !streaming ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Sparkles className="w-8 h-8 text-zinc-700 mb-3" />
                <p className="text-sm text-zinc-400 mb-1">Generate an AI-powered prep document for your next 1:1</p>
                <p className="text-xs text-zinc-600 mb-4">
                  Includes carry-forward action items, discussion topics, and questions based on recent meetings and feedback.
                </p>
                <button
                  onClick={handlePrepOneOnOne}
                  className="flex items-center gap-2 px-5 py-3 bg-brand text-white rounded-xl font-medium text-sm hover:bg-brand-dark transition-colors"
                >
                  <Sparkles className="w-4 h-4" />
                  Generate prep
                </button>
              </div>
            ) : (prepLoading || streaming) && !prepContent ? (
              <div className="bg-surface rounded-xl border border-brand/20 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-brand-light">
                    <Sparkles className="w-4 h-4 animate-pulse" />
                    Generating prep...
                  </div>
                  <button onClick={() => { cancel(); setPrepLoading(false) }} className="text-xs text-zinc-500 hover:text-zinc-300">
                    Cancel
                  </button>
                </div>
                <div className="prose-dark cursor-blink">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamedText || '_Analyzing recent meetings..._'}</ReactMarkdown>
                </div>
              </div>
            ) : prepContent ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-zinc-500">Check items off during your 1:1. Save to keep a record.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={handlePrepOneOnOne}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-surface-raised rounded-lg transition-colors"
                    >
                      <Sparkles className="w-3 h-3" />
                      Regenerate
                    </button>
                    <button
                      onClick={handleSavePrep}
                      disabled={prepSaving}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand/10 text-brand-light hover:bg-brand/20 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Save className="w-3 h-3" />
                      {prepSaving ? 'Saving...' : 'Save to repo'}
                    </button>
                  </div>
                </div>
                <div className="bg-surface rounded-xl border border-border p-6">
                  {(() => {
                    const lines = prepContent.split('\n')
                    const hasCheckboxes = lines.some(l => /^(\s*)- \[[ x]\]/.test(l))
                    // If no checkboxes found, render as regular markdown
                    if (!hasCheckboxes) {
                      return (
                        <div className="prose-dark">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{prepContent}</ReactMarkdown>
                        </div>
                      )
                    }
                    return lines.map((line, i) => {
                      const unchecked = line.match(/^(\s*)- \[ \] (.+)/)
                      const checked = line.match(/^(\s*)- \[x\] (.+)/)
                      if (unchecked) {
                        return (
                          <label key={i} className="flex items-start gap-2.5 py-1.5 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={false}
                              onChange={() => handlePrepCheckboxToggle(i)}
                              className="mt-1 accent-brand w-4 h-4 shrink-0"
                            />
                            <span className="text-sm text-zinc-300 group-hover:text-zinc-100 leading-relaxed">
                              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: ({ children }) => <>{children}</> }}>{unchecked[2]}</ReactMarkdown>
                            </span>
                          </label>
                        )
                      }
                      if (checked) {
                        return (
                          <label key={i} className="flex items-start gap-2.5 py-1.5 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={true}
                              onChange={() => handlePrepCheckboxToggle(i)}
                              className="mt-1 accent-brand w-4 h-4 shrink-0"
                            />
                            <span className="text-sm text-zinc-500 line-through leading-relaxed">
                              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: ({ children }) => <>{children}</> }}>{checked[2]}</ReactMarkdown>
                            </span>
                          </label>
                        )
                      }
                      if (line.match(/^#{1,3}\s/)) {
                        return <h3 key={i} className="text-base font-semibold text-zinc-100 mt-5 mb-2 first:mt-0">{line.replace(/^#{1,3}\s*/, '')}</h3>
                      }
                      if (line.match(/^-\s/)) {
                        return <p key={i} className="text-sm text-zinc-400 pl-1 py-0.5 leading-relaxed">• {line.replace(/^-\s*/, '')}</p>
                      }
                      if (line.trim() === '' || line.match(/^---/)) return <div key={i} className="h-1" />
                      if (line.trim()) return <p key={i} className="text-sm text-zinc-400 py-0.5 leading-relaxed">{line}</p>
                      return null
                    })
                  })()}
                </div>
              </div>
            ) : null}
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
                    <button onClick={() => { setSelectedFile(null); setTranscriptSubTab('summary') }} className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 mb-4">
                      <ArrowLeft className="w-3 h-3" /> Back to list
                    </button>
                    {/* Sub-tabs for summary vs raw transcript */}
                    {(() => {
                      const dateMatch = selectedFile.match(/meetings\/(\d{4}-\d{2}-\d{2})/)
                      const date = dateMatch?.[1] || ''
                      const hasSummary = report.transcripts.find(t => t.date === date)?.hasSummary
                      const summaryFile = `meetings/${date}-${name}-1-1-summary.md`
                      const transcriptFile = `meetings/${date}-${name}-1-1.md`
                      const isSummaryView = transcriptSubTab === 'summary' && hasSummary
                      const currentFile = isSummaryView ? summaryFile : transcriptFile
                      // Update selectedFile if sub-tab changed
                      if (currentFile !== selectedFile) {
                        setTimeout(() => setSelectedFile(currentFile), 0)
                      }
                      return hasSummary ? (
                        <div className="flex gap-1 mb-4 bg-surface rounded-lg p-1 w-fit border border-border">
                          <button
                            onClick={() => { setTranscriptSubTab('summary'); setSelectedFile(summaryFile) }}
                            className={`px-3 py-1.5 text-xs rounded-md transition-all ${transcriptSubTab === 'summary' ? 'bg-brand/20 text-brand-light font-medium' : 'text-zinc-500 hover:text-zinc-300'}`}
                          >
                            Summary
                          </button>
                          <button
                            onClick={() => { setTranscriptSubTab('transcript'); setSelectedFile(transcriptFile) }}
                            className={`px-3 py-1.5 text-xs rounded-md transition-all ${transcriptSubTab === 'transcript' ? 'bg-brand/20 text-brand-light font-medium' : 'text-zinc-500 hover:text-zinc-300'}`}
                          >
                            Raw transcript
                          </button>
                        </div>
                      ) : null
                    })()}
                    <div className="prose-dark">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanSummaryContent(fileContent)}</ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  [...report.transcripts].reverse().map((t) => (
                    <button
                      key={t.date}
                      onClick={() => {
                        setTranscriptSubTab('summary')
                        setSelectedFile(t.hasSummary ? `meetings/${t.date}-${name}-1-1-summary.md` : `meetings/${t.date}-${name}-1-1.md`)
                      }}
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
              [...report.feedback].sort((a, b) => b.date.localeCompare(a.date)).map((f, i) => (
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
                  <button
                    key={i}
                    onClick={async () => {
                      if (!a.sourceFile || !a.sourceLine) return
                      try {
                        await window.api.toggleActionItem(a.sourceFile, a.sourceLine)
                        refresh()
                      } catch (e) {
                        console.error('Failed to check off item:', e)
                      }
                    }}
                    className="w-full flex items-start gap-3 p-2.5 rounded-lg hover:bg-surface transition-colors text-left group"
                  >
                    <div className="w-4 h-4 mt-0.5 border border-zinc-600 rounded shrink-0 group-hover:border-brand group-hover:bg-brand/20 transition-colors" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-zinc-300">{a.text}</span>
                      {a.owner && a.owner !== 'Unknown' && (
                        <span className="ml-2 text-xs text-zinc-500">({a.owner})</span>
                      )}
                    </div>
                  </button>
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
