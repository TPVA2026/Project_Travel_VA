import { Link } from 'react-router-dom'

export default function ErrorMessage({
  title = 'Something went wrong',
  message,
  onRetry,
  actionText,
  actionLink,
  compact = false,
}) {
  if (!message) return null

  return (
    <div
      role="alert"
      className={`error-box ${compact ? 'error-box-compact' : ''}`}
    >
      <div className="error-icon" aria-hidden="true">⚠️</div>
      <div className="error-content">
        {title && <h4 className="error-title">{title}</h4>}
        <p className="error-message">{message}</p>
        {(onRetry || (actionLink && actionText)) && (
          <div className="error-actions">
            {onRetry && (
              <button
                type="button"
                className="btn btn-primary btn-retry"
                onClick={onRetry}
              >
                Try again
              </button>
            )}
            {actionLink && actionText && (
              <Link to={actionLink} className="btn btn-outline btn-action">
                {actionText}
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
