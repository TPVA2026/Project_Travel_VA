import { safeSourceUrl, sourceLabel } from '../../services/api.js'
import Icon from './Icon.jsx'

export default function SourceLink({ url, label, compact = false, className = '' }) {
  const safeUrl = safeSourceUrl(url)
  if (!safeUrl) return null
  const name = typeof label === 'string' && label.trim() ? label.trim() : sourceLabel(safeUrl)
  return (
    <a
      className={`source-link${compact ? ' source-link--compact' : ''}${className ? ` ${className}` : ''}`}
      href={safeUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={`Nguồn: ${name} (mở tab mới)`}
      aria-label={`Nguồn: ${name} (mở tab mới)`}
    >
      <Icon name="external" size={12} />
      <span>{compact ? 'Nguồn' : `Nguồn · ${name}`}</span>
    </a>
  )
}
