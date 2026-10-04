import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { clearToken, hasToken } from './api'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Budgets from './pages/Budgets'

// Pages that need a logged-in user are wrapped in <Protected>.
function Protected({ children }: { children: React.ReactNode }) {
  return hasToken() ? children : <Navigate to="/login" />
}

export default function App() {
  const navigate = useNavigate()

  function logout() {
    clearToken()
    navigate('/login')
  }

  return (
    <>
      {hasToken() && (
        <nav className="nav">
          <span className="brand">Transaction Analytics</span>
          <NavLink to="/">Dashboard</NavLink>
          <NavLink to="/transactions">Transactions</NavLink>
          <NavLink to="/budgets">Budgets</NavLink>
          <button className="link" onClick={logout}>Log out</button>
        </nav>
      )}
      <main className="page">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Protected><Dashboard /></Protected>} />
          <Route path="/transactions" element={<Protected><Transactions /></Protected>} />
          <Route path="/budgets" element={<Protected><Budgets /></Protected>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </>
  )
}
