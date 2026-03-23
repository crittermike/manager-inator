/**
 * Store encryption branch tests.
 *
 * The global setup.ts mocks safeStorage.isEncryptionAvailable = () => false.
 * These tests override that mock per-test to exercise encryption paths.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// We need to get the mocked safeStorage from the electron module
import { safeStorage } from 'electron'

// Import store functions — they use the mocked electron module from setup.ts
import { getToken, setToken, clearToken, getGithubOrgToken, setGithubOrgToken } from '../../src/main/store'

// Get access to the underlying mock store (from setup.ts electron-store mock)
// We need to clear it between tests for isolation
import Store from 'electron-store'

describe('store encryption', () => {
  let store: InstanceType<typeof Store>

  beforeEach(() => {
    // Create a fresh store instance to clear state
    store = new Store({ defaults: {} } as any)
    store.clear()
    clearToken()
  })

  describe('setToken/getToken with encryption available', () => {
    beforeEach(() => {
      // Override the global mock to enable encryption
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
      // Provide real-ish encrypt/decrypt that use base64 roundtrip
      vi.mocked(safeStorage.encryptString).mockImplementation((s: string) => {
        return Buffer.from(`encrypted:${s}`)
      })
      vi.mocked(safeStorage.decryptString).mockImplementation((b: Buffer) => {
        const str = b.toString()
        if (str.startsWith('encrypted:')) return str.slice('encrypted:'.length)
        throw new Error('Cannot decrypt')
      })
    })

    it('should encrypt token on setToken and decrypt on getToken', () => {
      setToken('ghp_test_token_123')
      const retrieved = getToken()
      expect(retrieved).toBe('ghp_test_token_123')
    })

    it('should store token as base64-encoded encrypted value', () => {
      setToken('my-secret-token')
      // The raw store value should be base64 of "encrypted:my-secret-token"
      const raw = store.get('githubToken') as string
      expect(raw).not.toBe('my-secret-token') // Not plaintext
      // Decode base64 to verify it went through encryptString
      const decoded = Buffer.from(raw, 'base64').toString()
      expect(decoded).toBe('encrypted:my-secret-token')
    })

    it('should return null when no token is set', () => {
      expect(getToken()).toBeNull()
    })
  })

  describe('legacy plaintext migration', () => {
    beforeEach(() => {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
      vi.mocked(safeStorage.encryptString).mockImplementation((s: string) => {
        return Buffer.from(`encrypted:${s}`)
      })
      vi.mocked(safeStorage.decryptString).mockImplementation((b: Buffer) => {
        const str = b.toString()
        if (str.startsWith('encrypted:')) return str.slice('encrypted:'.length)
        throw new Error('Cannot decrypt')
      })
    })

    it('should migrate plaintext token to encrypted on read', () => {
      // Simulate a legacy plaintext token stored directly
      store.set('githubToken', 'ghp_legacy_plaintext_token')

      const token = getToken()
      // Should return the plaintext value
      expect(token).toBe('ghp_legacy_plaintext_token')

      // And should have re-encrypted it in the store
      const raw = store.get('githubToken') as string
      const decoded = Buffer.from(raw, 'base64').toString()
      expect(decoded).toBe('encrypted:ghp_legacy_plaintext_token')
    })

    it('should handle migration failure gracefully', () => {
      // Simulate encrypt failing on migration
      vi.mocked(safeStorage.encryptString).mockImplementationOnce(() => {
        throw new Error('OS keychain locked')
      })

      store.set('githubToken', 'ghp_migration_fail_token')
      const token = getToken()
      // Should still return the plaintext token even if migration fails
      expect(token).toBe('ghp_migration_fail_token')
    })
  })

  describe('org token encryption', () => {
    beforeEach(() => {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
      vi.mocked(safeStorage.encryptString).mockImplementation((s: string) => {
        return Buffer.from(`encrypted:${s}`)
      })
      vi.mocked(safeStorage.decryptString).mockImplementation((b: Buffer) => {
        const str = b.toString()
        if (str.startsWith('encrypted:')) return str.slice('encrypted:'.length)
        throw new Error('Cannot decrypt')
      })
    })

    it('should encrypt org token on set and decrypt on get', () => {
      setGithubOrgToken('ghp_org_token_abc')
      const retrieved = getGithubOrgToken()
      expect(retrieved).toBe('ghp_org_token_abc')
    })

    it('should handle null org token', () => {
      setGithubOrgToken(null)
      expect(getGithubOrgToken()).toBeNull()
    })

    it('should migrate legacy plaintext org token', () => {
      store.set('githubOrgToken', 'ghp_legacy_org_token')
      const token = getGithubOrgToken()
      expect(token).toBe('ghp_legacy_org_token')

      // Should have been re-encrypted
      const raw = store.get('githubOrgToken') as string
      const decoded = Buffer.from(raw, 'base64').toString()
      expect(decoded).toBe('encrypted:ghp_legacy_org_token')
    })
  })

  describe('encryption unavailable fallback', () => {
    beforeEach(() => {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false)
    })

    it('should store token as plaintext when encryption unavailable', () => {
      setToken('ghp_plaintext_token')
      const raw = store.get('githubToken') as string
      expect(raw).toBe('ghp_plaintext_token')
    })

    it('should retrieve plaintext token directly', () => {
      setToken('ghp_fallback_token')
      const token = getToken()
      expect(token).toBe('ghp_fallback_token')
    })

    it('should store org token as plaintext when encryption unavailable', () => {
      setGithubOrgToken('ghp_org_plaintext')
      const raw = store.get('githubOrgToken') as string
      expect(raw).toBe('ghp_org_plaintext')
    })
  })
})
