import { useState } from 'react'
import { Zap, ArrowRight, FolderGit2, FolderOpen, FolderPlus, ArrowLeft, User, ExternalLink, Eye, EyeOff, KeyRound, SkipForward } from 'lucide-react'
import { GitHubMark } from '../components/common/GitHubMark'

interface SetupScreenProps {
  onComplete: () => void
}

type Mode = 'choose' | 'connect' | 'create' | 'identity' | 'github-org'

export function SetupScreen({ onComplete }: SetupScreenProps) {
  const [mode, setMode] = useState<Mode>('choose')
  const [repoPath, setRepoPath] = useState('')
  const [userName, setUserName] = useState('')
  const [userGithub, setUserGithub] = useState('')
  const [githubOrgName, setGithubOrgName] = useState('')
  const [githubOrgToken, setGithubOrgToken] = useState('')
  const [showToken, setShowToken] = useState(false)
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
      const isRepo = await window.api.isGitRepo(repoPath.trim())
      if (!isRepo) {
        setError('That folder is not a git repository. If this is a new repo, use "Start fresh" instead.')
        setSaving(false)
        return
      }

      await window.api.saveSettings({ repoPath: repoPath.trim() })

      const reports = await window.api.getReports()
      if (reports.length === 0) {
        setError('No reports/ directory found. If this is a new repo, use "Start fresh" instead.')
        setSaving(false)
        return
      }

      setSaving(false)
      setMode('identity')
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
      setSaving(false)
      setMode('identity')
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  const handleIdentityComplete = async (e: { preventDefault(): void }) => {
    e.preventDefault()
    if (!userName.trim()) {
      setError('Your name is required')
      return
    }

    setSaving(true)
    setError('')

    try {
      await window.api.saveSettings({
        userName: userName.trim(),
        userGithub: userGithub.trim()
      })
      setSaving(false)
      setMode('github-org')
      setError('')
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  const handleGithubOrgComplete = async () => {
    setSaving(true)
    setError('')

    // Validate PAT if provided — go through main process to avoid CSP
    if (githubOrgToken.trim()) {
      try {
        const valid = await window.api.validateGithubToken(githubOrgToken.trim())
        if (!valid) {
          setError('Token validation failed — please check your PAT and try again.')
          setSaving(false)
          return
        }
      } catch {
        setError('Could not validate token. Check your connection and try again.')
        setSaving(false)
        return
      }
    }

    try {
      const settings: Record<string, string> = {}
      if (githubOrgName.trim()) settings.githubOrgName = githubOrgName.trim()
      if (githubOrgToken.trim()) settings.githubOrgToken = githubOrgToken.trim()
      if (Object.keys(settings).length > 0) {
        await window.api.saveSettings(settings)
      }
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

  if (mode === 'identity') {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-950">
        <div className="drag-region absolute top-0 left-0 right-0 h-12" />

        <div className="w-full max-w-md px-8 animate-fade-in">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-brand/20 flex items-center justify-center mb-4">
              <User className="w-8 h-8 text-brand" />
            </div>
            <h1 className="text-2xl font-bold text-zinc-100">About you</h1>
            <p className="text-sm text-zinc-500 mt-1 text-center">
              So the app knows who you are when processing transcripts and tracking your impact.
            </p>
          </div>

          <form onSubmit={handleIdentityComplete} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Your name
              </label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="e.g. Jane Smith"
                className="w-full px-4 py-2.5 bg-surface-raised border border-border rounded-xl text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors no-drag"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                GitHub username
                <span className="text-zinc-600 font-normal ml-1">(optional)</span>
              </label>
              <input
                type="text"
                value={userGithub}
                onChange={(e) => setUserGithub(e.target.value)}
                placeholder="e.g. janesmith"
                className="w-full px-4 py-2.5 bg-surface-raised border border-border rounded-xl text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors no-drag"
              />
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <button
              type="submit"
              disabled={saving || !userName.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-brand text-white rounded-lg font-medium text-sm transition-all active:scale-[0.97] disabled:opacity-50 no-drag hover:bg-brand-dark"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  Next
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <p className="text-xs text-zinc-600 text-center mt-6">
            You can change these later in Settings.
          </p>
        </div>
      </div>
    )
  }

  if (mode === 'github-org') {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-950">
        <div className="drag-region absolute top-0 left-0 right-0 h-12" />

        <div className="w-full max-w-md px-8 animate-fade-in">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-brand/20 flex items-center justify-center mb-4">
              <KeyRound className="w-8 h-8 text-brand" />
            </div>
            <h1 className="text-2xl font-bold text-zinc-100">GitHub Organization</h1>
            <p className="text-sm text-zinc-500 mt-1 text-center max-w-sm">
              Connect your GitHub org to see your team's PR and issue activity in the Today view.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Organization name
              </label>
              <input
                type="text"
                value={githubOrgName}
                onChange={(e) => setGithubOrgName(e.target.value)}
                placeholder="e.g. my-company"
                className="w-full px-4 py-2.5 bg-surface-raised border border-border rounded-xl text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors no-drag"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Personal Access Token (PAT)
              </label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={githubOrgToken}
                  onChange={(e) => setGithubOrgToken(e.target.value)}
                  placeholder="ghp_..."
                  className="w-full pl-4 pr-10 py-2.5 bg-surface-raised border border-border rounded-xl text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors no-drag font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 no-drag"
                  aria-label={showToken ? 'Hide token' : 'Show token'}
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="mt-2.5 space-y-1.5 text-xs text-zinc-500">
                <p>This token lets the app read your team's activity (PRs, issues, discussions). It is stored locally and never sent anywhere except the GitHub API.</p>
                <p className="text-zinc-600">
                  <strong className="text-zinc-500">Create a fine-grained PAT under your organization</strong> (not your personal account) with <strong className="text-zinc-500">read-only</strong> access to:
                </p>
                <ul className="list-disc list-inside text-zinc-600 space-y-0.5 pl-1">
                  <li>Contents</li>
                  <li>Discussions</li>
                  <li>Issues</li>
                  <li>Pull requests</li>
                </ul>
              </div>
              <a
                href={githubOrgName.trim()
                  ? `https://github.com/organizations/${githubOrgName.trim()}/settings/personal-access-tokens/new`
                  : 'https://github.com/settings/tokens?type=beta'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-2 text-xs text-brand-light hover:text-brand transition-colors no-drag"
              >
                <ExternalLink className="w-3 h-3" />
                Create a fine-grained token {githubOrgName.trim() ? `for ${githubOrgName.trim()}` : 'on GitHub'}
              </a>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={handleGithubOrgComplete}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-brand text-white rounded-lg font-medium text-sm transition-all active:scale-[0.97] disabled:opacity-50 no-drag hover:bg-brand-dark"
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    {githubOrgName.trim() || githubOrgToken.trim() ? 'Save & get started' : 'Get started'}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
              {!githubOrgName.trim() && !githubOrgToken.trim() && (
                <button
                  onClick={onComplete}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-zinc-500 hover:text-zinc-300 text-sm transition-colors no-drag"
                >
                  <SkipForward className="w-4 h-4" />
                  Skip for now — I'll set this up later
                </button>
              )}
            </div>
          </div>

          <p className="text-xs text-zinc-600 text-center mt-6">
            You can always configure this later in Settings.
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
            ? 'This will create reports/, contexts/, people/, and transcripts/ folders and initialize a git repo.'
            : 'Your repo should have a reports/ directory with one folder per direct report.'
          }
        </p>
      </div>
    </div>
  )
}
