import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  fetchPlanById,
  fetchSavedTrip,
  getSelectedPlanId,
  selectPlan,
  setSelectedPlan,
  clearSelectedPlan,
  fmtMoney,
  collectPlaceIds,
  collectActivitySources,
  fetchPlaceCatalog,
  getPlaceCatalog,
  indexPlaces,
  createNameResolver,
} from '../services/api.js'
import {
  formatMissingCostItem,
  getPlanEstimate,
  getTripChecklistItems,
} from '../services/tripEstimate.js'
import { applyStopChange, getValidAlternatives } from '../services/itineraryEdit.js'
import ItineraryTimeline from '../components/itinerary/ItineraryTimeline.jsx'
import StopAlternativesDialog from '../components/itinerary/StopAlternativesDialog.jsx'
import EstimatedTripTotal from '../components/itinerary/EstimatedTripTotal.jsx'
import EstimateDetails from '../components/itinerary/EstimateDetails.jsx'
import TripServices from '../components/itinerary/TripServices.jsx'
import RouteOverview from '../components/itinerary/RouteOverview.jsx'
import TripChecklist from '../components/itinerary/TripChecklist.jsx'
import TripProgress from '../components/TripProgress.jsx'
import Loading from '../components/common/Loading.jsx'
import ErrorMessage from '../components/common/ErrorMessage.jsx'
import Icon from '../components/common/Icon.jsx'
import Fireworks from '../components/common/Fireworks.jsx'
import {
  getDestinationImage,
  getDestinationLabel,
} from '../services/destinationImages.js'
import { useAuth } from '../auth/AuthContext.jsx'

const STATUS_LABEL = {
  FEASIBLE: 'Feasible',
  INFEASIBLE: 'Not feasible',
  UNVERIFIED: 'Unverified',
}

function orderScheduleDays(days) {
  if (!Array.isArray(days)) return []
  return days
    .map((day, index) => ({ day, order: Number(day?.day ?? day?.dayNumber) || index + 1 }))
    .sort((a, b) => a.order - b.order)
    .map((entry, index) => ({ ...entry.day, day: index + 1, dayNumber: index + 1 }))
}

export default function SelectedPlanPage() {
  const { user, isGoogleConfigured } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const queryId = params.get('id')
  const savedTripId = params.get('trip')
  const storedId = getSelectedPlanId()
  const [activePlanId, setActivePlanId] = useState(
    () => savedTripId || queryId || storedId || null
  )

  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(Boolean(activePlanId))
  const [error, setError] = useState(null)
  const [isChosen, setIsChosen] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState(false)
  const [copyError, setCopyError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [banner, setBanner] = useState(null)

  const [activeScheduleDay, setActiveScheduleDay] = useState('all')
  const [celebrate, setCelebrate] = useState(false)
  const [placesById, setPlacesById] = useState(() => new Map())
  const [placeCatalogError, setPlaceCatalogError] = useState(null)
  const [checkedChecklist, setCheckedChecklist] = useState({})
  const checklistRef = useRef(null)

  const [editMode, setEditMode] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [editStatus, setEditStatus] = useState('idle')
  const [editError, setEditError] = useState('')
  const [editToast, setEditToast] = useState(null)
  const editTimerRef = useRef(null)

  const estimate = useMemo(() => getPlanEstimate(plan), [plan])
  const checklistItems = useMemo(() => getTripChecklistItems(plan), [plan])
  const checklistStorageKey = plan?.planId || plan?.id
    ? `tpva_trip_checklist:${plan.planId || plan.id}`
    : null

  useEffect(() => {
    const requestedId = savedTripId || queryId
    if (requestedId && requestedId !== activePlanId) setActivePlanId(requestedId)
  }, [savedTripId, queryId, activePlanId])

  useEffect(() => {
    let cancelled = false
    setPlacesById(new Map())
    setPlaceCatalogError(null)
    const ids = collectPlaceIds(plan)
    if (!ids.length) return undefined
    fetchPlaceCatalog({ ids, destination: plan.destinationId }).then((places) => {
      if (!cancelled) setPlacesById(indexPlaces(places))
    }).catch(() => {
      if (!cancelled) setPlaceCatalogError('Could not load place names. Reload the page to try again.')
    })
    return () => { cancelled = true }
  }, [plan])

  useEffect(() => {
    if (!checklistStorageKey) {
      setCheckedChecklist({})
      return
    }
    try {
      const raw = window.localStorage.getItem(checklistStorageKey)
      const parsed = raw ? JSON.parse(raw) : {}
      const allowed = new Set(checklistItems.map((item) => item.key))
      const next = {}
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [key, value] of Object.entries(parsed)) {
          if (allowed.has(key) && value === true) next[key] = true
        }
      }
      setCheckedChecklist(next)
    } catch {
      setCheckedChecklist({})
    }
  }, [checklistStorageKey, checklistItems])

  const loadPlan = useCallback(async () => {
    if (!activePlanId) {
      setLoading(false)
      setPlan(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      if (savedTripId && !user) {
        navigate('/signin', { state: { from: `/selected?trip=${encodeURIComponent(savedTripId)}` } })
        setPlan(null)
        return
      }
      const response = savedTripId
        ? await fetchSavedTrip(savedTripId).then((trip) => ({ data: { ...trip.itinerary, savedTripId: trip.id } }))
        : await fetchPlanById(activePlanId)
      setPlan(response.data)
      setActiveScheduleDay('all')
      const currentSelected = getSelectedPlanId()
      setIsChosen(Boolean(savedTripId) || currentSelected === response.data.id || currentSelected === response.data.planId)
    } catch (err) {
      setError(err?.message || `Failed to load itinerary details for ID "${activePlanId}".`)
      setPlan(null)
    } finally {
      setLoading(false)
    }
  }, [activePlanId, navigate, savedTripId, user])

  useEffect(() => {
    loadPlan()
  }, [loadPlan])

  useEffect(() => {
    if (!banner) return undefined
    const timer = window.setTimeout(() => setBanner(null), 5000)
    return () => window.clearTimeout(timer)
  }, [banner])

  useEffect(() => {
    if (!editToast || editToast.kind === 'updating') return undefined
    const timer = window.setTimeout(() => setEditToast(null), 4000)
    return () => window.clearTimeout(timer)
  }, [editToast])

  useEffect(
    () => () => {
      if (editTimerRef.current) window.clearTimeout(editTimerRef.current)
    },
    []
  )

  const handleToggleChoose = async () => {
    if (!plan) return
    setActionMessage('')
    if (!user) {
      setSelectedPlan(plan)
      setIsChosen(true)
      setCelebrate(true)
      setBanner({ kind: 'saved', localOnly: true })
      return
    }
    try {
      const selection = await selectPlan(plan)
      setPlan((current) => ({ ...current, savedTripId: selection.trip.id }))
      setIsChosen(true)
      setCelebrate(true)
      setBanner({ kind: 'saved' })
    } catch (err) {
      setActionMessage(err?.message || 'Could not save this trip.')
    }
  }

  const handleRemove = () => {
    if (!plan) return
    try {
      clearSelectedPlan()
      setIsChosen(false)
      setActionMessage('')
      setBanner({ kind: 'removed' })
    } catch {
      setActionMessage('Could not remove this plan from your trip.')
    }
  }

  const handleCopySummary = async () => {
    if (!plan) return
    const statusLabel = STATUS_LABEL[plan.status] || plan.status
    const destinationLabel = getDestinationLabel(plan.destinationId, plan.destination, plan.title) ||
      plan.destination ||
      ''
    const amount = (value, empty = 'Not included') => value == null ? empty : fmtMoney(value)
    const missing = estimate.missingCombined
      .map((item) => formatMissingCostItem(item, resolveName))
      .filter(Boolean)
    const doneCount = checklistItems.filter((item) => checkedChecklist[item.key]).length
    const summaryText = [
      `Your trip to ${destinationLabel || 'your destination'}`,
      `Plan: ${plan.title}`,
      `Status: ${statusLabel}`,
      `Duration: ${dayCount} ${dayCount === 1 ? 'day' : 'days'}`,
      estimate.travelers != null
        ? `Travelers: ${estimate.travelers} ${estimate.travelers === 1 ? 'person' : 'people'}`
        : null,
      '',
      `Estimated trip total: ${estimate.estimatedTotal == null ? 'Estimate unavailable' : fmtMoney(estimate.estimatedTotal)}`,
      'Planning estimate, not a confirmed price. Some costs may be excluded.',
      '',
      'Cost breakdown:',
      `- Stay: ${amount(estimate.stay)}`,
      `- Transport: ${amount(estimate.transport)}`,
      `- ${estimate.diningLabel}: ${amount(estimate.dining)}`,
      `- ${estimate.knownLabel}: ${amount(estimate.knownTotal, 'Not available')}`,
      estimate.budget != null ? `- Your budget: ${fmtMoney(estimate.budget)}` : null,
      '',
      missing.length > 0 ? `Not included in the estimate: ${missing.join(', ')}.` : null,
      missing.length > 0 ? 'Missing data is not the same as free.' : null,
      '',
      `Before you go checklist (${doneCount} of ${checklistItems.length} checked):`,
      ...checklistItems.map(
        (item) => `- [${checkedChecklist[item.key] ? 'x' : ' '}] ${item.title}`
      ),
      '',
      'Your checkmarks track personal preparation only. They do not verify prices, schedules, or travel routes.',
    ].filter((line) => line !== null).join('\n')

    try {
      await navigator.clipboard.writeText(summaryText)
      setCopyError('')
      setCopyFeedback(true)
      setTimeout(() => setCopyFeedback(false), 2500)
    } catch {
      setCopyFeedback(false)
      setCopyError('Could not copy the summary. Check clipboard permissions and try again.')
    }
  }

  const handleViewChecklist = () => {
    const node = checklistRef.current
    if (!node) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    node.scrollIntoView?.({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  }

  const handleToggleChecklist = (itemKey) => {
    setCheckedChecklist((previous) => {
      const next = { ...previous }
      if (next[itemKey]) delete next[itemKey]
      else next[itemKey] = true
      if (checklistStorageKey) {
        try {
          window.localStorage.setItem(checklistStorageKey, JSON.stringify(next))
        } catch {
          // Keep the in-memory state even when storage is unavailable.
        }
      }
      return next
    })
  }

  const handleEditStop = (dayNumber, activity) => {
    if (!plan || !activity) return
    const currentName = resolveName?.(activity.placeId) || activity.name || 'Unknown place'
    const alternatives = getValidAlternatives(
      plan,
      dayNumber,
      activity.activityId,
      getPlaceCatalog()
    )
    setEditError('')
    setEditStatus('idle')
    setEditTarget({
      dayNumber,
      activityId: activity.activityId,
      activity,
      currentName,
      alternatives,
    })
  }

  const handleCloseEdit = () => {
    if (editStatus === 'updating') return
    setEditTarget(null)
    setEditError('')
    setEditStatus('idle')
  }

  const handleConfirmStopChange = (alternative) => {
    if (!plan || !editTarget || !alternative) return
    const { dayNumber, activityId } = editTarget
    setEditStatus('updating')
    setEditError('')
    setEditToast({ kind: 'updating' })
    if (editTimerRef.current) window.clearTimeout(editTimerRef.current)
    editTimerRef.current = window.setTimeout(() => {
      const result = applyStopChange(plan, dayNumber, activityId, alternative)
      if (!result.ok) {
        setEditStatus('error')
        setEditError(result.error)
        setEditToast({ kind: 'error', message: result.error })
        return
      }
      const updatedPlan = { ...result.plan, savedTripId: plan.savedTripId }
      setPlan(updatedPlan)
      setPlacesById((previous) => {
        const next = new Map(previous)
        next.set(String(alternative.id), alternative)
        return next
      })
      if (isChosen) {
        if (user) {
          selectPlan(updatedPlan).catch((err) => {
            setActionMessage(err?.message || 'The edit was applied but could not be saved.')
          })
        } else {
          setSelectedPlan(updatedPlan)
        }
      }
      setEditTarget(null)
      setEditStatus('idle')
      setEditError('')
      setEditToast({ kind: 'updated', name: alternative.name })
    }, 450)
  }

  if (!activePlanId && !loading) {
    let hasCachedResults = false
    try {
      hasCachedResults = Boolean(window.sessionStorage?.getItem('tpva-ai-plan'))
    } catch {
      hasCachedResults = false
    }
    return (
      <div className="selected-page-container">
        <TripProgress currentStep={3} />
        <div className="empty-chosen-view">
          <span className="empty-chosen-icon" aria-hidden="true">
            <Icon name="compass" size={34} />
          </span>
          <p className="page-eyebrow">Step 3 of 3 · Review</p>
          <h1>Your next trip starts here</h1>
          <p className="muted">
            {hasCachedResults
              ? 'Choose an itinerary from your results to see its day-by-day schedule, review the estimated costs, and make it your own.'
              : 'Plan your dates, budget, and travel style to generate itineraries you can review, edit, and save.'}
          </p>
          <div className="empty-actions">
            {hasCachedResults ? (
              <>
                <Link to="/results" className="btn btn-primary">
                  Compare your plans
                  <Icon name="arrowRight" size={16} />
                </Link>
                <Link to="/" className="btn btn-outline">
                  Create a new trip
                </Link>
              </>
            ) : (
              <Link to="/" className="btn btn-primary">
                Plan a new trip
                <Icon name="arrowRight" size={16} />
              </Link>
            )}
          </div>
        </div>
      </div>
    )
  }

  const statusLabel = plan ? STATUS_LABEL[plan.status] || plan.status : null
  const destinationLabel = plan
    ? getDestinationLabel(plan.destinationId, plan.destination, plan.title) ||
      plan.destination ||
      ''
    : ''
  const planImage = plan
    ? plan.image ||
      getDestinationImage(plan.destinationId, plan.destination, plan.title) ||
      null
    : null
  const dayCount = plan?.days?.length || 0
  const activityCount =
    plan?.days?.reduce((count, day) => count + (day.activities?.length || 0), 0) || 0
  const editableStopCount =
    plan?.days?.reduce(
      (count, day) =>
        count +
        (day.activities || []).filter(
          (activity) =>
            activity.type === 'sightseeing' ||
            activity.type === 'attraction' ||
            activity.type === 'dining' ||
            activity.type === 'meal'
        ).length,
      0
    ) || 0
  const scheduleDays = orderScheduleDays(plan?.days)
  const scheduleDayNumbers = scheduleDays.map((_, index) => index + 1)
  const selectedScheduleDay = scheduleDayNumbers.includes(activeScheduleDay)
    ? activeScheduleDay
    : 'all'
  const segmentCount = scheduleDays.length + 1
  const segmentIndex = selectedScheduleDay === 'all'
    ? 0
    : scheduleDayNumbers.indexOf(selectedScheduleDay) + 1
  const resolveName = plan ? createNameResolver(plan, placesById) : null
  const activitySources = plan ? collectActivitySources(plan) : new Map()
  const checklistDone = checklistItems.filter((item) => checkedChecklist[item.key]).length

  return (
    <div className={`selected-page-container${isChosen ? ' is-chosen' : ''}`}>
      <Fireworks active={celebrate} onDone={() => setCelebrate(false)} />
      <nav className="page-back no-print" aria-label="Breadcrumb">
        <Link to="/results" className="back-link">
          <Icon name="arrowLeft" size={16} />
          Back to all plans
        </Link>
      </nav>

      <header className="selected-page-intro">
        <div className="results-intro-copy">
          <p className="page-eyebrow">Step 3 of 3 · Review</p>
          <h1>Your trip to {destinationLabel || 'your destination'}</h1>
          <p className="selected-lead muted">
            {plan?.title || 'Loading your itinerary details…'}
          </p>
          {plan && (
            <div className="intro-badges">
              <span className={`badge badge-${plan.status}`}>{statusLabel}</span>
              <span className="muted small">
                <Icon name="calendar" size={15} />
                {dayCount} {dayCount === 1 ? 'day' : 'days'}
              </span>
              <span className="muted small">
                <Icon name="landmark" size={15} />
                {activityCount} activities
              </span>
            </div>
          )}
        </div>

        {plan && (
          <div className="intro-actions selected-actions no-print">
            <button
              type="button"
              className="action-chip"
              onClick={() => window.print()}
              title="Print or save as PDF"
            >
              <span className="action-chip-icon" aria-hidden="true">
                <Icon name="printer" size={15} />
              </span>
              <span className="action-chip-text">
                <strong>Print</strong>
                <small>Save the plan as PDF</small>
              </span>
            </button>
            <button
              type="button"
              className="action-chip"
              onClick={handleCopySummary}
              title="Copy a text summary to your clipboard"
            >
              <span className="action-chip-icon" aria-hidden="true">
                <Icon name={copyFeedback ? 'check' : 'copy'} size={15} />
              </span>
              <span className="action-chip-text">
                <strong>{copyFeedback ? 'Copied' : 'Copy summary'}</strong>
                <small>{copyFeedback ? 'On your clipboard' : 'Share the plan as text'}</small>
              </span>
            </button>
          </div>
        )}

        {(copyError || copyFeedback) && (
          <span
            className={`copy-feedback ${copyError ? 'copy-feedback--error' : ''}`}
            role="status"
            aria-live="polite"
          >
            {copyError || 'Summary copied with the estimate and checklist status.'}
          </span>
        )}
        {actionMessage && (
          <span className="action-feedback" role="status" aria-live="polite">
            {actionMessage}
          </span>
        )}
      </header>

      <TripProgress currentStep={3} />

      {loading && (
        <Loading message="Loading daily activity timeline, attractions, and dining..." />
      )}

      {!loading && error && (
        <div className="selected-error-wrapper">
          <ErrorMessage
            title="Itinerary not available"
            message={error}
            actionLink="/results"
            actionText="Back to results"
            onRetry={loadPlan}
          />
        </div>
      )}

      {!loading && !error && plan && (
        <>
          {banner && (
            <div className="trip-toast">
              <div className={`chosen-header-banner${banner.kind === 'removed' ? ' is-removed' : ''}`} role="status">
                <div className="chosen-header-content">
                  <span className="chosen-badge-icon" aria-hidden="true">
                    <Icon name={banner.kind === 'removed' ? 'info' : 'star'} size={22} />
                  </span>
                  <div>
                    <strong className="chosen-header-title">
                      {banner.kind === 'removed' ? 'Removed from your trip' : 'Saved to your trip'}
                    </strong>
                    <p className="chosen-header-sub">
                      {banner.kind === 'removed'
                        ? 'You can add this plan again from the trip card.'
                        : banner.localOnly
                          ? 'Saved in this browser. Sign in when you want to sync to My Trips.'
                          : 'Saved to My Trips. Compare other plans whenever you like.'}
                    </p>
                  </div>
                </div>
                <div className="chosen-header-actions">
                  {banner.localOnly && isGoogleConfigured && (
                    <Link
                      to="/signin"
                      state={{ from: `/selected?id=${encodeURIComponent(plan?.planId || plan?.id || '')}` }}
                      className="btn btn-primary"
                    >
                      Sign in
                    </Link>
                  )}
                  <Link to="/results" className="btn btn-outline chosen-compare-link">
                    <Icon name="swap" size={16} />
                    Compare plans
                  </Link>
                </div>
              </div>
            </div>
          )}

          <EstimatedTripTotal estimate={estimate} dayCount={dayCount} resolveName={resolveName} />

          {checklistItems.length > 0 && (
            <section className="checklist-prompt selected-wide" aria-labelledby="checklist-prompt-title">
              <div className="checklist-prompt-icon" aria-hidden="true">
                <Icon name="check" size={19} />
              </div>
              <div className="checklist-prompt-copy">
                <h2 id="checklist-prompt-title">Before you go, use your checklist</h2>
                <p>
                  Confirm prices, opening hours, and travel times. Tick each item after checking it.
                </p>
              </div>
              <div className="checklist-prompt-meta">
                <span>{checklistDone} of {checklistItems.length} checked</span>
                <button type="button" className="btn btn-primary" onClick={handleViewChecklist}>
                  View checklist
                </button>
              </div>
            </section>
          )}

          <section
            className="selected-itinerary selected-wide"
            aria-label="Trip overview and daily schedule"
          >
            <div className="selected">
              <aside className="selected-left" aria-label="Trip overview">
                <div className="img-wrap selected-img-wrap">
                  {planImage && (
                    <img
                      src={planImage}
                      alt={`${destinationLabel} landscape`}
                      decoding="async"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  )}
                  {isChosen && (
                    <div className="card-selected-ribbon">
                      <Icon name="check" size={14} />
                      Chosen
                    </div>
                  )}
                </div>

                <div className="selected-summary-body">
                  <div className="selected-summary-head">
                    <span className={`badge badge-${plan.status}`}>{statusLabel}</span>
                    <h2 className="selected-title">{plan.title}</h2>
                  </div>

                  <div className="selected-quick-facts" aria-label="Trip overview">
                    <div>
                      <Icon name="calendar" size={16} />
                      <span>Duration</span>
                      <strong>{dayCount} {dayCount === 1 ? 'day' : 'days'}</strong>
                    </div>
                    <div>
                      <Icon name="landmark" size={16} />
                      <span>Activities</span>
                      <strong>{activityCount}</strong>
                    </div>
                    <div>
                      <Icon name="wallet" size={16} />
                      <span>Estimated</span>
                      <strong>
                        {estimate.estimatedTotal == null
                          ? 'Unavailable'
                          : fmtMoney(estimate.estimatedTotal)}
                      </strong>
                    </div>
                  </div>

                  {plan.fit?.length > 0 && (
                    <div className="reasons-block">
                      <h3 className="reasons-title">
                        <Icon name="sparkle" size={16} />
                        Why this plan fits
                      </h3>
                      <ul className="reasons-list">
                        {plan.fit.map((reason) => (
                          <li key={reason}>
                            <Icon name="check" size={15} />
                            {reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {plan.status === 'INFEASIBLE' && (
                    <div className="plan-alert-box alert-infeasible">
                      <Icon name="alert" size={16} />
                      <span>
                        <strong>Cannot be chosen:</strong> {plan.failReason || 'Breaks a trip constraint.'}
                        <span className="small-tip">
                          Adjust your budget or constraints and create a new plan.
                        </span>
                      </span>
                    </div>
                  )}

                  {plan.status === 'UNVERIFIED' && (
                    <div className="plan-alert-box alert-unverified">
                      <Icon name="info" size={16} />
                      <span>
                        <strong>Not fully verified.</strong> Missing amounts stay unverified and are
                        not counted as zero.
                      </span>
                    </div>
                  )}

                  <div className="selected-summary-actions no-print">
                    <button
                      type="button"
                      className={`btn ${isChosen ? 'btn-outline btn-remove' : 'btn-primary btn-choose'}`}
                      disabled={!isChosen && plan.status === 'INFEASIBLE'}
                      onClick={isChosen ? handleRemove : handleToggleChoose}
                    >
                      <Icon name={isChosen ? 'trash' : 'check'} size={16} />
                      {isChosen ? 'Remove from your trip' : 'Save to your trip'}
                    </button>

                    {isChosen && (
                      <p className="chosen-notice">
                        <Icon name="check" size={15} />
                        Saved as your trip. Find it again under Selected.
                      </p>
                    )}

                    <Link to="/results" className="back-link selected-summary-back">
                      <Icon name="arrowLeft" size={14} />
                      Back to all plans
                    </Link>
                  </div>
                </div>
              </aside>

              <div className="selected-right">
                <div
                  className="selected-right-scroll"
                  role="region"
                  aria-label="Daily schedule"
                >
                  <div className="schedule-header">
                    <div>
                      <h3 className="itinerary-heading">Daily schedule</h3>
                      <p className="muted small">
                        {editMode
                          ? 'Pick “Change stop” on a card to swap it for a valid alternative.'
                          : 'Choose a day to focus on its stops.'}
                      </p>
                    </div>
                    <div className="schedule-header-actions no-print">
                      <button
                        type="button"
                        className={`action-chip action-chip--primary edit-mode-btn${editMode ? ' is-active' : ''}`}
                        aria-pressed={editMode}
                        title={
                          editMode
                            ? 'Finish editing and keep your changes'
                            : 'Swap any stop for a valid alternative'
                        }
                        onClick={() => {
                          setEditTarget(null)
                          setEditError('')
                          setEditStatus('idle')
                          setEditMode((value) => !value)
                        }}
                      >
                        <span className="action-chip-icon" aria-hidden="true">
                          <Icon name={editMode ? 'check' : 'edit'} size={16} />
                        </span>
                        <span className="action-chip-text">
                          <strong>{editMode ? 'Done editing' : 'Edit stops'}</strong>
                          <small>
                            {editMode
                              ? 'Tap “Change stop” on a card'
                              : `${editableStopCount} ${editableStopCount === 1 ? 'stop' : 'stops'} you can change`}
                          </small>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="action-chip print-schedule-btn"
                        onClick={() => window.print()}
                        title="Print or save the daily schedule as PDF"
                      >
                        <span className="action-chip-icon" aria-hidden="true">
                          <Icon name="printer" size={15} />
                        </span>
                        <span className="action-chip-text">
                          <strong>Print</strong>
                          <small>Save schedule as PDF</small>
                        </span>
                      </button>
                    </div>
                  </div>

                  {dayCount > 1 && (
                    <div className="schedule-day-sticky">
                      <div
                        className="schedule-day-controls"
                        role="group"
                        aria-label="Filter schedule by day"
                        style={{
                          '--segment-count': segmentCount,
                          '--segment-index': segmentIndex,
                        }}
                      >
                        <span className="schedule-day-thumb" aria-hidden="true" />
                        <button
                          type="button"
                          className="schedule-day-button"
                          data-testid="schedule-day-all"
                          aria-pressed={selectedScheduleDay === 'all'}
                          onClick={() => setActiveScheduleDay('all')}
                        >
                          All days
                        </button>
                        {scheduleDays.map((day, index) => {
                          const dayNumber = scheduleDayNumbers[index]
                          const stopCount = day.activities?.length || 0
                          return (
                            <button
                              type="button"
                              className="schedule-day-button"
                              key={dayNumber}
                              data-testid={`schedule-day-${dayNumber}`}
                              aria-label={`Show day ${dayNumber}, ${stopCount} ${stopCount === 1 ? 'stop' : 'stops'}`}
                              aria-pressed={selectedScheduleDay === dayNumber}
                              onClick={() => setActiveScheduleDay(dayNumber)}
                            >
                              Day {dayNumber}
                              <span>{stopCount}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {placeCatalogError && <p role="status" className="muted small">{placeCatalogError}</p>}
                  <ItineraryTimeline
                    days={
                      selectedScheduleDay === 'all'
                        ? scheduleDays
                        : scheduleDays.filter(
                            (_, index) => scheduleDayNumbers[index] === selectedScheduleDay
                          )
                    }
                    placesById={placesById}
                    activitySources={activitySources}
                    editMode={editMode}
                    onEditStop={handleEditStop}
                  />
                </div>
              </div>
            </div>
          </section>

          <EstimateDetails plan={plan} estimate={estimate} resolveName={resolveName} />
          <TripServices plan={plan} />
          <RouteOverview plan={plan} placesById={placesById} />

          {checklistItems.length > 0 && (
            <TripChecklist
              items={checklistItems}
              checked={checkedChecklist}
              onToggle={handleToggleChecklist}
              sectionRef={checklistRef}
            />
          )}

          {editToast && (
            <div className="edit-toast" role="status" aria-live="polite">
              <span className={`edit-toast-icon is-${editToast.kind}`} aria-hidden="true">
                <Icon
                  name={
                    editToast.kind === 'error'
                      ? 'alert'
                      : editToast.kind === 'updated'
                        ? 'check'
                        : 'refresh'
                  }
                  size={18}
                  className={editToast.kind === 'updating' ? 'spin' : ''}
                />
              </span>
              <span className="edit-toast-text">
                {editToast.kind === 'updating' && 'Updating your itinerary…'}
                {editToast.kind === 'updated' && `Changed this stop to ${editToast.name}.`}
                {editToast.kind === 'error' &&
                  `Could not change the stop. ${editToast.message || ''}`.trim()}
              </span>
            </div>
          )}

          {editTarget && (
            <StopAlternativesDialog
              dayNumber={editTarget.dayNumber}
              activity={editTarget.activity}
              currentName={editTarget.currentName}
              alternatives={editTarget.alternatives}
              status={editStatus}
              error={editError}
              onConfirm={handleConfirmStopChange}
              onClose={handleCloseEdit}
            />
          )}
        </>
      )}
    </div>
  )
}
