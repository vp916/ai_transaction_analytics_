// Small box showing one number on the dashboard.
export default function StatCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="card stat">
      <div className="muted">{label}</div>
      <div className="stat-value">{value}</div>
      {note && <div className="muted small">{note}</div>}
    </div>
  )
}
