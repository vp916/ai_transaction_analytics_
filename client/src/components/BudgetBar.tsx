import { rupees } from '../api'
import type { Budget } from '../types'

// Progress bar: green under 80%, orange 80-100%, red when over budget.
export default function BudgetBar({ budget }: { budget: Budget }) {
  const pct = Math.min(budget.percentUsed, 100)
  const color = budget.percentUsed > 100 ? 'var(--red)' : budget.percentUsed >= 80 ? 'var(--orange)' : 'var(--green)'
  return (
    <div className="budget">
      <div className="row space">
        <strong>{budget.category}</strong>
        <span>{rupees(budget.spent)} / {rupees(budget.monthlyLimit)}</span>
      </div>
      <div className="bar"><div style={{ width: `${pct}%`, background: color }} /></div>
      <div className="muted small">
        {budget.remaining >= 0 ? `${rupees(budget.remaining)} left` : `${rupees(-budget.remaining)} over budget`}
      </div>
    </div>
  )
}
