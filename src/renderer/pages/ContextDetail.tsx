import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Calendar, Users, FileText, Check, X, Copy, Download, UserPlus } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
const REMARK_PLUGINS = [remarkGfm]
import type { PersonEntry } from '../../shared/types'
import { cleanSummaryContent } from '../utils/cleanSummary'
import { useToast } from '../components/common/Toast'

export function ContextDetail() {
  const { filename } = useParams<{ filename: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { success, error: showError } = useToast()
  const dir = searchParams.get('dir') || 'contexts'
  
  const [content, setContent] = useState<string | null>(null)
  const [rawContent, setRawContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [activeTab, setActiveTab] = useState<'summary' | 'transcript'>('summary')
  const [transcriptContent, setTranscriptContent] = useState<string | null>(null)
  
  const [isEditingContent, setIsEditingContent] = useState(false)
  const [editContentValue, setEditContentValue] = useState('')
  
  const [title, setTitle] = useState('')
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitleValue, setEditTitleValue] = useState('')
  
  const [speakers, setSpeakers] = useState<string[]>([])
  const [people, setPeople] = useState<PersonEntry[]>([])

  const [isEditingSpeakers, setIsEditingSpeakers] = useState(false)
  const [editingSpeakersList, setEditingSpeakersList] = useState<string[]>([])
  const [speakerInput, setSpeakerInput] = useState('')
  const [showSpeakerDropdown, setShowSpeakerDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  
  const decodedFilename = filename ? decodeURIComponent(filename) : ''
  const dateStr = decodedFilename.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || ''

  const [copiedContent, setCopiedContent] = useState(false)

  const handleCopyContent = useCallback(async () => {
    const textToCopy = activeTab === 'summary' ? content : transcriptContent
    if (!textToCopy) return
    await navigator.clipboard.writeText(textToCopy)
    setCopiedContent(true)
    success('Copied to clipboard')
    setTimeout(() => setCopiedContent(false), 2000)
  }, [content, transcriptContent, activeTab, success])

  const handleDownloadContent = useCallback(() => {
    const textToDownload = activeTab === 'summary' ? content : transcriptContent
    if (!textToDownload) return
    const blob = new Blob([textToDownload], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = decodedFilename || (activeTab === 'summary' ? 'context.md' : 'transcript.txt')
    if (activeTab === 'transcript') {
      a.download = a.download.replace(/\.md$/, '.txt')
    }
    a.click()
    URL.revokeObjectURL(url)
    success('Downloaded')
  }, [content, transcriptContent, activeTab, decodedFilename, success])

  useEffect(() => {
    window.api.listPeople().then(setPeople).catch(console.error)
  }, [])

  useEffect(() => {
    if (!decodedFilename) return
    
    let isMounted = true
    setLoading(true)
    setError(null)
    
    window.api.getFileContent(`${dir}/${decodedFilename}`)
      .then((rawContent) => {
        if (!isMounted) return
        
        const cleanAttendeeName = (name: string) => name.replace(/\s*\(.*?\)\s*/g, '').trim()
        
        const frontmatterMatch = rawContent.match(/^---\n([\s\S]*?)\n---/)
        let extractedTitle = ''
        let extractedSpeakers: string[] = []
        
        if (frontmatterMatch) {
          const fm = frontmatterMatch[1]
          
          const titleMatch = fm.match(/^title:\s*(.+)$/m)
          if (titleMatch) {
            extractedTitle = titleMatch[1].trim()
          }
          
          const speakersMatch = fm.match(/^speakers:\s*\n((?:\s+-\s+.*\n?)*)/m)
          if (speakersMatch) {
            const speakerLines = speakersMatch[1].split('\n')
            extractedSpeakers = speakerLines
              .map(line => line.replace(/^\s+-\s+/, '').trim())
              .filter(Boolean)
              .map(cleanAttendeeName)
          }
        }
        
        if (extractedSpeakers.length === 0) {
          const inlineMatch = rawContent.match(/\*\*Attendees:?\*\*:?\s*(.+)$/im)
          if (inlineMatch) {
            const raw = inlineMatch[1]
            const names: string[] = []
            let current = ''
            let depth = 0
            for (const ch of raw) {
              if (ch === '(') depth++
              else if (ch === ')') depth--
              else if (ch === ',' && depth === 0) {
                if (current.trim()) names.push(current.trim())
                current = ''
                continue
              }
              current += ch
            }
            if (current.trim()) names.push(current.trim())
            extractedSpeakers = names.map(cleanAttendeeName)
          }
        }
        
        if (extractedSpeakers.length === 0) {
          const headingMatch = rawContent.match(/##\s*Attendees\s*\n((?:[-*]\s+.*\n?)+)/i)
          if (headingMatch) {
            extractedSpeakers = headingMatch[1].split('\n')
              .map(line => line.replace(/^[-*]\s+/, '').trim())
              .filter(Boolean)
              .map(cleanAttendeeName)
          }
        }
        
        if (!extractedTitle) {
          const withoutDate = decodedFilename.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '')
          extractedTitle = withoutDate.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
        }
        
        setTitle(extractedTitle)
        setSpeakers(extractedSpeakers)
        
        // Split at "## Raw content" — summary above, raw transcript below
        const rawContentHeadingMatch = rawContent.match(/\n## Raw content\s*\n/)
        if (rawContentHeadingMatch && rawContentHeadingMatch.index !== undefined) {
          const summaryPart = rawContent.slice(0, rawContentHeadingMatch.index)
          const transcriptPart = rawContent.slice(rawContentHeadingMatch.index + rawContentHeadingMatch[0].length).trim()
          setRawContent(summaryPart)
          setContent(cleanSummaryContent(summaryPart))
          setTranscriptContent(transcriptPart || null)
        } else {
          setRawContent(rawContent)
          setContent(cleanSummaryContent(rawContent))
          setTranscriptContent(null)
        }
        setLoading(false)
      })
      .catch((err) => {
        if (isMounted) {
          console.error('Failed to load context:', err)
          setError('Unable to load context content. The file may have been moved or deleted.')
          setLoading(false)
        }
      })
      
    return () => { isMounted = false }
  }, [decodedFilename, dir])

  const handleSaveTitle = useCallback(async () => {
    if (!editTitleValue.trim() || editTitleValue === title) {
      setIsEditingTitle(false)
      return
    }
    
    try {
      await window.api.saveMeetingTitle(decodedFilename, editTitleValue)
      setTitle(editTitleValue)
      setIsEditingTitle(false)
      success('Title saved successfully')
    } catch (err) {
      console.error('Failed to save title:', err)
      showError('Failed to save title')
    }
  }, [decodedFilename, editTitleValue, title, success, showError])

  const handleSaveSpeakers = useCallback(async () => {
    try {
      await window.api.saveMeetingSpeakers(decodedFilename, editingSpeakersList)
      setSpeakers(editingSpeakersList)
      setIsEditingSpeakers(false)
      success('Attendees saved successfully')
    } catch (err) {
      console.error('Failed to save attendees:', err)
      showError('Failed to save attendees')
    }
  }, [decodedFilename, editingSpeakersList, success, showError])

  const handleAddSpeaker = (name: string) => {
    if (!name.trim()) return
    const cleaned = name.trim().replace(/\s*\(.*?\)\s*/g, '')
    if (!editingSpeakersList.includes(cleaned)) {
      setEditingSpeakersList([...editingSpeakersList, cleaned])
    }
    setSpeakerInput('')
    setShowSpeakerDropdown(false)
  }

  const handleRemoveSpeaker = (nameToRemove: string) => {
    setEditingSpeakersList(editingSpeakersList.filter(name => name !== nameToRemove))
  }

  const findPerson = (speakerName: string) => {
    return people.find(p => 
      p.name.toLowerCase() === speakerName.toLowerCase() || 
      p.aliases.some(a => a.toLowerCase() === speakerName.toLowerCase())
    )
  }

  const filteredPeople = people.filter(p => 
    p.name.toLowerCase().includes(speakerInput.toLowerCase()) &&
    !editingSpeakersList.includes(p.name)
  )

  const handleTabChange = (tab: 'summary' | 'transcript') => {
    setActiveTab(tab)
  }

  const handleCreateSpeakerPerson = async (speakerName: string) => {
    const trimmed = speakerName.trim()
    if (!trimmed) return
    const slug = trimmed.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    
    const existingSlug = await window.api.findPersonByName(trimmed)
    if (existingSlug) {
      const person = people.find(p => p.slug === existingSlug)
      if (person) {
        const isReport = person.relationship?.toLowerCase() === 'direct report'
        navigate(isReport ? `/report/${person.slug}` : `/people/${person.slug}`)
      }
      return
    }

    const newContent = `---\nname: ${trimmed}\nslug: ${slug}\naliases: \nrole: \ngithub: \nlocation: \nrelationship: \n---\n\n# ${trimmed}\n`
    
    try {
      await window.api.commitFile(`people/${slug}.md`, newContent, `Add person: ${trimmed}`)
      await window.api.addPersonToContext(decodedFilename, slug)
      success(`Created page for ${trimmed}`)
      const freshPeople = await window.api.listPeople()
      setPeople(freshPeople)
      navigate(`/people/${slug}`)
    } catch (err) {
      console.error('Failed to create person:', err)
      showError('Failed to create person page')
    }
  }

  const handleSaveContent = async () => {
    try {
      const fileContent = transcriptContent
        ? `${editContentValue}\n\n## Raw content\n\n${transcriptContent}`
        : editContentValue
      await window.api.commitFile(`${dir}/${decodedFilename}`, fileContent, `Update context: ${decodedFilename}`)
      setRawContent(editContentValue)
      setContent(cleanSummaryContent(editContentValue))
      setIsEditingContent(false)
      success('Context updated')
    } catch (err) {
      console.error('Failed to save content:', err)
      showError('Failed to save content')
    }
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowSpeakerDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-12 space-y-6 animate-fade-in">
        <div className="skeleton h-4 w-16 rounded" />
        <div className="bg-surface rounded-xl border border-border p-6 space-y-4">
          <div className="skeleton h-6 w-64 rounded" />
          <div className="flex gap-3">
            <div className="skeleton h-4 w-24 rounded" />
            <div className="skeleton h-4 w-32 rounded" />
          </div>
          <div className="space-y-2 pt-2">
            {[1,2,3,4].map(i => (
              <div key={i} className="skeleton h-3 rounded" style={{ width: `${85 - i * 10}%` }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error || !content) {
    return (
      <div className="max-w-3xl mx-auto py-12 animate-fade-in">
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="bg-surface rounded-xl border border-border p-8 text-center">
          <FileText className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <h2 className="text-lg font-medium text-zinc-200 mb-2">Content not found 📋</h2>
          <p className="text-sm text-zinc-500">This content may have been moved or deleted.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto pb-24 animate-fade-in">
      <button 
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="px-6 py-5 border-b border-border bg-surface-raised/30">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              {isEditingTitle ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="text"
                    value={editTitleValue}
                    onChange={e => setEditTitleValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSaveTitle()
                      if (e.key === 'Escape') setIsEditingTitle(false)
                    }}
                    className="flex-1 bg-surface border border-brand/50 rounded-lg px-3 py-1.5 text-xl font-bold text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand/20"
                    autoFocus
                  />
                    <button
                    onClick={handleSaveTitle}
                    className="p-1.5 text-success hover:bg-success/10 rounded-lg transition-colors"
                    title="Save title"
                    aria-label="Save title"
                  >
                    <Check className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-3 group">
                  {title}
                  <button
                    onClick={() => {
                      setEditTitleValue(title)
                      setIsEditingTitle(true)
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-zinc-500 hover:text-brand-light hover:bg-brand/10 rounded-lg transition-all"
                    title="Edit title"
                    aria-label="Edit title"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </h1>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-zinc-400">
              {dateStr && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>{dateStr}</span>
                </div>
              )}
              
              <div className="flex items-center gap-2 relative group/speakers">
                  <Users className="w-4 h-4" />
                  
                  {isEditingSpeakers ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      {editingSpeakersList.map((speaker, i) => (
                        <span key={i} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800/50 text-zinc-300">
                          {speaker}
                          <button
                            onClick={() => handleRemoveSpeaker(speaker)}
                            className="hover:text-danger hover:bg-danger/10 rounded-full p-0.5 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      
                      <div className="relative" ref={dropdownRef}>
                        <input
                          type="text"
                          value={speakerInput}
                          onChange={e => {
                            setSpeakerInput(e.target.value)
                            setShowSpeakerDropdown(true)
                          }}
                          onFocus={() => setShowSpeakerDropdown(true)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleAddSpeaker(speakerInput)
                            }
                            if (e.key === 'Escape') {
                              setShowSpeakerDropdown(false)
                            }
                          }}
                          placeholder="Add attendee..."
                          className="bg-surface border border-brand/50 rounded-lg px-3 py-1 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand/20 w-40"
                          autoFocus
                        />
                        {showSpeakerDropdown && speakerInput && filteredPeople.length > 0 && (
                          <div className="absolute top-full left-0 mt-1 w-full bg-surface-raised border border-border rounded-lg shadow-lg z-10 overflow-hidden">
                            {filteredPeople.map(p => (
                              <button
                                key={p.slug}
                                onMouseDown={(e) => {
                                  e.preventDefault() // Prevent input blur
                                  handleAddSpeaker(p.name)
                                }}
                                className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700/50 hover:text-zinc-100"
                              >
                                {p.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      <button
                        onClick={handleSaveSpeakers}
                        className="p-1.5 text-success hover:bg-success/10 rounded-lg transition-colors ml-1"
                        title="Save attendees"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setIsEditingSpeakers(false)
                          setSpeakerInput('')
                        }}
                        className="p-1.5 text-zinc-400 hover:bg-zinc-800/50 rounded-lg transition-colors"
                        title="Cancel"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="flex flex-wrap gap-2">
                        {speakers.length === 0 ? (
                          <span className="text-zinc-500 italic">No attendees recorded</span>
                        ) : (
                          speakers.map((speaker, i) => {
                            const person = findPerson(speaker)
                            if (person) {
                              const isReport = person.relationship?.toLowerCase() === 'direct report'
                              const route = isReport ? `/report/${person.slug}` : `/people/${person.slug}`
                              return (
                                <button
                                  key={i}
                                  onClick={() => navigate(route)}
                                  className="px-2 py-0.5 rounded-md bg-zinc-800/50 hover:bg-zinc-700/50 text-zinc-300 transition-colors"
                                >
                                  {person.name}
                                </button>
                              )
                            }
                            return (
                              <span key={i} className="px-2 py-0.5 rounded-md bg-zinc-800/30 text-zinc-400 flex items-center gap-1">
                                {speaker}
                                <button
                                  onClick={() => handleCreateSpeakerPerson(speaker)}
                                  className="p-0.5 text-zinc-500 hover:text-brand-light hover:bg-brand/10 rounded transition-colors"
                                  title={`Create page for ${speaker}`}
                                >
                                  <UserPlus className="w-3 h-3" />
                                </button>
                              </span>
                            )
                          })
                        )}
                      </div>
                      <button
                        onClick={() => {
                          setEditingSpeakersList([...speakers])
                          setIsEditingSpeakers(true)
                        }}
                        className="opacity-0 group-hover/speakers:opacity-100 p-1 text-zinc-500 hover:text-brand-light hover:bg-brand/10 rounded-lg transition-all"
                        title="Edit attendees"
                        aria-label="Edit attendees"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
            </div>
          </div>
        </div>
        
        <div className="flex border-b border-border px-4">
          <button
            onClick={() => handleTabChange('summary')}
            className={`text-sm px-4 py-2 -mb-px transition-colors border-b-2 ${activeTab === 'summary' ? 'text-zinc-100 border-brand' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}
          >
            Summary
          </button>
          <button
            onClick={() => handleTabChange('transcript')}
            className={`text-sm px-4 py-2 -mb-px transition-colors border-b-2 ${activeTab === 'transcript' ? 'text-zinc-100 border-brand' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}
          >
            Transcript
          </button>
        </div>
        
        <div className="px-6 py-5 relative group/content">
          <div className="absolute top-4 right-4 flex items-center gap-1.5 opacity-0 group-hover/content:opacity-100 transition-opacity z-10">
            {activeTab === 'summary' && !isEditingContent && (
              <button
                onClick={() => {
                  setEditContentValue(rawContent || content || '')
                  setIsEditingContent(true)
                }}
                className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-surface-raised rounded-lg transition-colors"
                title="Edit summary"
                aria-label="Edit summary"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
            {activeTab === 'summary' && isEditingContent && (
              <>
                <button
                  onClick={handleSaveContent}
                  className="p-1.5 text-success hover:bg-success/10 rounded-lg transition-colors"
                  title="Save changes"
                  aria-label="Save changes"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsEditingContent(false)}
                  className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-surface-raised rounded-lg transition-colors"
                  title="Cancel editing"
                  aria-label="Cancel editing"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            )}
            <button
              onClick={handleCopyContent}
              className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-surface-raised rounded-lg transition-colors"
              title="Copy content"
              aria-label="Copy content"
            >
              {copiedContent ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              onClick={handleDownloadContent}
              className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-surface-raised rounded-lg transition-colors"
              title={activeTab === 'summary' ? "Download as markdown" : "Download transcript"}
              aria-label={activeTab === 'summary' ? "Download as markdown" : "Download transcript"}
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
          
          {activeTab === 'summary' ? (
            isEditingContent ? (
              <textarea
                value={editContentValue}
                onChange={e => setEditContentValue(e.target.value)}
                className="w-full min-h-[400px] bg-surface border border-border rounded-lg p-4 text-zinc-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand/20 resize-y"
              />
            ) : (
              <div className="prose-dark max-w-none">
                <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{content}</ReactMarkdown>
              </div>
            )
          ) : (
            <pre className="font-mono text-sm text-zinc-300 whitespace-pre-wrap">
              {transcriptContent ? (
                transcriptContent
              ) : (
                <span className="text-zinc-500 italic font-sans">No raw transcript found in this file.</span>
              )}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
