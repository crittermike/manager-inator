// @vitest-environment happy-dom
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockCommitBinaryFile = vi.fn().mockResolvedValue(undefined)

Object.defineProperty(globalThis.window, 'api', {
  configurable: true,
  writable: true,
  value: { commitBinaryFile: mockCommitBinaryFile },
})

import { uploadPastedImage, handleImagePaste } from '../../src/renderer/utils/imageAttachments'

function makeBlob(bytes: number[], type: string): Blob {
  return new Blob([new Uint8Array(bytes)], { type })
}

describe('uploadPastedImage', () => {
  beforeEach(() => { mockCommitBinaryFile.mockClear() })

  it('commits the image under attachments/ and returns a descriptor', async () => {
    const blob = makeBlob([137, 80, 78, 71], 'image/png')
    const result = await uploadPastedImage(blob, 'image/png')
    expect(result.path).toMatch(/^attachments\/.+\.png$/)
    expect(result.filename).toMatch(/\.png$/)
    expect(result.dataUrl.startsWith('data:')).toBe(true)
    expect(mockCommitBinaryFile).toHaveBeenCalledWith(
      result.path,
      expect.any(String),
      expect.stringContaining('Attach image:')
    )
  })

  it('maps image/jpeg to .jpg extension', async () => {
    const blob = makeBlob([255, 216, 255], 'image/jpeg')
    const result = await uploadPastedImage(blob, 'image/jpeg')
    expect(result.filename).toMatch(/\.jpg$/)
  })

  it('preserves other subtypes like webp', async () => {
    const blob = makeBlob([82, 73, 70, 70], 'image/webp')
    const result = await uploadPastedImage(blob, 'image/webp')
    expect(result.filename).toMatch(/\.webp$/)
  })
})

describe('handleImagePaste', () => {
  beforeEach(() => { mockCommitBinaryFile.mockClear() })

  function makePasteEvent(items: Array<{ type: string; file: File | null }>): React.ClipboardEvent {
    const preventDefault = vi.fn()
    return {
      preventDefault,
      clipboardData: {
        items: items.map(it => ({
          type: it.type,
          getAsFile: () => it.file,
        })),
      },
    } as unknown as React.ClipboardEvent
  }

  it('returns [] and does not preventDefault when no images are present', async () => {
    const evt = makePasteEvent([{ type: 'text/plain', file: null }])
    const result = await handleImagePaste(evt)
    expect(result).toEqual([])
    expect(evt.preventDefault).not.toHaveBeenCalled()
    expect(mockCommitBinaryFile).not.toHaveBeenCalled()
  })

  it('uploads image items and calls preventDefault', async () => {
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'pasted.png', { type: 'image/png' })
    const evt = makePasteEvent([
      { type: 'text/plain', file: null },
      { type: 'image/png', file },
    ])
    const result = await handleImagePaste(evt)
    expect(evt.preventDefault).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(1)
    expect(result[0].path).toMatch(/^attachments\//)
    expect(mockCommitBinaryFile).toHaveBeenCalledTimes(1)
  })
})
