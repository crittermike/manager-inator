import { useState } from 'react'
import { Zap, ArrowRight, FolderGit2, FolderOpen, FolderPlus, ArrowLeft } from 'lucide-react'

interface SetupScreenProps {
  onComplete: () => void
}

type Mode = 'choose' | 'connect' | 'create'

export function SetupScreen({ onComplete }: SetupScreenProps) {
  const [mode, setMode] = useState<Mode>('choose')
  const [repoPath, setRepoPath] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleConnect = async (e: { preventDefault(): void }) => {
    e.preventDefault()
    if (!repoPath.trim()) {
      setError('Path is required')
      return
    }

    setSaving(true)
    setError('')

    try {
      await window.api.saveSettings({ repoPath: repoPath.trim() })

      const reports = await window.api.getReports()
      if (reports.length === 0) {
        setError('No reports/ directory found. If this is a new repo, use "Start fresh" instead.')
        setSaving(false)
        return
      }

      onComplete()
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  const handleCreate = async (e: { preventDefault(): void }) => {
    e.preventDefault()
    if (!repoPath.trim()) {
      setError('Path is required')
      return
    }

    setSaving(true)
    setError('')

    try {
      await window.api.initializeRepo(repoPath.trim())
      await window.api.saveSettings({ repoPath: repoPath.trim() })
      onComplete()
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  if (mode === 'choose') {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-950">
        <div className="drag-region absolute top-0 left-0 right-0 h-12" />

        <div className="w-full max-w-lg px-8 animate-fade-in">
          <div className="flex flex-col items-center mb-10">
            <div className="w-16 h-16 rounded-2xl bg-brand/20 flex items-center justify-center mb-4">
              <Zap className="w-8 h-8 text-brand" />
            </div>
            <h1 className="text-2xl font-bold text-zinc-100">Welcome to Manager-inator</h1>
            <p className="text-sm text-zinc-500 mt-2 text-center max-w-sm">
              AI-powered performance management for engineering managers. Let's get you set up.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <button
              onClick={() => setMode('connect')}
              className="flex items-center gap-4 p-5 bg-surface rounded-xl border border-border hover:border-brand/30 hover:bg-surface-raised/70 transition-all text-left group no-drag"
            >
              <div className="w-12 h-12 rounded-xl bg-brand/10 flex items-center justify-center shrink-0 group-hover:bg-brand/20 transition-colors">
                <FolderGit2 className="w-6 h-6 text-brand-light" />
              </div>
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-zinc-200">Connect existing repo</h2>
                <p className="text-xs text-zinc-500 mt-0.5">I already have a Manager-inator data repo cloned locally</p>
              </div>
              <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-brand-light transition-colors shrink-0" />
            </button>

            <button
              onClick={() => setMode('create')}
              className="flex items-center gap-4 p-5 bg-surface rounded-xl border border-border hover:border-brand/30 hover:bg-surface-raised/70 transition-all text-left group no-drag"
            >
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0 group-hover:bg-emerald-500/20 transition-colors">
                <FolderPlus className="w-6 h-6 text-emerald-400" />
              </div>
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-zinc-200">Start fresh</h2>
                <p className="text-xs text-zinc-500 mt-0.5">Create a new data repo from scratch — I'll set up the folder structure for you</p>
              </div>
              <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-emerald-400 transition-colors shrink-0" />
            </button>
          </div>

          <p className="text-xs text-zinc-600 text-center mt-8">
            Your data lives in a local Git repo — markdown files you own and control.
          </p>
        </div>
      </div>
    )
  }

  const isCreate = mode === 'create'

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-zinc-950">
      <div className="drag-region absolute top-0 left-0 right-0 h-12" />

      <div className="w-full max-w-md px-8 animate-fade-in">
        <button
          onClick={() => { setMode('choose'); setError(''); setRepoPath('') }}
          className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 no-drag"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="flex flex-col items-center mb-8">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${
            isCreate ? 'bg-emerald-500/20' : 'bg-brand/20'
          }`}>
            {isCreate
              ? <FolderPlus className="w-8 h-8 text-emerald-400" />
              : <FolderGit2 className="w-8 h-8 text-brand" />
            }
          </div>
          <h1 className="text-2xl font-bold text-zinc-100">
            {isCreate ? 'Create your data repo' : 'Connect your repo'}
          </h1>
          <p className="text-sm text-zinc-500 mt-1 text-center">
            {isCreate
              ? 'Pick an empty folder and we\'ll set up the directory structure'
              : 'Point Manager-inator at your local repo clone'
            }
          </p>
        </div>

        <form onSubmit={isCreate ? handleCreate : handleConnect} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              {isCreate ? 'Folder path' : 'Local repo path'}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={repoPath}
                onChange={(e) => setRepoPath(e.target.value)}
                placeholder={isCreate ? '/Users/you/Code/my-manager-data' : '/Users/you/Code/manager-inator'}
                className="flex-1 px-4 py-2.5 bg-surface-raised border border-border rounded-xl text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors no-drag font-mono"
              />
              <button
                type="button"
                onClick={async () => {
                  const result = await window.api.showOpenDialog({ properties: ['openDirectory'], title: isCreate ? 'Select folder for your data' : 'Select repo folder' })
                  if (result) setRepoPath(result)
                }}
                className="flex items-center gap-1.5 px-3 py-2.5 bg-surface-raised border border-border rounded-xl text-sm text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors no-drag shrink-0"
                aria-label="Browse for folder"
              >
                <FolderOpen className="w-4 h-4" aria-hidden="true" />
                Browse
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 text-white rounded-lg font-medium text-sm transition-all active:scale-[0.97] disabled:opacity-50 no-drag ${
              isCreate
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-brand hover:bg-brand-dark'
            }`}
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                {isCreate ? <FolderPlus className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                {isCreate ? 'Create & connect' : 'Connect repo'}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <p className="text-xs text-zinc-600 text-center mt-6">
          {isCreate
            ? 'This will create reports/, meetings/, people/, and transcripts/ folders and initialize a git repo.'
            : 'Your repo should have a reports/ directory with one folder per direct report.'
          }
        </p>
      </div>
    </div>
  )
}
