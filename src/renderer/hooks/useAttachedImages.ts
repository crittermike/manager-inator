import { useState, useEffect, useCallback } from 'react'

/**
 * Loads [Attached image: path] references from content as base64 data URLs.
 * Returns a function to transform content, replacing refs with placeholders,
 * and a component map for rendering images directly.
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

  /** Strip [Attached image: ...] refs from text content */
  const stripImageRefs = useCallback((text: string): string => {
    return text.replace(/\[Attached image:\s*(.*?)\]/g, '')
  }, [])

  /** Get loaded image data URLs for rendering */
  const getImageUrls = useCallback((): string[] => {
    return Object.values(imageDataUrls)
  }, [imageDataUrls])

  return { stripImageRefs, getImageUrls, imageCount: Object.keys(imageDataUrls).length }
}

/**
 * Loads an explicit list of repo-relative image paths as base64 data URLs.
 * Paths that fail to load resolve to an empty string and are skipped.
 */
export function useImagePaths(paths: string[] | undefined) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const key = (paths || []).join('|')

  useEffect(() => {
    if (!paths || paths.length === 0) { setUrls({}); return }
    let stale = false
    Promise.all(paths.map(async (p) => {
      try {
        const base64 = await window.api.getFileBase64(p)
        const ext = p.split('.').pop()?.toLowerCase() || 'png'
        const mime: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }
        return { path: p, url: `data:${mime[ext] || 'image/png'};base64,${base64}` }
      } catch (err) {
        console.error('[useImagePaths] Failed to load', p, err)
        return { path: p, url: '' }
      }
    })).then(results => {
      if (stale) return
      const map: Record<string, string> = {}
      for (const r of results) if (r.url) map[r.path] = r.url
      setUrls(map)
    })
    return () => { stale = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return urls
}
