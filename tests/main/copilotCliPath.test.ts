import { describe, expect, it, vi, beforeEach } from 'vitest'
import { join } from 'path'

// Mock store before importing
vi.mock('../../src/main/store', () => ({
  getSettings: () => ({ defaultModel: 'gpt-4.1' }),
  getToken: () => 'test-token',
  getGithubOrgToken: () => null,
  getGithubOrgName: () => null
}))

import { resolveCopilotCliPath } from '../../src/main/copilot'

describe('resolveCopilotCliPath', () => {
  it('returns a path ending in .js when bundled copilot exists', async () => {
    const result = await resolveCopilotCliPath()
    // In the dev/test environment, node_modules/@github/copilot/index.js exists
    expect(result).toBeDefined()
    expect(result!.endsWith('.js')).toBe(true)
    expect(result).toContain('@github/copilot/index.js')
  })

  it('bundled .js path is preferred over system bin paths', async () => {
    const result = await resolveCopilotCliPath()
    // Should NOT be a bin shim path
    if (result) {
      expect(result).not.toContain('.bin/copilot')
      expect(result).not.toEqual('/usr/local/bin/copilot')
      expect(result).not.toEqual('/opt/homebrew/bin/copilot')
    }
  })

  it('resolved path actually exists on disk', async () => {
    const result = await resolveCopilotCliPath()
    expect(result).toBeDefined()
    const fs = await import('fs')
    expect(() => fs.statSync(result!)).not.toThrow()
  })
})
