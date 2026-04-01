import { describe, it, expect, vi, beforeEach } from 'vitest'
import { join } from 'path'

const { mockGetAppPath, mockExistsSync } = vi.hoisted(() => ({
  mockGetAppPath: vi.fn(),
  mockExistsSync: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    getAppPath: mockGetAppPath
  }
}))

vi.mock('fs', () => ({
  existsSync: mockExistsSync
}))

import { getResourcePath, getResourcePathCandidates } from '../../src/main/resourcePaths'

describe('resource path resolution', () => {
  beforeEach(() => {
    mockGetAppPath.mockReset()
    mockExistsSync.mockReset()
    mockGetAppPath.mockReturnValue('/Applications/Manager-inator.app/Contents/Resources/app.asar')
  })

  it('prefers the app path resources directory when present', () => {
    mockExistsSync.mockImplementation((candidate: string) => candidate === '/Applications/Manager-inator.app/Contents/Resources/app.asar/resources/trayTemplate.png')

    expect(getResourcePath('trayTemplate.png')).toBe('/Applications/Manager-inator.app/Contents/Resources/app.asar/resources/trayTemplate.png')
  })

  it('falls back through alternate runtime locations when earlier candidates are missing', () => {
    mockExistsSync.mockImplementation((candidate: string) => candidate === '/runtime/Resources/trayTemplate.png')

    const originalResourcesPath = process.resourcesPath
    Object.defineProperty(process, 'resourcesPath', {
      configurable: true,
      value: '/runtime/Resources'
    })

    try {
      expect(getResourcePath('trayTemplate.png')).toBe('/runtime/Resources/trayTemplate.png')
    } finally {
      Object.defineProperty(process, 'resourcesPath', {
        configurable: true,
        value: originalResourcesPath
      })
    }
  })

  it('includes the source-tree resources directory as a final fallback candidate', () => {
    mockExistsSync.mockReturnValue(false)

    const originalResourcesPath = process.resourcesPath
    Object.defineProperty(process, 'resourcesPath', {
      configurable: true,
      value: '/runtime/Resources'
    })

    try {
      const candidates = getResourcePathCandidates('icon.png')
      expect(candidates).toHaveLength(4)
      expect(candidates[3]).toMatch(/resources\/icon\.png$|resources\/icon\.png$/)
      expect(getResourcePath('icon.png')).toBe(candidates[0])
    } finally {
      Object.defineProperty(process, 'resourcesPath', {
        configurable: true,
        value: originalResourcesPath
      })
    }
  })

  it('omits process.resourcesPath candidates when resourcesPath is undefined', () => {
    mockExistsSync.mockReturnValue(false)

    const originalResourcesPath = process.resourcesPath
    Object.defineProperty(process, 'resourcesPath', {
      configurable: true,
      value: undefined
    })

    try {
      const candidates = getResourcePathCandidates('trayTemplate.png')
      expect(candidates).toEqual([
        '/Applications/Manager-inator.app/Contents/Resources/app.asar/resources/trayTemplate.png',
        join('/Users/crittermike/Code/manager-inator-app/src/main', '../../resources', 'trayTemplate.png')
      ])
    } finally {
      Object.defineProperty(process, 'resourcesPath', {
        configurable: true,
        value: originalResourcesPath
      })
    }
  })
})
