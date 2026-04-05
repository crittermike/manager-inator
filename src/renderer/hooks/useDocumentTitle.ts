import { useEffect } from 'react'

const APP_NAME = 'Manager-inator'

export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    document.title = title ? `${title} — ${APP_NAME}` : APP_NAME
    return () => {
      document.title = APP_NAME
    }
  }, [title])
}
