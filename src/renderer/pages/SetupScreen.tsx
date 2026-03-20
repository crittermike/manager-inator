import { useState } from 'react'
import { Zap, ArrowRight, FolderGit2 } from 'lucide-react'

interface SetupScreenProps {
  onComplete: () => void
}

export function SetupScreen({ onComplete }: SetupScreenProps) {
  const [owner, setOwner] = useState('')
  const [repo, setRepo] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!owner.trim() || !repo.trim()) {
      setError('Both fields are required')
      return
    }

    setSaving(true)
    setError('')

    try {
      await window.api.saveSettings({
        repoOwner: owner.trim(),
        repoName: repo.trim()
      })

      // Validate the repo exists and has the right structure
      const reports = await window.api.getReports()
      if (reports.length === 0) {
        setError(
          'This repo doesn\'t look like a Manager-inator repo (no reports/ directory found)'
        )
        setSaving(false)
        return
      }

      onComplete()
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-zinc-950">
      <div className="drag-region absolute top-0 left-0 right-0 h-12" />

      <div className="w-full max-w-md px-8 animate-fade-in">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-brand/20 flex items-center justify-center mb-4">
            <FolderGit2 className="w-8 h-8 text-brand" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-100">Connect your repo</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Point Manager-inator at your performance management repo
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Repository owner
            </label>
            <input
              type="text"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="e.g. crittermike"
              className="w-full px-4 py-2.5 bg-surface-raised border border-border rounded-xl text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors no-drag"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Repository name
            </label>
            <input
              type="text"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="e.g. manager-inator"
              className="w-full px-4 py-2.5 bg-surface-raised border border-border rounded-xl text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors no-drag"
            />
          </div>

          {error && (
            <p className="text-sm text-danger">{error}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-brand text-white rounded-xl font-medium text-sm hover:bg-brand-dark transition-colors disabled:opacity-50 no-drag"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Connect repo
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <p className="text-xs text-zinc-600 text-center mt-6">
          Your repo should have a <code className="text-zinc-500">reports/</code> directory
          with one folder per direct report.
        </p>
      </div>
    </div>
  )
}
