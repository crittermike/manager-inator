import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface ActiveFile {
  path: string
  title: string
  content: string
}

interface ActiveFileContextValue {
  activeFile: ActiveFile | null
  setActiveFile: (file: ActiveFile | null) => void
}

const ActiveFileContext = createContext<ActiveFileContextValue>({
  activeFile: null,
  setActiveFile: () => {}
})

export function ActiveFileProvider({ children }: { children: ReactNode }) {
  const [activeFile, setActiveFileState] = useState<ActiveFile | null>(null)

  const setActiveFile = useCallback((file: ActiveFile | null) => {
    setActiveFileState(file)
  }, [])

  return (
    <ActiveFileContext.Provider value={{ activeFile, setActiveFile }}>
      {children}
    </ActiveFileContext.Provider>
  )
}

export function useActiveFile() {
  return useContext(ActiveFileContext)
}
