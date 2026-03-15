import { useState } from 'react'
import { api } from '../api'

export default function Login() {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.login(token)
      window.location.href = '/'
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-icon">✉️</div>
        <h1 className="login-title">Mail Tamer</h1>
        <p className="login-sub">Enter your admin token to continue</p>
        {error && <div className="login-error">{error}</div>}
        <form onSubmit={handleSubmit} style={{ textAlign: 'left' }}>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label">Admin Token</label>
            <input
              className="input"
              type="password"
              placeholder="••••••••••••"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
              autoFocus
            />
          </div>
          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
