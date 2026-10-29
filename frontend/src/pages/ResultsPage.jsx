import { MOCK_PLANS } from '../services/mockData.js'
import PlanComparison from '../components/comparison/PlanComparison.jsx'

export default function ResultsPage() {
  const plans = MOCK_PLANS.slice(0, 3)

  return (
    <section className="results-page">
      <h1 className="results-title">Related results</h1>
      <PlanComparison plans={plans} />
    </section>
  )
}