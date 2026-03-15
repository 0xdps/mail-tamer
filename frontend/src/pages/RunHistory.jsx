import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { api } from '../api'

function formatDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function duration(start, end) {
  if (!start || !end) return '—'
  const ms = new Date(end) - new Date(start)
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

const STATUS_BADGE = { done: 'badge-green', running: 'badge-yellow', failed: 'badge-red' }
const TRIGGER_BADGE = { scheduled: 'badge-gray', manual: 'badge-blue', batch: 'badge-blue' }

export default function RunHistory() {
  const [data, setData] = useState({ items: [], total: 0 })
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try { setData(await api.getRuns({ page, per_page: 20 })) }
    catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { load() }, [page])

  const totalPages = Math.ceil(data.total / 20)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Run History</h1>
        <p className="page-subtitle">Every triage run — scheduled, manual, and batch</p>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th style={{ width: 32 }}></th>
                <th>#</th>
                <th>Trigger</th>
                <th>Status</th>
                <th>Fetched</th>
                <th>Rules matched</th>
                <th>AI calls</th>
                <th>Applied</th>
                <th>Mode</th>
                <th>Duration</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} style={{ textAlign: 'center', color: 'var(--text-2)', padding: 40 }}>Loading…</td></tr>
              ) : data.items.length === 0 ? (
                <tr><td colSpan={11}><div className="empty"><p>No runs yet</p><small>Trigger a scan from the Control Panel</small></div></td></tr>
              ) : (
                data.items.map(r => (
                  <>
                    <tr key={r.id} style={{ cursor: r.error ? 'pointer' : 'default' }} onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                      <td>
                        {r.error
                          ? (expanded === r.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />)
                          : null}
                      </td>
                      <td style={{ color: 'var(--text-2)' }}>#{r.id}</td>
                      <td><span className={`badge ${TRIGGER_BADGE[r.trigger] || 'badge-gray'}`}>{r.trigger}</span></td>
                      <td><span className={`badge ${STATUS_BADGE[r.status] || 'badge-gray'}`}>{r.status}</span></td>
                      <td>{r.emails_fetched}</td>
                      <td>{r.rules_matched}</td>
                      <td>{r.ai_calls}</td>
                      <td>{r.labels_applied}</td>
                      <td>{r.dry_run ? <span className="badge badge-yellow">Dry run</span> : <span className="badge badge-green">Live</span>}</td>
                      <td style={{ color: 'var(--text-2)' }}>{duration(r.started_at, r.finished_at)}</td>
                      <td style={{ color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{formatDate(r.started_at)}</td>
                    </tr>
                    {expanded === r.id && r.error && (
                      <tr key={`err-${r.id}`}>
                        <td colSpan={11} style={{ background: 'rgba(239,68,68,0.05)', padding: '12px 16px' }}>
                          <pre style={{ color: 'var(--red)', fontSize: 12, whiteSpace: 'pre-wrap', margin: 0 }}>{r.error}</pre>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span>Page {page} / {totalPages}</span>
          <button className="btn btn-ghost" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  )
}
