import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, saveToken } from '../api'
import type { User } from '../types'

export default function Login() {
  const navigate = useNavigate()
  const [isRegister, setIsRegister] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('demo@example.com')
  const [password, setPassword] = useState('demo1234')
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const path = isRegister ? '/auth/register' : '/auth/login'
      const body = isRegister ? { name, email, password } : { email, password }
      const res = await api<{ token: string; user: User }>(path, 'POST', body)
      saveToken(res.token)
      navigate('/')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <form className="card login" onSubmit={submit}>
      <h2>{isRegister ? 'Create account' : 'Log in'}</h2>
      {isRegister && <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />}
      <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <p className="error">{error}</p>}
      <button type="submit">{isRegister ? 'Register' : 'Log in'}</button>
      <button type="button" className="link" onClick={() => setIsRegister(!isRegister)}>
        {isRegister ? 'Have an account? Log in' : 'New here? Create an account'}
      </button>
      {!isRegister && <p className="muted">Demo account is pre-filled.</p>}
    </form>
  )
}
