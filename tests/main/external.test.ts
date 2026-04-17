import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockExistsSync, mockOpenExternal, mockShowItemInFolder, mockGetSettings, mockPlatform, mockHomedir } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockOpenExternal: vi.fn(),
  mockShowItemInFolder: vi.fn(),
  mockGetSettings: vi.fn(),
  mockPlatform: vi.fn(),
  mockHomedir: vi.fn()
}))

vi.mock('electron', () => ({
  shell: {
    openExternal: mockOpenExternal,
    showItemInFolder: mockShowItemInFolder
  }
}))

vi.mock('fs', () => ({ existsSync: mockExistsSync }))

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os')
  return { ...actual, platform: mockPlatform, homedir: mockHomedir }
})

vi.mock('../../src/main/store', () => ({
  getSettings: mockGetSettings
}))

const REPO = '/Users/test/repo'

beforeEach(() => {
  vi.resetAllMocks()
  vi.resetModules()
  mockHomedir.mockReturnValue('/Users/test')
  mockPlatform.mockReturnValue('darwin')
  mockGetSettings.mockReturnValue({ repoPath: REPO })
  mockOpenExternal.mockResolvedValue(undefined)
})

describe('detectExternalApps', () => {
  it('detects VS Code when installed in /Applications', async () => {
    mockExistsSync.mockImplementation((p: string) => p === '/Applications/Visual Studio Code.app')
    const { detectExternalApps } = await import('../../src/main/external')
    expect(detectExternalApps()).toEqual({ vscode: true, obsidian: false, finder: true })
  })

  it('detects Cursor as a VS Code-compatible editor', async () => {
    mockExistsSync.mockImplementation((p: string) => p === '/Applications/Cursor.app')
    const { detectExternalApps } = await import('../../src/main/external')
    expect(detectExternalApps().vscode).toBe(true)
  })

  it('detects Obsidian when installed', async () => {
    mockExistsSync.mockImplementation((p: string) => p === '/Applications/Obsidian.app')
    const { detectExternalApps } = await import('../../src/main/external')
    expect(detectExternalApps().obsidian).toBe(true)
  })

  it('detects nothing on non-darwin platforms', async () => {
    mockPlatform.mockReturnValue('linux')
    mockExistsSync.mockReturnValue(true)
    const { detectExternalApps } = await import('../../src/main/external')
    expect(detectExternalApps()).toEqual({ vscode: false, obsidian: false, finder: false })
  })

  it('caches detection result across calls', async () => {
    mockExistsSync.mockImplementation((p: string) => p === '/Applications/Visual Studio Code.app')
    const { detectExternalApps } = await import('../../src/main/external')
    detectExternalApps()
    const callsAfterFirst = mockExistsSync.mock.calls.length
    detectExternalApps()
    expect(mockExistsSync.mock.calls.length).toBe(callsAfterFirst)
  })
})

describe('openInVSCode', () => {
  it('opens repo-relative path with vscode:// URL scheme', async () => {
    mockExistsSync.mockReturnValue(true)
    const { openInVSCode } = await import('../../src/main/external')
    await openInVSCode('contexts/foo.md')
    expect(mockOpenExternal).toHaveBeenCalledWith(`vscode://file${REPO}/contexts/foo.md`)
  })

  it('blocks path traversal', async () => {
    mockExistsSync.mockReturnValue(true)
    const { openInVSCode } = await import('../../src/main/external')
    await expect(openInVSCode('../../etc/passwd')).rejects.toThrow(/Path traversal blocked/)
    expect(mockOpenExternal).not.toHaveBeenCalled()
  })

  it('throws when file does not exist', async () => {
    mockExistsSync.mockReturnValue(false)
    const { openInVSCode } = await import('../../src/main/external')
    await expect(openInVSCode('contexts/missing.md')).rejects.toThrow(/File not found/)
  })
})

describe('openInObsidian', () => {
  it('uses obsidian://open?path= URL with URI-encoded absolute path', async () => {
    mockExistsSync.mockReturnValue(true)
    const { openInObsidian } = await import('../../src/main/external')
    await openInObsidian('contexts/has spaces.md')
    expect(mockOpenExternal).toHaveBeenCalledWith(
      `obsidian://open?path=${encodeURIComponent(`${REPO}/contexts/has spaces.md`)}`
    )
  })
})

describe('revealInFinder', () => {
  it('calls shell.showItemInFolder with absolute path', async () => {
    mockExistsSync.mockReturnValue(true)
    const { revealInFinder } = await import('../../src/main/external')
    revealInFinder('contexts/foo.md')
    expect(mockShowItemInFolder).toHaveBeenCalledWith(`${REPO}/contexts/foo.md`)
  })

  it('blocks path traversal', async () => {
    mockExistsSync.mockReturnValue(true)
    const { revealInFinder } = await import('../../src/main/external')
    expect(() => revealInFinder('../outside.md')).toThrow(/Path traversal blocked/)
    expect(mockShowItemInFolder).not.toHaveBeenCalled()
  })
})
