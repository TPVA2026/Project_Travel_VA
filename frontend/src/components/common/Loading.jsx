export default function Loading({ message = 'Loading...', size = 'normal' }) {
  const sizeClass = size === 'small' ? 'loading-sm' : size === 'large' ? 'loading-lg' : ''

  return (
    <div
      role="status"
      aria-live="polite"
      className={`loading-container ${sizeClass}`}
    >
      <div className="loading-spinner" aria-hidden="true" />
      <span className="loading-text">{message}</span>
    </div>
  )
}
