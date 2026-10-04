import { useEffect, useState } from 'react'
import { api, CATEGORIES, currentMonth } from '../api'
import type { Budget } from '../types'
import BudgetBar from '../components/BudgetBar'

export default function Budgets() {
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [category, setCategory] = useState(CATEGORIES[0])
  const [limit, setLimit] = useState('')

  function load() {
    api<{ budgets: Budget[] }>(`/budgets?month=${currentMonth()}`).then((r) => setBudgets(r.budgets))
  }
  useEffect(load, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    await api('/budgets', 'PUT', { category, monthlyLimit: Number(limit) }) // creates or updates
    setLimit('')
    load()
  }

  async function remove(b: Budget) {
    await api(`/budgets/${b._id}`, 'DELETE')
    load()
  }

  return (
    <>
      <h1>Budgets for {currentMonth()}</h1>

      <form className="card row wrap" onSubmit={save}>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <input type="number" min="1" placeholder="Monthly limit ₹" value={limit} onChange={(e) => setLimit(e.target.value)} required />
        <button type="submit">Save budget</button>
      </form>

      <div className="card">
        {budgets.length === 0 && <p className="muted">No budgets yet.</p>}
        {budgets.map((b) => (
          <div key={b._id} className="row">
            <div style={{ flex: 1 }}><BudgetBar budget={b} /></div>
            <button className="link" onClick={() => remove(b)}>remove</button>
          </div>
        ))}
      </div>
    </>
  )
}
