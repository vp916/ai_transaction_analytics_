// Every call to the backend goes through this one function.
// It adds the JWT token (saved at login) to the request headers.

const TOKEN_KEY = 'token'

export const saveToken = (token: string) => localStorage.setItem(TOKEN_KEY, token)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)
export const hasToken = () => Boolean(localStorage.getItem(TOKEN_KEY))

export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) {
    clearToken()
    window.location.href = '/login' // token expired -> log in again
  }
  if (res.status === 204) return undefined as T
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data as T
}

// helpers used by several pages
export const rupees = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')

export function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export const CATEGORIES = [
  'Food & Dining', 'Groceries', 'Transport', 'Shopping', 'Bills & Utilities',
  'Entertainment', 'Health & Fitness', 'Travel', 'Education', 'Housing',
]
