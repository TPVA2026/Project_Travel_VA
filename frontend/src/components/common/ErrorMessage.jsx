export default function ErrorMessage({ message, onRetry }) {
  if (!message) return null
  return (
    <div role="alert" className="error-box">
      <strong>Error:</strong> {message}
      {onRetry && <button className="btn" onClick={onRetry}>Try again</button>}
    </div>
  )
}