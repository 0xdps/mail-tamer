import { useState, useEffect } from 'react'
import { RefreshCw, Tag, Zap, CheckCircle, Clock, BookOpen, AlertCircle } from 'lucide-react'
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

function StatCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-2)', fontSize: 13 }}>
        <Icon size={15} style={{ color }} />
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{sub}</div>}
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  const load = async () => {
    setLoading(true)
    try { setStats(await api.getDashboardStats()) }
    catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleSync = async () => {
    setSyncing(true)
    setSyncMsg('')
    try {
      const res = await api.syncLabels()
      setSyncMsg(`Synced ${res.synced} labels`)
      await load()
    } catch (e) {
      setSyncMsg(e.message)
    }
    setSyncing(false)
    setTimeout(() => setSyncMsg(''), 4000)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-2)', fontSize: 14 }}>
      Loading…
    </div>
  )

  const d = stats?.decisions ?? {}
  const rules = stats?.rules ?? {}
  const runs = stats?.runs ?? {}
  const labels = stats?.gmail_labels ?? []

  const activeRules = rules.active ?? 0
  const pendingRules = rules.pending ?? 0
  const totalRules = Object.values(rules).reduce((a, b) => a + b, 0)

  const bySource = d.by_source ?? []
  const aiCount = bySource.find(s => s.source === 'ai')?.count ?? 0
  const ruleCount = bySource.find(s => s.source === 'rule')?.count ?? 0

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Overview of your mail triage activity</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {syncMsg && <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{syncMsg}</span>}
          <button className="btn btn-ghost" onClick={handleSync} disabled={syncing}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <RefreshCw size={14} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
            {syncing ? 'Syncing…' : 'Sync Labels'}
          </button>
        </div>
      </div>

      {/* Summary stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <StatCard icon={Zap} label="Decisions Made" value={d.total} sub={`${d.applied ?? 0} labels applied`} color="var(--accent)" />
        <StatCard icon={CheckCircle} label="Runs Completed" value={runs.total_completed} sub="all time" color="#22c55e" />
        <StatCard icon={BookOpen} label="Active Rules" value={activeRules} sub={`${totalRules} total`} color="#60a5fa" />
        {pendingRules > 0
          ? <StatCard icon={AlertCircle} label="Pending Approval" value={pendingRules} sub="rules awaiting review" color="#f59e0b" />
          : <StatCard icon={Tag} label="Gmail Labels" value={labels.length} sub={labels.length > 0 ? `${labels.reduce((a, l) => a + l.messages_total, 0).toLocaleString()} total emails` : 'sync to load'} color="#a78bfa" />
        }
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Gmail label counts */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>Gmail Labels</h2>
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
              {labels.length > 0 ? `${labels.length} labels` : 'click Sync Labels'}
            </span>
          </div>
          {labels.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-2)', fontSize: 13 }}>
              No label data —{' '}
              <button className="btn btn-ghost" onClick={handleSync} disabled={syncing}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, padding: '2px 8px', verticalAlign: 'middle' }}>
                <RefreshCw size={13} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
                {syncing ? 'Syncing…' : 'Sync Labels'}
              </button>{' '}
              to load from Gmail
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
              {labels.map(lbl => (
                <div key={lbl.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '7px 10px', background: 'var(--bg)', borderRadius: 6,
                }}>
                  <span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{lbl.name}</span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {lbl.messages_unread > 0 && (
                      <span className="badge badge-yellow" style={{ fontSize: 11 }}>{lbl.messages_unread} unread</span>
                    )}
                    <span style={{ fontSize: 12, color: 'var(--text-2)', minWidth: 28, textAlign: 'right' }}>
                      {lbl.messages_total.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top classified labels */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>Top Applied Labels</h2>
            <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text-2)' }}>
              <span>AI: {aiCount}</span>
              <span>·</span>
              <span>Rules: {ruleCount}</span>
            </div>
          </div>
          {d.by_label?.length === 0 || !d.by_label ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-2)', fontSize: 13 }}>
              No decisions recorded yet
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {d.by_label.map((item, i) => {
                const pct = d.total > 0 ? Math.round((item.count / d.total) * 100) : 0
                return (
                  <div key={item.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{item.label}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{item.count} ({pct}%)</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: 'var(--bg)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 2,
                        width: `${pct}%`,
                        background: i === 0 ? 'var(--accent)' : i === 1 ? '#60a5fa' : i === 2 ? '#34d399' : 'var(--text-2)',
                      }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent runs */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={14} style={{ color: 'var(--text-2)' }} />
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>Recent Runs</h2>
        </div>
        {runs.recent?.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-2)', fontSize: 13 }}>
            No runs yet — trigger a scan from the Control Panel
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Started</th>
                <th>Duration</th>
                <th style={{ textAlign: 'right' }}>Fetched</th>
                <th style={{ textAlign: 'right' }}>Labels Applied</th>
                <th>Mode</th>
              </tr>
            </thead>
            <tbody>
              {runs.recent?.map(run => (
                <tr key={run.id}>
                  <td><span className={`badge ${STATUS_BADGE[run.status] ?? 'badge-gray'}`}>{run.status}</span></td>
                  <td style={{ color: 'var(--text-2)', fontSize: 13 }}>{formatDate(run.started_at)}</td>
                  <td style={{ color: 'var(--text-2)', fontSize: 13 }}>{duration(run.started_at, run.finished_at)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-2)', fontSize: 13 }}>{run.emails_fetched ?? '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 500 }}>{run.labels_applied ?? '—'}</td>
                  <td><span className={`badge ${run.dry_run ? 'badge-gray' : 'badge-blue'}`}>{run.dry_run ? 'dry run' : 'live'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
