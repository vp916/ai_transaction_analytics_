import { useEffect, useState } from 'react'
import { api, CATEGORIES, rupees } from '../api'
import type { Transaction } from '../types'

type ListResponse = { items: Transaction[]; total: number; page: number; pages: number }

export default function Transactions() {
  const [data, setData] = useState<ListResponse | null>(null)
  const [page, setPage] = useState(1)
  const [onlyFlagged, setOnlyFlagged] = useState(false)
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')

  // new transaction form
  const [description, setDescription] = useState('')
  const [merchant, setMerchant] = useState('')
  const [amount, setAmount] = useState('')
  const [message, setMessage] = useState('')

  function load() {
    const params = new URLSearchParams({ page: String(page), limit: '20' })
    if (onlyFlagged) params.set('anomaly', 'true')
    if (category) params.set('category', category)
    if (search) params.set('search', search)
    api<ListResponse>(`/transactions?${params}`).then(setData)
  }

  // reload whenever a filter changes
  useEffect(load, [page, onlyFlagged, category, search])

  async function addTransaction(e: React.FormEvent) {
    e.preventDefault()
    try {
      // no category is sent: the ML service picks it
      const t = await api<Transaction>('/transactions', 'POST', { description, merchant, amount: Number(amount) })
      setMessage(`Added. ML category: ${t.category} (${Math.round((t.categoryConfidence ?? 0) * 100)}% sure)` +
        (t.isAnomaly ? `. Flagged as unusual: ${t.anomalyReasons.join(', ')}` : ''))
      setDescription(''); setMerchant(''); setAmount('')
      load()
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  async function changeCategory(t: Transaction, newCategory: string) {
    await api(`/transactions/${t._id}`, 'PATCH', { category: newCategory })
    load()
  }

  async function remove(t: Transaction) {
    await api(`/transactions/${t._id}`, 'DELETE')
    load()
  }

  return (
    <>
      <h1>Transactions</h1>

      <form className="card row wrap" onSubmit={addTransaction}>
        <input placeholder="Bank description e.g. UPI/123/SWIGGY/swiggy@ybl" value={description}
          onChange={(e) => setDescription(e.target.value)} required style={{ flex: 2 }} />
        <input placeholder="Merchant" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
        <input placeholder="Amount ₹" type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        <button type="submit">Add</button>
        {message && <p className="muted full">{message}</p>}
      </form>

      <div className="row wrap filters">
        <input placeholder="Search merchant…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
        <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1) }}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <label><input type="checkbox" checked={onlyFlagged} onChange={(e) => { setOnlyFlagged(e.target.checked); setPage(1) }} /> Only flagged</label>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr><th>Date</th><th>Merchant</th><th>Category</th><th className="right">Amount</th><th>Risk</th><th></th></tr>
          </thead>
          <tbody>
            {data?.items.map((t) => (
              <tr key={t._id} className={t.isAnomaly ? 'flagged' : ''}>
                <td>{new Date(t.date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                <td>
                  {t.merchant}
                  <div className="muted small">{t.description}</div>
                </td>
                <td>
                  <select value={t.category} onChange={(e) => changeCategory(t, e.target.value)}>
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <div className="muted small">
                    {t.categorySource === 'ml' ? `ML ${Math.round((t.categoryConfidence ?? 0) * 100)}%` : 'set by you'}
                  </div>
                </td>
                <td className="right">{rupees(t.amount)}</td>
                <td>
                  {t.isAnomaly ? <span className="badge">unusual</span> : <span className="muted small">{Math.round(t.anomalyScore * 100)}</span>}
                  {t.isAnomaly && <div className="muted small">{t.anomalyReasons.join(' · ')}</div>}
                </td>
                <td><button className="link" onClick={() => remove(t)}>delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>

        {data && (
          <div className="row space">
            <span className="muted">{data.total} transactions</span>
            <div className="row">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)}>‹ Prev</button>
              <span>Page {data.page} of {Math.max(data.pages, 1)}</span>
              <button disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next ›</button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
