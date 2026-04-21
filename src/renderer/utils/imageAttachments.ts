export interface PastedImage {
  id: string
  filename: string
  dataUrl: string
  path: string
}

/**
 * Reads an image blob and commits it to `attachments/` in the repo,
 * returning a descriptor usable as an image attachment for AI messages.
 */
export function uploadPastedImage(blob: Blob, mimeType: string): Promise<PastedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const dataUrl = reader.result as string
        const subtype = mimeType.split('/')[1] || 'png'
        const ext = subtype === 'jpeg' ? 'jpg' : subtype
        const id = crypto.randomUUID().slice(0, 8)
        const filename = `${new Date().toISOString().split('T')[0]}-${id}.${ext}`
        const path = `attachments/${filename}`
        const base64 = dataUrl.split(',')[1]
        await window.api.commitBinaryFile(path, base64, `Attach image: ${filename}`)
        resolve({ id, filename, dataUrl, path })
      } catch (e) {
        reject(e)
      }
    }
    reader.onerror = () => reject(reader.error || new Error('Failed to read image'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Processes a ClipboardEvent and uploads any image items found.
 * Calls preventDefault when images are present.
 */
export async function handleImagePaste(
  e: React.ClipboardEvent,
): Promise<PastedImage[]> {
  const items = Array.from(e.clipboardData.items)
  const imageItems = items.filter(it => it.type.startsWith('image/'))
  if (imageItems.length === 0) return []
  e.preventDefault()
  const results: PastedImage[] = []
  for (const item of imageItems) {
    const blob = item.getAsFile()
    if (!blob) continue
    try {
      results.push(await uploadPastedImage(blob, item.type))
    } catch (err) {
      console.error('Failed to upload pasted image:', err)
    }
  }
  return results
}
