import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getGithubOrgToken,
  setGithubOrgToken,
  getGithubOrgName,
  getSettingsForRenderer
} from '../../src/main/store'

describe('GitHub Org Token', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('setGithubOrgToken', () => {
    it('stores a token', () => {
      setGithubOrgToken('ghp_org_test_token')
      const retrieved = getGithubOrgToken()
      expect(retrieved).toBe('ghp_org_test_token')
    })

    it('clears token when null is passed', () => {
      setGithubOrgToken('ghp_org_test_token')
      setGithubOrgToken(null)
      const retrieved = getGithubOrgToken()
      expect(retrieved).toBeNull()
    })
  })

  describe('getGithubOrgToken', () => {
    it('returns null when no token is set', () => {
      setGithubOrgToken(null)
      const result = getGithubOrgToken()
      expect(result).toBeNull()
    })

    it('returns the stored token value', () => {
      setGithubOrgToken('ghp_my_org_token')
      const result = getGithubOrgToken()
      expect(result).toBe('ghp_my_org_token')
    })
  })

  describe('getGithubOrgName', () => {
    it('returns empty string by default', () => {
      const name = getGithubOrgName()
      expect(typeof name).toBe('string')
    })
  })

  describe('getSettingsForRenderer', () => {
    it('includes hasGithubOrgToken as boolean', () => {
      setGithubOrgToken(null)
      const settings = getSettingsForRenderer()
      expect(typeof settings.hasGithubOrgToken).toBe('boolean')
      expect(settings.hasGithubOrgToken).toBe(false)
    })

    it('hasGithubOrgToken is true when token is set', () => {
      setGithubOrgToken('ghp_test')
      const settings = getSettingsForRenderer()
      expect(settings.hasGithubOrgToken).toBe(true)
    })

    it('includes githubOrgName', () => {
      const settings = getSettingsForRenderer()
      expect('githubOrgName' in settings).toBe(true)
    })
  })
})
