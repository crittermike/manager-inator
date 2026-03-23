import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getToken,
  setToken,
  clearToken,
  getGithubOrgToken,
  setGithubOrgToken,
  getGithubOrgName,
  getRepoConfig,
  setRepoConfig,
  getSettings,
  getSettingsForRenderer,
  saveSettings
} from '../../src/main/store'

describe('store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GitHub auth token', () => {
    it('setToken stores and getToken retrieves', () => {
      setToken('ghp_abc123')
      expect(getToken()).toBe('ghp_abc123')
    })

    it('getToken returns null when no token set', () => {
      clearToken()
      expect(getToken()).toBeNull()
    })

    it('clearToken removes the token', () => {
      setToken('ghp_xyz')
      clearToken()
      expect(getToken()).toBeNull()
    })

    it('overwrites previous token', () => {
      setToken('ghp_first')
      setToken('ghp_second')
      expect(getToken()).toBe('ghp_second')
    })
  })

  describe('GitHub org token', () => {
    it('stores and retrieves a token', () => {
      setGithubOrgToken('ghp_org_test_token')
      expect(getGithubOrgToken()).toBe('ghp_org_test_token')
    })

    it('clears token when null is passed', () => {
      setGithubOrgToken('ghp_org_test_token')
      setGithubOrgToken(null)
      expect(getGithubOrgToken()).toBeNull()
    })

    it('returns null when no token is set', () => {
      setGithubOrgToken(null)
      expect(getGithubOrgToken()).toBeNull()
    })

    it('getGithubOrgName returns string', () => {
      expect(typeof getGithubOrgName()).toBe('string')
    })
  })

  describe('repo config', () => {
    it('stores and retrieves owner and name', () => {
      setRepoConfig('crittermike', 'manager-inator')
      const config = getRepoConfig()
      expect(config.owner).toBe('crittermike')
      expect(config.name).toBe('manager-inator')
    })

    it('returns empty strings by default', () => {
      setRepoConfig('', '')
      const config = getRepoConfig()
      expect(config.owner).toBe('')
      expect(config.name).toBe('')
    })

    it('overwrites previous config', () => {
      setRepoConfig('old-owner', 'old-repo')
      setRepoConfig('new-owner', 'new-repo')
      const config = getRepoConfig()
      expect(config.owner).toBe('new-owner')
      expect(config.name).toBe('new-repo')
    })
  })

  describe('getSettings', () => {
    it('returns object with expected keys', () => {
      const settings = getSettings()
      expect(settings).toHaveProperty('githubToken')
      expect(settings).toHaveProperty('repoOwner')
      expect(settings).toHaveProperty('repoName')
      expect(settings).toHaveProperty('repoPath')
      expect(settings).toHaveProperty('defaultModel')
      expect(settings).toHaveProperty('aiCustomInstructions')
    })

    it('reflects stored repo config', () => {
      setRepoConfig('test-owner', 'test-repo')
      const settings = getSettings()
      expect(settings.repoOwner).toBe('test-owner')
      expect(settings.repoName).toBe('test-repo')
    })
  })

  describe('saveSettings', () => {
    it('updates individual settings', () => {
      saveSettings({ repoPath: '/tmp/my-repo' })
      const settings = getSettings()
      expect(settings.repoPath).toBe('/tmp/my-repo')
    })

    it('updates multiple settings at once', () => {
      saveSettings({
        defaultModel: 'claude-opus-4-6',
        aiCustomInstructions: 'Be brief.',
        feedbackReminderDays: 7
      })
      const settings = getSettings()
      expect(settings.defaultModel).toBe('claude-opus-4-6')
      expect(settings.aiCustomInstructions).toBe('Be brief.')
    })

    it('preserves unrelated settings when updating one', () => {
      saveSettings({ repoPath: '/original/path', defaultModel: 'gpt-4.1' })
      saveSettings({ defaultModel: 'claude-opus-4-6' })
      const settings = getSettings()
      expect(settings.repoPath).toBe('/original/path')
      expect(settings.defaultModel).toBe('claude-opus-4-6')
    })
  })

  describe('getSettingsForRenderer', () => {
    it('includes hasToken boolean instead of raw token', () => {
      clearToken()
      const settings = getSettingsForRenderer()
      expect(typeof settings.hasToken).toBe('boolean')
      expect(settings.hasToken).toBe(false)
      expect('githubToken' in settings).toBe(false)
    })

    it('hasToken is true when token is set', () => {
      setToken('ghp_test')
      const settings = getSettingsForRenderer()
      expect(settings.hasToken).toBe(true)
    })

    it('includes hasGithubOrgToken boolean', () => {
      setGithubOrgToken(null)
      const settings = getSettingsForRenderer()
      expect(settings.hasGithubOrgToken).toBe(false)
    })

    it('hasGithubOrgToken is true when set', () => {
      setGithubOrgToken('ghp_org')
      const settings = getSettingsForRenderer()
      expect(settings.hasGithubOrgToken).toBe(true)
    })

    it('includes all cadence settings', () => {
      const settings = getSettingsForRenderer()
      expect(settings).toHaveProperty('checkInFrequency')
      expect(settings).toHaveProperty('feedbackReminderDays')
      expect(settings).toHaveProperty('sprintLengthWeeks')
      expect(settings).toHaveProperty('endOfWeekDay')
      expect(settings).toHaveProperty('sprintStartDate')
      expect(settings).toHaveProperty('staleActionDays')
    })

    it('includes practice-related settings', () => {
      const settings = getSettingsForRenderer()
      expect(settings).toHaveProperty('disabledPractices')
      expect(settings).toHaveProperty('snoozedPractices')
      expect(settings).toHaveProperty('customPractices')
      expect(settings).toHaveProperty('practiceCompletions')
      expect(settings).toHaveProperty('practiceSchedules')
    })

    it('includes PTO data', () => {
      const settings = getSettingsForRenderer()
      expect(settings).toHaveProperty('ptoReports')
    })

    it('reflects saved settings', () => {
      saveSettings({ feedbackReminderDays: 21, staleActionDays: 10 })
      const settings = getSettingsForRenderer()
      expect(settings.feedbackReminderDays).toBe(21)
      expect(settings.staleActionDays).toBe(10)
    })

    it('includes githubOrgName', () => {
      saveSettings({ githubOrgName: 'my-company' })
      const settings = getSettingsForRenderer()
      expect(settings.githubOrgName).toBe('my-company')
    })
  })
})
