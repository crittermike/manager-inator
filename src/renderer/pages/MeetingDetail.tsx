import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Calendar, Users, FileText, Check } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { PersonEntry } from '../../shared/types'
import { cleanSummaryContent } from '../utils/cleanSummary'
import { useToast } from '../components/common/Toast'

export function MeetingDetail() {
  const { filename } = useParams<{ filename: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { success, error: showError } = useToast()
  const dir = searchParams.get('dir') || 'meetings'
  
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [title, setTitle] = useState('')
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitleValue, setEditTitleValue] = useState('')
  
  const [speakers, setSpeakers] = useState<string[]>([])
  const [people, setPeople] = useState<PersonEntry[]>([])
  
  const decodedFilename = filename ? decodeURIComponent(filename) : ''
  const dateStr = decodedFilename.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || ''

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
          }
        }
        
        if (!extractedTitle) {
          const withoutDate = decodedFilename.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '')
          extractedTitle = withoutDate.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
        }
        
        setTitle(extractedTitle)
        setSpeakers(extractedSpeakers)
        setContent(cleanSummaryContent(rawContent))
        setLoading(false)
      })
      .catch((err) => {
        if (isMounted) {
          console.error('Failed to load meeting:', err)
          setError('Unable to load meeting content. The file may have been moved or deleted.')
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

  const findPerson = (speakerName: string) => {
    return people.find(p => 
      p.name.toLowerCase() === speakerName.toLowerCase() || 
      p.name.split(' ')[0].toLowerCase() === speakerName.toLowerCase() ||
      p.aliases.some(a => a.toLowerCase() === speakerName.toLowerCase())
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
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
          <h2 className="text-lg font-medium text-zinc-200 mb-2">Meeting Not Found</h2>
          <p className="text-sm text-zinc-500">{error || 'The meeting content could not be loaded.'}</p>
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
                  >
                    <Check className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-3 group">
                  {title}
                  {dir === 'meetings' && (
                    <button
                      onClick={() => {
                        setEditTitleValue(title)
                        setIsEditingTitle(true)
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-zinc-500 hover:text-brand-light hover:bg-brand/10 rounded-lg transition-all"
                      title="Edit title"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
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
              
              {speakers.length > 0 && (
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  <div className="flex flex-wrap gap-2">
                    {speakers.map((speaker, i) => {
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
                        <span key={i} className="px-2 py-0.5 rounded-md bg-zinc-800/30 text-zinc-400">
                          {speaker}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="px-6 py-8 prose-dark max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      </div>
    </div>
  )
}
