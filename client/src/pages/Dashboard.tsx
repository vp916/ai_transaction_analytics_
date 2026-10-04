import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, currentMonth, rupees } from '../api'
import type { Budget, Forecast, MonthTotal, Summary } from '../types'
import StatCard from '../components/StatCard'
import BudgetBar from '../components/BudgetBar'

const COLORS = ['#3b6ea5', '#c06c39', '#4f9d69', '#8e5ea2', '#d4a72c', '#4aa3a2', '#c4515c', '#7a7a7a', '#5b8def', '#a0785a']

export default function Dashboard() {
  const [month, setMonth] = useState(currentMonth())
  const [summary, setSummary] = useState<Summary | null>(null)
  const [monthly, setMonthly] = useState<MonthTotal[]>([])
  const [forecast, setForecast] = useState<Forecast | null>(null)
  const [budgets, setBudgets] = useState<Budget[]>([])

  // load everything the dashboard needs; runs again when the month changes
  useEffect(() => {
    api<Summary>(`/analytics/summary?month=${month}`).then(setSummary)
    api<{ budgets: Budget[] }>(`/budgets?month=${month}`).then((r) => setBudgets(r.budgets))
  }, [month])

  useEffect(() => {
    api<MonthTotal[]>('/analytics/monthly?months=12').then(setMonthly)
    api<Forecast>('/analytics/forecast').then(setForecast).catch(() => setForecast(null))
  }, [])

  if (!summary) return <p>Loading…</p>

  const change = summary.previousMonthTotal
    ? Math.round((100 * (summary.totalSpent - summary.previousMonthTotal)) / summary.previousMonthTotal)
    : 0

  return (
    <>
      <div className="row space">
        <h1>Dashboard</h1>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>

      <div className="grid4">
        <StatCard label={`Spent in ${month}`} value={rupees(summary.totalSpent)} note={`${summary.transactionCount} transactions`} />
        <StatCard label="Previous month" value={rupees(summary.previousMonthTotal)} note={`${change >= 0 ? '+' : ''}${change}% this month`} />
        <StatCard
          label={`Forecast for ${forecast?.month ?? ''}`}
          value={forecast?.forecast ? rupees(forecast.forecast) : '—'}
          note={forecast?.model ? `${forecast.model} · spent so far ${rupees(forecast.spentSoFar ?? 0)}` : 'not enough history'}
        />
        <StatCard label="Flagged as unusual" value={String(summary.anomalyCount)} note="Isolation Forest" />
      </div>

      <div className="grid2">
        <div className="card">
          <h3>Monthly spending (last 12 months)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v) => rupees(Number(v))} />
              <Bar dataKey="total" fill="#3b6ea5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3>Spending by category</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={summary.byCategory} dataKey="total" nameKey="category" outerRadius={95}>
                {summary.byCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => rupees(Number(v))} />
              <Legend layout="vertical" align="right" verticalAlign="middle" />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <h3>Top merchants</h3>
          <table>
            <thead><tr><th>Merchant</th><th>Payments</th><th className="right">Total</th></tr></thead>
            <tbody>
              {summary.topMerchants.map((m) => (
                <tr key={m.merchant}><td>{m.merchant}</td><td>{m.count}</td><td className="right">{rupees(m.total)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Budgets</h3>
          {budgets.length === 0 && <p className="muted">No budgets yet.</p>}
          {budgets.map((b) => <BudgetBar key={b._id} budget={b} />)}
        </div>
      </div>
    </>
  )
}
