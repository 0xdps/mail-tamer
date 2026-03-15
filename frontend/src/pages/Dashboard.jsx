import { useState, useEffect, useRef } from 'react'
import { RefreshCw, Tag, Zap, CheckCircle, Clock, BookOpen, AlertCircle, Mail, MailOpen, X } from 'lucide-react'
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

function StatCard({ icon: Icon, label, value, sub, color, onClick }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-2)', fontSize: 13 }}>
        <Icon size={15} style={{ color }} />
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{sub}</div>}
    </div>
  )
}

function buildLabelRows(labels) {
  // Build a map: parent name → sorted children
  const childrenOf = {}
  const topLevel = []

  for (const lbl of labels) {
    const parts = lbl.name.split('/')
    if (parts.length === 1) {
      topLevel.push(lbl)
    } else {
      const parent = parts.slice(0, -1).join('/')
      if (!childrenOf[parent]) childrenOf[parent] = []
      childrenOf[parent].push(lbl)
    }
  }

  // Sort top-level by messages_total desc
  topLevel.sort((a, b) => b.messages_total - a.messages_total)

  // DFS to produce a flat ordered list with depth annotation
  const rows = []
  function visit(lbl, depth) {
    const parts = lbl.name.split('/')
    rows.push({ ...lbl, depth, displayName: parts[parts.length - 1] })
    const children = (childrenOf[lbl.name] || []).slice().sort((a, b) => b.messages_total - a.messages_total)
    for (const child of children) visit(child, depth + 1)
  }
  for (const lbl of topLevel) visit(lbl, 0)

  // Orphaned children (parent not in the list) — append at depth 0 so nothing is lost
  const visited = new Set(rows.map(r => r.name))
  for (const lbl of labels) {
    if (!visited.has(lbl.name)) {
      const parts = lbl.name.split('/')
      rows.push({ ...lbl, depth: 0, displayName: parts[parts.length - 1] })
    }
  }

  return rows
}

function timeAgo(isoStr) {
  if (!isoStr) return null
  const diff = Math.floor((Date.now() - new Date(isoStr)) / 1000)
  if (diff < 60)  return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [inboxModal, setInboxModal] = useState(false)
  const [markStatus, setMarkStatus] = useState(null) // null | 'marking' | 'running' | { done: N }
  const [mailboxData, setMailboxData] = useState(null)
  const [mailboxLoading, setMailboxLoading] = useState(false)
  const pollRef = useRef(null)

  const load = async () => {
    setLoading(true)
    try { setStats(await api.getDashboardStats()) }
    catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Fetch mailbox stats (cached); set state + resume mark-all-read poll if needed
  const loadMailboxData = async (force = false) => {
    setMailboxLoading(true)
    try {
      const data = await api.getMailboxStats(force)
      setMailboxData(data)
      const { mark_read_status } = data
      if (mark_read_status === 'running') {
        setMarkStatus('running')
        clearInterval(pollRef.current)
        pollRef.current = setInterval(async () => {
          try {
            const m = await api.getInboxMeta()
            if (m.mark_read_status?.startsWith('done:')) {
              setMarkStatus({ done: parseInt(m.mark_read_status.split(':')[1], 10) })
              clearInterval(pollRef.current)
              pollRef.current = null
              api.resetMarkReadStatus().catch(() => {})
            }
          } catch {}
        }, 3000)
        // don't restore a stale 'done' from a previous session
      }
    } catch (e) {
      console.error(e)
    }
    setMailboxLoading(false)
  }

  // Load when modal opens
  useEffect(() => {
    if (!inboxModal) {
      clearInterval(pollRef.current)
      pollRef.current = null
      return
    }
    loadMailboxData()
  }, [inboxModal])

  useEffect(() => () => clearInterval(pollRef.current), [])

  const closeModal = () => {
    clearInterval(pollRef.current)
    pollRef.current = null
    setInboxModal(false)
    setMarkStatus(null)
    setMailboxData(null)
  }

  const handleMarkAllRead = async () => {
    setMarkStatus('marking')
    try {
      await api.markAllRead()
      setMarkStatus('running')
      clearInterval(pollRef.current)
      pollRef.current = setInterval(async () => {
        try {
          const m = await api.getInboxMeta()
          if (m.mark_read_status?.startsWith('done:')) {
            setMarkStatus({ done: parseInt(m.mark_read_status.split(':')[1], 10) })
            clearInterval(pollRef.current)
            pollRef.current = null
          }
        } catch {}
      }, 3000)
    } catch (e) {
      setMarkStatus(null)
      console.error(e)
    }
  }

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
        <StatCard
          icon={Mail}
          label="Inbox"
          value={stats?.inbox?.total != null ? stats.inbox.total.toLocaleString() : '—'}
          sub={stats?.inbox?.unread ? `${stats.inbox.unread.toLocaleString()} unread` : 'click to view details'}
          color="#f59e0b"
          onClick={() => setInboxModal(true)}
        />
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
              {buildLabelRows(labels).map(lbl => (
                <div key={lbl.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '7px 10px', background: 'var(--bg)', borderRadius: 6,
                  paddingLeft: lbl.depth > 0 ? `${10 + lbl.depth * 16}px` : 10,
                  opacity: lbl.depth > 0 ? 0.9 : 1,
                }}>
                  <span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: lbl.depth === 0 ? 500 : 400 }}>
                    {lbl.depth > 0 && <span style={{ color: 'var(--text-2)', marginRight: 4, fontSize: 11 }}>{'└'}</span>}
                    {lbl.displayName}
                  </span>
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

      {inboxModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={closeModal}
        >
          <div className="card" style={{ width: 500, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Mail size={16} style={{ color: '#f59e0b' }} />
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>Mailbox Overview</h2>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {mailboxData?.fetched_at && !mailboxLoading && (
                  <span style={{ fontSize: 11, color: 'var(--text-2)' }}>
                    {mailboxData.refreshing ? 'Refreshing…' : `Updated ${timeAgo(mailboxData.fetched_at)}`}
                  </span>
                )}
                <button
                  className="btn btn-ghost"
                  style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                  onClick={() => loadMailboxData(true)}
                  disabled={mailboxLoading}
                  title="Force refresh from Gmail"
                >
                  <RefreshCw size={12} style={{ animation: mailboxLoading ? 'spin 1s linear infinite' : 'none' }} />
                </button>
                <button className="btn btn-ghost" style={{ padding: '4px 8px' }} onClick={closeModal}><X size={14} /></button>
              </div>
            </div>

            {/* Loading skeleton */}
            {mailboxLoading && !mailboxData ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0', gap: 8, color: 'var(--text-2)', fontSize: 14 }}>
                <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                Fetching from Gmail…
              </div>
            ) : (
              <>
                {/* Inbox top stats */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
                  {[
                    ['Inbox Total', mailboxData?.inbox?.total, 'var(--text-1)'],
                    ['Unread', mailboxData?.inbox?.unread, (mailboxData?.inbox?.unread ?? 0) > 0 ? '#f59e0b' : 'var(--text-1)'],
                    ['Read',
                      mailboxData?.inbox?.total != null && mailboxData?.inbox?.unread != null
                        ? mailboxData.inbox.total - mailboxData.inbox.unread : null,
                      '#22c55e'],
                  ].map(([lbl, val, clr]) => (
                    <div key={lbl} style={{ background: 'var(--bg)', borderRadius: 8, padding: 14 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{lbl}</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: clr }}>{val?.toLocaleString() ?? '—'}</div>
                    </div>
                  ))}
                </div>

                {/* Folders */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Folders</div>
                  {[
                    { name: 'Total in Mailbox', total: mailboxData?.mailbox_total, unread: null },
                    { name: 'Trash',             total: mailboxData?.trash?.total,  unread: mailboxData?.trash?.unread },
                    { name: 'Spam',              total: mailboxData?.spam?.total,   unread: mailboxData?.spam?.unread },
                  ].map(row => (
                    <div key={row.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 6, background: 'var(--bg)', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{row.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {row.unread > 0 && <span className="badge badge-yellow" style={{ fontSize: 11 }}>{row.unread.toLocaleString()} unread</span>}
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', minWidth: 52, textAlign: 'right' }}>
                          {row.total?.toLocaleString() ?? '—'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Categories */}
                {mailboxData?.categories?.some(c => c.total > 0) && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Categories</div>
                    {mailboxData.categories.map(cat => (
                      <div key={cat.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 6, background: 'var(--bg)', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{cat.name}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {cat.unread > 0 && <span className="badge badge-yellow" style={{ fontSize: 11 }}>{cat.unread.toLocaleString()} unread</span>}
                          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', minWidth: 52, textAlign: 'right' }}>
                            {cat.total?.toLocaleString() ?? '—'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Mark All Read CTA */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                  {markStatus?.done != null ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#22c55e', fontSize: 14 }}>
                      <CheckCircle size={16} />
                      Marked {markStatus.done.toLocaleString()} messages as read
                    </div>
                  ) : markStatus === 'running' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-2)', fontSize: 14 }}>
                      <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                      Marking all as read in background…
                    </div>
                  ) : (
                    <button
                      className="btn btn-primary"
                      style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', justifyContent: 'center' }}
                      onClick={handleMarkAllRead}
                      disabled={markStatus === 'marking' || !(mailboxData?.inbox?.unread)}
                    >
                      <MailOpen size={14} />
                      {markStatus === 'marking'
                        ? 'Queuing…'
                        : `Mark All Read${mailboxData?.inbox?.unread ? ` (${mailboxData.inbox.unread.toLocaleString()})` : ''}`}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
