import {
  formatReason,
  groupEvaluationReasons,
  safeSourceUrl,
} from '../../services/api.js'
import { fmtMoney } from '../../services/mockData.js'
import { formatMissingCostItem } from '../../services/tripEstimate.js'
import EvaluationChecks from './EvaluationChecks.jsx'
import Icon from '../common/Icon.jsx'

function DiningEstimateCard({ item }) {
  const sourceUrl = safeSourceUrl(item?.sourceUrl)
  return (
    <article className="estimate-card">
      <div className="estimate-card-head">
        <div>
          <h4>{item?.name || 'Dining stop'}</h4>
          <span className="estimate-card-label">Estimated</span>
        </div>
        <strong>{fmtMoney(item?.amountVnd)}</strong>
      </div>
      {item?.perPersonVnd != null && (
        <p className="estimate-card-meta">
          {fmtMoney(item.perPersonVnd)} per person
          {item?.travelers != null ? ` · ${item.travelers} travelers` : ''}
        </p>
      )}
      {sourceUrl && (
        <a
          className="estimate-source"
          href={sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
        >
          Open source
          <Icon name="external" size={12} />
        </a>
      )}
    </article>
  )
}

export default function EstimateDetails({ plan, estimate, resolveName }) {
  const missing = (estimate?.missingCombined || [])
    .map((item) => formatMissingCostItem(item, resolveName))
    .filter(Boolean)
  const verificationGroups = plan?.evaluation
    ? groupEvaluationReasons(plan.evaluation, plan.ranking, plan.planId || plan.id)
    : []
  const diningItems = estimate?.diningItems || []

  return (
    <section className="estimate-details selected-wide" aria-labelledby="estimate-details-title">
      <div className="selected-section-head">
        <div>
          <p className="page-eyebrow">Costs in context</p>
          <h2 id="estimate-details-title">Understand your estimate</h2>
          <p className="muted">
            Known costs and clearly labelled estimates are added together. Missing costs stay outside
            the total instead of becoming zero.
          </p>
        </div>
      </div>

      <div className="estimate-details-grid">
        <div className="estimate-dining">
          <div className="estimate-subhead">
            <h3>Dining estimates</h3>
            <p className="muted small">Only meals with an available estimate are listed here.</p>
          </div>

          {diningItems.length > 0 ? (
            <div className="estimate-cards">
              {diningItems.map((item, index) => (
                <DiningEstimateCard
                  key={`${item.activityId || item.name || 'dining'}-${index}`}
                  item={item}
                />
              ))}
            </div>
          ) : (
            <p className="estimate-empty">No itemized dining estimates are available for this plan.</p>
          )}

          {estimate?.assumptions?.length > 0 && (
            <details className="estimate-assumptions">
              <summary>
                How this estimate is built
                <Icon name="chevronDown" size={15} className="summary-chevron" />
              </summary>
              <ul>
                {estimate.assumptions.map((note) => <li key={note}>{note}</li>)}
              </ul>
            </details>
          )}
        </div>

        <aside className="estimate-good-to-know" aria-labelledby="good-to-know-title">
          <h3 id="good-to-know-title">Good to know</h3>

          {missing.length > 0 ? (
            <p className="estimate-warning">
              <Icon name="alert" size={15} />
              <span>
                Not included in the estimate: {missing.join(', ')}. Missing data is not the same as
                free.
              </span>
            </p>
          ) : (
            <p className="estimate-ok">
              <Icon name="check" size={15} />
              No missing cost categories are flagged for this plan.
            </p>
          )}

          {estimate?.budget == null && (
            <p className="estimate-note">
              <Icon name="info" size={15} />
              No budget is available, so budget fit stays unverified.
            </p>
          )}

          {plan?.status === 'UNVERIFIED' && (
            <p className="estimate-note">
              <Icon name="info" size={15} />
              Some prices or travel times are unverified. Confirm them with the provider before
              booking.
            </p>
          )}

          <div className="estimate-checks">
            <h4>Verification checks</h4>
            {plan?.evaluation ? (
              <>
                <EvaluationChecks evaluation={plan.evaluation} compact />
                <p className="muted small">
                  These statuses come from the plan’s verification data and do not change when you
                  tick a checklist item.
                </p>
                {verificationGroups.length > 0 && (
                  <details className="estimate-verification-details">
                    <summary>
                      What needs checking
                      <Icon name="chevronDown" size={15} className="summary-chevron" />
                    </summary>
                    {verificationGroups.map((group) => (
                      <div key={group.key} className="estimate-verification-group">
                        <h5>{group.label}</h5>
                        <ul>
                          {group.reasons.map((reason, index) => (
                            <li key={`${group.key}-${index}`}>
                              <Icon name="alert" size={14} />
                              {formatReason(reason, { resolveName })}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </details>
                )}
              </>
            ) : (
              <p className="muted small">No verification data is available yet.</p>
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}
