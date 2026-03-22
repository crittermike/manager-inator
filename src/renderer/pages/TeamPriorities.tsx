import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TeamPriority } from '../../shared/types'
import {
  ArrowLeft,
  AlertTriangle,
  RefreshCw,
  Save,
  Target,
  Edit3,
  X
} from 'lucide-react'
import { useToast } from '../components/common/Toast'

export function TeamPriorities() {
  const navigate = useNavigate()
  const toast = useToast()
  const [priorities, setPriorities] = useState<TeamPriority[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingReport, setEditingReport] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.getTeamPriorities()
      setPriorities(result)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const startEdit = (p: TeamPriority) => {
    setEditingReport(p.reportName)
    setEditContent(p.priorities || `# ${p.displayName}'s priorities\n\n- \n`)
  }

  const cancelEdit = () => {
    setEditingReport(null)
    setEditContent('')
  }

  const saveEdit = async () => {
    if (!editingReport) return
    setSaving(true)
    try {
      await window.api.saveReportPriorities(editingReport, editContent)
      toast.success('Priorities saved')
      setEditingReport(null)
      setEditContent('')
      await load()
    } catch (e) {
      console.error('Failed to save priorities:', e)
      toast.error('Failed to save priorities')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-warning mx-auto" aria-hidden="true" />
          <p className="text-sm text-zinc-400">{error}</p>
          <button onClick={load} className="text-sm text-brand-light hover:text-brand transition-colors">
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Back to dashboard
      </button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Team priorities</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Set weekly focus areas for each direct report
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 bg-surface-raised hover:bg-surface-overlay rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          Refresh
        </button>
      </div>

      <div className="space-y-4">
        {priorities.map((p) => {
          const isEditing = editingReport === p.reportName
          const hasPriorities = p.priorities.trim().length > 0

          return (
            <div key={p.reportName} className="bg-surface rounded-xl border border-border overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-brand/20 flex items-center justify-center text-sm font-semibold text-brand-light">
                    {p.displayName.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <button
                      onClick={() => navigate(`/report/${p.reportName}`)}
                      className="text-sm font-medium text-zinc-200 hover:text-brand-light transition-colors"
                    >
                      {p.displayName}
                    </button>
                    {!hasPriorities && !isEditing && (
                      <p className="text-xs text-zinc-600">No priorities set yet</p>
                    )}
                  </div>
                </div>
                {!isEditing && (
                  <button
                    onClick={() => startEdit(p)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-surface-raised rounded-lg transition-colors"
                  >
                    <Edit3 className="w-3 h-3" aria-hidden="true" />
                    {hasPriorities ? 'Edit' : 'Set priorities'}
                  </button>
                )}
              </div>

              {isEditing ? (
                <div className="border-t border-border px-5 py-4 space-y-3">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={8}
                    className="w-full bg-surface-raised border border-border rounded-lg px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-brand/50 resize-y font-mono"
                    placeholder={`# ${p.displayName}'s priorities\n\n- Focus area 1\n- Focus area 2`}
                    autoFocus
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-zinc-600">Markdown supported. Saved to your data repo.</p>
                    <div className="flex gap-2">
                      <button
                        onClick={cancelEdit}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-surface-raised rounded-lg transition-colors"
                      >
                        <X className="w-3 h-3" aria-hidden="true" />
                        Cancel
                      </button>
                      <button
                        onClick={saveEdit}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand/10 text-brand-light hover:bg-brand/20 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <Save className="w-3 h-3" aria-hidden="true" />
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : hasPriorities ? (
                <div className="border-t border-border px-5 py-4">
                  <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                    {p.priorities.replace(/^#.*\n*/m, '').trim().split('\n').map((line, i) => {
                      if (line.startsWith('- ')) {
                        return (
                          <div key={i} className="flex items-start gap-2 py-0.5">
                            <Target className="w-3.5 h-3.5 text-brand-light mt-0.5 shrink-0" aria-hidden="true" />
                            <span>{line.slice(2)}</span>
                          </div>
                        )
                      }
                      if (line.trim() === '') return <div key={i} className="h-2" />
                      return <p key={i} className="text-zinc-400">{line}</p>
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
