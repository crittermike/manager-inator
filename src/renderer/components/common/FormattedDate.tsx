import { formatDate, formatRelativeDate } from '../../utils/formatDate'

interface FormattedDateProps {
  date: string | Date
  className?: string
  transform?: (text: string) => string
}

export function FormattedDate({ date, className, transform }: FormattedDateProps) {
  const dateObj = typeof date === 'string' ? new Date(date + 'T00:00:00') : date
  if (isNaN(dateObj.getTime())) {
    return <span className={className}>{typeof date === 'string' ? date : ''}</span>
  }

  const isoDate = dateObj.toISOString().split('T')[0]
  const displayText = typeof date === 'string' ? formatDate(date) : formatRelativeDate(date)
  const fullDate = dateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const finalText = transform ? transform(displayText) : displayText

  return (
    <time dateTime={isoDate} title={fullDate} className={className}>
      {finalText}
    </time>
  )
}
