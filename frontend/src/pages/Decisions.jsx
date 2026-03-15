import { useState, useEffect } from 'react'
import { ArrowUpCircle, Filter } from 'lucide-react'
import { api } from '../api'
import Select from '../components/Select'

const SOURCE_BADGE = { ai: 'badge-blue', rule: 'badge-green', domain: 'badge-gray' }

function formatDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}

export default function Decisions() {
  const [data, setData] = useState({ items: [], total: 0 })
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({ source: '', label: '', dry_run: '' })
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const params = { page, per_page: 50, ...filters }
      if (filters.dry_run !== '') params.dry_run = filters.dry_run === 'true'
      setData(await api.getDecisions(params))
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { load() }, [page, filters])

  const setFilter = (k) => (v) => {
    setPage(1)
    setFilters(f => ({ ...f, [k]: v }))
  }

  const promote = async (id) => {
    await api.promoteDecision(id)
    load()
  }

  const totalPages = Math.ceil(data.total / 50)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Decisions</h1>
        <p className="page-subtitle">Every email classification decision — AI and rule-based</p>
      </div>

      <div className="filter-bar">
        <Filter size={14} color="var(--text-2)" />
        <Select
          value={filters.source}
          onChange={setFilter('source')}
          style={{ width: 148 }}
          options={[
            { value: '',       label: 'All sources' },
            { value: 'ai',     label: 'AI' },
            { value: 'rule',   label: 'Rule' },
            { value: 'domain', label: 'Domain' },
          ]}
        />
        <Select
          value={filters.dry_run}
          onChange={setFilter('dry_run')}
          style={{ width: 140 }}
          options={[
            { value: '',      label: 'All modes' },
            { value: 'false', label: 'Live' },
            { value: 'true',  label: 'Dry run' },
          ]}
        />
        <span className="ml-auto text-[13px] text-[var(--text-2)]">{data.total} total</span>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Sender</th>
                <th>Subject</th>
                <th>Label</th>
                <th>Action</th>
                <th>Source</th>
                <th>Confidence</th>
                <th>Mode</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-2)', padding: 40 }}>Loading…</td></tr>
              ) : data.items.length === 0 ? (
                <tr><td colSpan={9}><div className="empty"><p>No decisions yet</p><small>Trigger a scan to start classifying emails</small></div></td></tr>
              ) : (
                data.items.map(d => (
                  <tr key={d.id}>
                    <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.sender}</td>
                    <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.subject}</td>
                    <td><span className="badge badge-blue">{d.label}</span></td>
                    <td style={{ color: 'var(--text-2)', textTransform: 'capitalize' }}>{d.action}</td>
                    <td><span className={`badge ${SOURCE_BADGE[d.source] || 'badge-gray'}`}>{d.source}</span></td>
                    <td>{d.confidence ? `${Math.round(d.confidence * 100)}%` : '—'}</td>
                    <td>
                      {d.is_dry_run
                        ? <span className="badge badge-yellow">Dry run</span>
                        : <span className="badge badge-green">Live</span>}
                    </td>
                    <td style={{ color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{formatDate(d.created_at)}</td>
                    <td>
                      {d.source === 'ai' && (
                        <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 11 }} title="Promote to rule" onClick={() => promote(d.id)}>
                          <ArrowUpCircle size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
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
