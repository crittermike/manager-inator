import { useState, useEffect, useCallback } from 'react'

/**
 * Loads [Attached image: path] references from content as base64 data URLs.
 * Returns a function to transform content, replacing refs with inline images.
 */
export function useAttachedImages(content: string | null) {
  const [imageDataUrls, setImageDataUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!content) return
    const imageRefs = [...content.matchAll(/\[Attached image:\s*(.*?)\]/g)]
    if (imageRefs.length === 0) return
    const paths = imageRefs.map(m => m[1]?.trim()).filter(Boolean)
    if (paths.length === 0) return

    let stale = false
    Promise.all(paths.map(async (p) => {
      try {
        const base64 = await window.api.getFileBase64(p)
        const ext = p.split('.').pop()?.toLowerCase() || 'png'
        const mime: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }
        return { path: p, url: `data:${mime[ext] || 'image/png'};base64,${base64}` }
      } catch (err) {
        console.error('[useAttachedImages] Failed to load', p, err)
        return { path: p, url: '' }
      }
    })).then(results => {
      if (stale) return
      const map: Record<string, string> = {}
      for (const r of results) if (r.url) map[r.path] = r.url
      setImageDataUrls(map)
    })

    return () => { stale = true }
  }, [content])

  const transformContent = useCallback((text: string): string => {
    return text.replace(/\[Attached image:\s*(.*?)\]/g, (_m, p) => {
      const url = imageDataUrls[p.trim()]
      return url ? `![Attached image](${url})` : ''
    })
  }, [imageDataUrls])

  return { transformContent, hasImages: Object.keys(imageDataUrls).length > 0 }
}
