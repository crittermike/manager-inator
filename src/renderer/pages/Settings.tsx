import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import {
  Settings as SettingsIcon,
  LogOut,
  FolderGit2,
  Save,
  Check,
  User,
  Cpu,
  ChevronDown
} from 'lucide-react'

const AVAILABLE_MODELS = [
  { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'OpenAI' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI' },
  { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'Anthropic' },
  { id: 'claude-haiku-3.5', name: 'Claude Haiku 3.5', provider: 'Anthropic' },
  { id: 'o3-mini', name: 'o3-mini', provider: 'OpenAI' },
  { id: 'o4-mini', name: 'o4-mini', provider: 'OpenAI' },
]

export function Settings() {
  const { user, logout } = useAuth()
  const [owner, setOwner] = useState('')
  const [repo, setRepo] = useState('')
  const [model, setModel] = useState('gpt-4.1')
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api.getSettings().then((s) => {
      setOwner(s.repoOwner)
      setRepo(s.repoName)
      setModel(s.defaultModel || 'gpt-4.1')
      setLoading(false)
    })
  }, [])

  const handleSave = async () => {
    await window.api.saveSettings({ repoOwner: owner, repoName: repo, defaultModel: model })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return null

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
          <SettingsIcon className="w-6 h-6 text-zinc-400" />
          Settings
        </h1>
      </div>

      {/* Account */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
          Account
        </h2>
        <div className="bg-surface rounded-xl border border-border p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-surface-raised flex items-center justify-center">
                <User className="w-5 h-5 text-zinc-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-200">@{user}</p>
                <p className="text-xs text-zinc-500">Connected via GitHub</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger/10 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>
      </section>

      {/* Repository */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
          Repository
        </h2>
        <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <FolderGit2 className="w-4 h-4 text-zinc-400" />
            <span className="text-sm font-medium text-zinc-300">
              Data source
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Owner</label>
              <input
                type="text"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="w-full px-3 py-2 bg-surface-raised border border-border rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-brand transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">
                Repository
              </label>
              <input
                type="text"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                className="w-full px-3 py-2 bg-surface-raised border border-border rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-brand transition-colors"
              />
            </div>
          </div>

          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm hover:bg-brand-dark transition-colors"
          >
            {saved ? (
              <>
                <Check className="w-4 h-4" />
                Saved
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save changes
              </>
            )}
          </button>
        </div>
      </section>

      {/* AI Model */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
          AI Model
        </h2>
        <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Cpu className="w-4 h-4 text-zinc-400" />
            <span className="text-sm font-medium text-zinc-300">
              Default model for AI features
            </span>
          </div>
          <div className="relative">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full appearance-none px-4 py-2.5 bg-surface-raised border border-border rounded-xl text-sm text-zinc-100 focus:outline-none focus:border-brand transition-colors"
            >
              {AVAILABLE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.provider})
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
          </div>
          <p className="text-xs text-zinc-600">
            Uses your GitHub Copilot subscription. Model availability depends on your plan.
          </p>
        </div>
      </section>

      {/* About */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
          About
        </h2>
        <div className="bg-surface rounded-xl border border-border p-5">
          <p className="text-sm text-zinc-400">
            <strong className="text-zinc-200">Manager-inator</strong> v1.0.0
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            AI-powered performance management for engineering managers.
            Uses the GitHub Copilot SDK for AI features and your GitHub repo
            as the source of truth.
          </p>
        </div>
      </section>
    </div>
  )
}
