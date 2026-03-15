const BASE = '/api'

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    credentials: 'include',
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  if (!res.ok) {
    if (res.status === 401) {
      window.location.href = '/login'
      return
    }
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  // auth
  login: (token) => req('/auth/login', { method: 'POST', body: { token } }),
  logout: () => req('/auth/logout', { method: 'POST' }),

  // rules
  getRules: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v))
    return req(`/rules${q.toString() ? '?' + q : ''}`)
  },
  createRule: (data) => req('/rules', { method: 'POST', body: data }),
  updateRule: (id, data) => req(`/rules/${id}`, { method: 'PATCH', body: data }),
  approveRule: (id) => req(`/rules/${id}/approve`, { method: 'POST' }),
  deleteRule: (id) => req(`/rules/${id}`, { method: 'DELETE' }),

  // decisions
  getDecisions: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    return req(`/decisions${q.toString() ? '?' + q : ''}`)
  },
  promoteDecision: (id) => req(`/decisions/${id}/promote`, { method: 'POST' }),

  // runs
  getRuns: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v))
    return req(`/runs${q.toString() ? '?' + q : ''}`)
  },

  // scheduler
  getStatus: () => req('/scheduler/status'),
  controlScheduler: (action) => req('/scheduler/control', { method: 'POST', body: { action } }),
  updateSettings: (data) => req('/scheduler/settings', { method: 'PATCH', body: data }),
  triggerScan: () => req('/scheduler/scan', { method: 'POST' }),
  triggerBatch: (max_emails = 20000) => req(`/scheduler/batch?max_emails=${max_emails}`, { method: 'POST' }),

  // health
  getHealth: () => req('/health'),

  // emails
  getEmails: (pageToken = null, maxResults = 25) => {
    const q = new URLSearchParams({ max_results: maxResults })
    if (pageToken) q.set('page_token', pageToken)
    return req(`/emails?${q}`)
  },

  // dashboard
  getDashboardStats: () => req('/dashboard/stats'),
  syncLabels: () => req('/dashboard/sync-labels', { method: 'POST' }),
}
