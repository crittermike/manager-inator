import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execSync } from 'child_process'

let _testRepoPath = ''

vi.mock('../../src/main/store', () => ({
  getSettings: () => ({
    repoPath: _testRepoPath,
    repoOwner: '',
    repoName: '',
    githubToken: 'fake',
    defaultModel: 'gpt-4.1',
    aiCustomInstructions: '',
    userName: 'Mike Crittenden',
    userGithub: ''
  }),
  setToken: vi.fn(),
  getToken: () => 'fake-token',
  saveSettings: vi.fn(),
  getSettingsForRenderer: vi.fn()
}))

import { clearAllCaches, commitFile, flushPendingCommitsAsync, isGitRepo } from '../../src/main/github'

function setRepoPath(repoPath: string): void {
  _testRepoPath = repoPath
}

describe('git repo detection and push remote checks', () => {
  const tempDirs: string[] = []

  function makeTempDir(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix))
    tempDirs.push(dir)
    return dir
  }

  afterEach(() => {
    clearAllCaches()
    vi.useRealTimers()
  })

  afterAll(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  describe('isGitRepo', () => {
    it('returns true for a directory containing .git', () => {
      const repoDir = makeTempDir('git-repo-true-')
      mkdirSync(join(repoDir, '.git'))

      expect(isGitRepo(repoDir)).toBe(true)
    })

    it('returns false for a directory without .git', () => {
      const nonRepoDir = makeTempDir('git-repo-false-')

      expect(isGitRepo(nonRepoDir)).toBe(false)
    })

    it('returns false when path does not exist', () => {
      const missingPath = join(makeTempDir('git-repo-missing-parent-'), 'does-not-exist')

      expect(isGitRepo(missingPath)).toBe(false)
    })

    it('returns false when fs lookup throws', () => {
      expect(isGitRepo('\u0000invalid-path')).toBe(false)
    })
  })

  describe('commit/push behavior with no configured remotes', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('commits successfully and does not crash when push runs in a repo with no remotes', async () => {
      const repoDir = makeTempDir('git-no-remote-')
      execSync('git init', { cwd: repoDir, stdio: 'ignore' })
      execSync('git config user.name "Test User"', { cwd: repoDir, stdio: 'ignore' })
      execSync('git config user.email "test@example.com"', { cwd: repoDir, stdio: 'ignore' })

      setRepoPath(repoDir)

      await commitFile('reports/alice/profile.md', '# profile\n', 'test commit in local repo')
      await flushPendingCommitsAsync()

      await vi.advanceTimersByTimeAsync(5000)

      const remotes = execSync('git remote', { cwd: repoDir }).toString().trim()
      const commitCount = execSync('git rev-list --count HEAD', { cwd: repoDir }).toString().trim()

      expect(remotes).toBe('')
      expect(commitCount).toBe('1')
    })
  })
})
