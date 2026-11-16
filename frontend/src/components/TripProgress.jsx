const TRIP_STEPS = [
  {
    title: 'Trip details',
    description: 'Add your travel preferences',
  },
  {
    title: 'Build itinerary',
    description: 'Choose activities and routes',
  },
  {
    title: 'Review & save',
    description: 'Review and save your trip',
  },
]

export function TripProgress({ currentStep }) {
  const progressPercentage = (currentStep / TRIP_STEPS.length) * 100
  const currentStepData = TRIP_STEPS[currentStep - 1]

  return (
    <section className="trip-progress" aria-label="Trip planning progress">
      <div className="progress-summary">
        <div>
          <span>YOUR PROGRESS</span>

          <strong>
            Step {currentStep} of {TRIP_STEPS.length}
          </strong>
        </div>

        <small>
          Current step: <b>{currentStepData.title}</b>
        </small>
      </div>

      <div
        className="progress-track"
        role="progressbar"
        aria-label={`Step ${currentStep} of ${TRIP_STEPS.length}: ${currentStepData.title}`}
        aria-valuemin={1}
        aria-valuemax={TRIP_STEPS.length}
        aria-valuenow={currentStep}
      >
        <span className="progress-fill" style={{ width: `${progressPercentage}%` }} />
      </div>

      <ol className="progress-steps">
        {TRIP_STEPS.map((step, index) => {
          const stepNumber = index + 1
          const isCurrent = stepNumber === currentStep
          const isComplete = stepNumber < currentStep

          let status = 'Up next'

          if (isComplete) {
            status = 'Completed'
          }

          if (isCurrent) {
            status = 'Current step'
          }

          return (
            <li
              key={step.title}
              className={[isComplete ? 'complete' : '', isCurrent ? 'current' : '']
                .filter(Boolean)
                .join(' ')}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <span>{stepNumber}</span>

              <div>
                <small>{status}</small>
                <strong>{step.title}</strong>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

export default TripProgress
