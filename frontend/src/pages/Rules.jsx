import { useState, useEffect } from 'react'
import { CheckCircle, Clock, Trash2, Edit2, X, Plus, Filter, RefreshCw, Download } from 'lucide-react'
import { api } from '../api'
import Select from '../components/Select'

const STATUS_BADGE = {
  active:   'badge-green',
  pending:  'badge-yellow',
  disabled: 'badge-gray',
}
const SOURCE_BADGE   = { manual: 'badge-green', ai: 'badge-blue', gmail: 'badge-gray' }
const SOURCE_LABEL   = { manual: 'Custom', ai: 'AI promoted', gmail: 'Gmail' }

function formatConditions(conditions) {
  if (!conditions || !Object.keys(conditions).length) return '(no conditions)'
  const parts = []
  if (conditions.domain)           parts.push(`from: @${conditions.domain}`)
  if (conditions.from_raw)         parts.push(`from: ${conditions.from_raw.substring(0, 50)}…`)
  if (conditions.subject_contains) parts.push(`subject: ${conditions.subject_contains}`)
  if (conditions.gmail_query)      parts.push(`query: ${conditions.gmail_query.substring(0, 50)}${conditions.gmail_query.length > 50 ? '…' : ''}`)
  if (conditions.negated_query)    parts.push(`not: ${conditions.negated_query}`)
  return parts.join(' · ') || '(no conditions)'
}

function RuleModal({ rule, onClose, onSave }) {
  const initial = rule || { name: '', description: '', label: '', action: 'label', conditions: {} }
  const [form, setForm] = useState({
    ...initial,
    conditions_domain:  initial.conditions?.domain || '',
    conditions_sender:  initial.conditions?.sender_contains || '',
    conditions_subject: Array.isArray(initial.conditions?.subject_contains)
      ? initial.conditions.subject_contains.join(', ')
      : initial.conditions?.subject_contains || '',
  })
  const [saving, setSaving] = useState(false)

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    setSaving(true)
    const conditions = {}
    if (form.conditions_domain)  conditions.domain          = form.conditions_domain.trim()
    if (form.conditions_sender)  conditions.sender_contains = form.conditions_sender.trim()
    if (form.conditions_subject) conditions.subject_contains = form.conditions_subject.split(',').map(s => s.trim()).filter(Boolean)

    const payload = { name: form.name, description: form.description, label: form.label, action: form.action, conditions }
    try {
      await onSave(payload)
      onClose()
    } catch (e) { alert(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 className="modal-title" style={{ margin: 0 }}>{rule ? 'Edit Rule' : 'New Rule'}</h2>
          <button className="btn btn-ghost" style={{ padding: '4px 8px' }} onClick={onClose}><X size={16} /></button>
        </div>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label className="form-label">Name</label>
          <input className="input" value={form.name} onChange={set('name')} placeholder="e.g. GitHub Notifications" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Label</label>
            <input className="input" value={form.label} onChange={set('label')} placeholder="e.g. Developer or Work/Projects" />
            <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 4 }}>Use <code style={{ background: 'var(--bg)', padding: '1px 4px', borderRadius: 3 }}>/</code> for nested labels, e.g. <em>Finance/Receipts</em></div>
          </div>
          <div className="form-group">
            <label className="form-label">Action</label>
            <Select
              value={form.action}
              onChange={(v) => setForm(f => ({ ...f, action: v }))}
              options={[
                { value: 'label',   label: 'Label only' },
                { value: 'archive', label: 'Label + Archive' },
                { value: 'trash',   label: 'Trash' },
              ]}
            />
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label className="form-label">Condition: Sender domain</label>
          <input className="input" value={form.conditions_domain} onChange={set('conditions_domain')} placeholder="e.g. github.com" />
        </div>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label className="form-label">Condition: Sender contains</label>
          <input className="input" value={form.conditions_sender} onChange={set('conditions_sender')} placeholder="e.g. noreply@" />
        </div>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label className="form-label">Condition: Subject contains (comma-separated)</label>
          <input className="input" value={form.conditions_subject} onChange={set('conditions_subject')} placeholder="e.g. invoice, receipt" />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Description</label>
          <input className="input" value={form.description || ''} onChange={set('description')} placeholder="Optional note" />
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Rule'}</button>
        </div>
      </div>
    </div>
  )
}

export default function Rules() {
  const [rules, setRules] = useState([])
  const [gmailFilters, setGmailFilters] = useState([])
  const [activeTab, setActiveTab] = useState('rules') // 'rules' | 'gmail'
  const [filter, setFilter] = useState({ status: '', source: '' })
  const [modal, setModal] = useState(null) // null | 'new' | rule object
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const all = await api.getRules(filter)
      setRules(all.filter(r => r.source !== 'gmail'))
      setGmailFilters(all.filter(r => r.source === 'gmail'))
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { load() }, [filter])

  const pending = rules.filter(r => r.status === 'pending')

  const handleSave = async (payload) => {
    if (modal && modal.id) {
      await api.updateRule(modal.id, payload)
    } else {
      await api.createRule(payload)
    }
    load()
  }

  const handleToggle = async (rule) => {
    const newStatus = rule.status === 'active' ? 'disabled' : 'active'
    await api.updateRule(rule.id, { status: newStatus })
    load()
  }

  const handleApprove = async (rule) => {
    await api.approveRule(rule.id)
    load()
  }

  const handleDelete = async (rule) => {
    if (!confirm(`Delete rule "${rule.name}"?`)) return
    await api.deleteRule(rule.id)
    load()
  }

  const handleSyncGmail = async () => {
    setSyncing(true)
    setSyncMsg('')
    try {
      const res = await api.syncGmailFilters()
      setSyncMsg(`Synced ${res.synced} Gmail filters`)
      await load()
    } catch (e) {
      setSyncMsg(e.message)
    }
    setSyncing(false)
    setTimeout(() => setSyncMsg(''), 5000)
  }

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 className="page-title">Rules</h1>
            <p className="page-subtitle">
              Processing order: <strong style={{ color: 'var(--text-1)' }}>1. Custom rules</strong> → <strong style={{ color: 'var(--text-1)' }}>2. AI-promoted rules</strong> → <strong style={{ color: 'var(--text-1)' }}>3. Live AI</strong>
            </p>
          </div>
          {/* Tab toggle */}
          <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', height: 34 }}>
            <button
              className={`btn ${activeTab === 'rules' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ borderRadius: 0, padding: '0 14px', fontSize: 13 }}
              onClick={() => setActiveTab('rules')}
            >
              My Rules {rules.length > 0 && <span style={{ marginLeft: 5, opacity: 0.7 }}>{rules.length}</span>}
            </button>
            <button
              className={`btn ${activeTab === 'gmail' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ borderRadius: 0, padding: '0 14px', fontSize: 13, borderLeft: '1px solid var(--border)' }}
              onClick={() => setActiveTab('gmail')}
            >
              Gmail Filters {gmailFilters.length > 0 && <span style={{ marginLeft: 5, opacity: 0.7 }}>{gmailFilters.length}</span>}
            </button>
          </div>
        </div>
      </div>

      {/* My Rules Tab */}
      {activeTab === 'rules' && (<>

      {pending.length > 0 && (
        <div className="card" style={{ marginBottom: 20, borderColor: 'rgba(234,179,8,0.3)', background: 'rgba(234,179,8,0.05)' }}>
          <div style={{ fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={15} color="var(--yellow)" /> {pending.length} rule{pending.length > 1 ? 's' : ''} awaiting approval
          </div>
          {pending.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <span style={{ fontWeight: 500 }}>{r.name}</span>
                <span className="badge badge-yellow" style={{ marginLeft: 8 }}>AI promoted</span>
                <div style={{ color: 'var(--text-2)', fontSize: 12, marginTop: 2 }}>{r.description}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => handleApprove(r)}>
                  <CheckCircle size={13} /> Approve
                </button>
                <button className="btn btn-danger" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => handleDelete(r)}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="filter-bar" style={{ margin: 0 }}>
          <Filter size={14} color="var(--text-2)" />
          <Select
            value={filter.status}
            onChange={(v) => setFilter(f => ({ ...f, status: v }))}
            style={{ width: 154 }}
            options={[
              { value: '',         label: 'All statuses' },
              { value: 'active',   label: 'Active' },
              { value: 'pending',  label: 'Pending' },
              { value: 'disabled', label: 'Disabled' },
            ]}
          />
          <Select
            value={filter.source}
            onChange={(v) => setFilter(f => ({ ...f, source: v }))}
            style={{ width: 148 }}
            options={[
              { value: '',       label: 'All sources' },
              { value: 'manual', label: 'Manual' },
              { value: 'ai',     label: 'AI promoted' },
            ]}
          />
        </div>
        <button className="btn btn-primary" onClick={() => setModal('new')}>
          <Plus size={14} /> New Rule
        </button>
      </div>

      <div className="card" style={{ padding: 0, marginTop: 16 }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Label</th>
                <th>Action</th>
                <th>Source</th>
                <th>Status</th>
                <th>Hits</th>
                <th>Confidence</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-2)', padding: 40 }}>Loading…</td></tr>
              ) : rules.filter(r => r.status !== 'pending').length === 0 ? (
                <tr><td colSpan={8}><div className="empty"><p>No rules yet</p><small>Create a rule or wait for AI to promote one</small></div></td></tr>
              ) : (
                rules.filter(r => r.status !== 'pending').map(r => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{r.name}</div>
                      {r.description && <div style={{ color: 'var(--text-2)', fontSize: 12 }}>{r.description}</div>}
                    </td>
                    <td><span className="badge badge-blue">{r.label}</span></td>
                    <td><span style={{ color: 'var(--text-2)', textTransform: 'capitalize' }}>{r.action}</span></td>
                    <td><span className={`badge ${SOURCE_BADGE[r.source] || 'badge-gray'}`}>{SOURCE_LABEL[r.source] || r.source}</span></td>
                    <td>
                      <label className="toggle">
                        <input type="checkbox" checked={r.status === 'active'} onChange={() => handleToggle(r)} />
                        <span className="toggle-slider"></span>
                      </label>
                    </td>
                    <td>{r.match_count}</td>
                    <td>{r.confidence ? `${Math.round(r.confidence * 100)}%` : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost" style={{ padding: '4px 8px' }} onClick={() => setModal(r)}><Edit2 size={13} /></button>
                        <button className="btn btn-danger" style={{ padding: '4px 8px' }} onClick={() => handleDelete(r)}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <RuleModal
          rule={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      </>)} {/* end My Rules tab */}

      {/* Gmail Filters Tab */}
      {activeTab === 'gmail' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <p style={{ color: 'var(--text-2)', fontSize: 13, margin: 0 }}>
              Filters imported from your Gmail account. Managed natively by Gmail — edit complex filters in Gmail directly.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {syncMsg && <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{syncMsg}</span>}
              <button className="btn btn-primary" onClick={handleSyncGmail} disabled={syncing}>
                <Download size={13} /> {syncing ? 'Syncing…' : 'Sync from Gmail'}
              </button>
            </div>
          </div>

          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Label</th>
                    <th>Conditions</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-2)', padding: 40 }}>Loading…</td></tr>
                  ) : gmailFilters.length === 0 ? (
                    <tr><td colSpan={4}>
                      <div className="empty">
                        <p>No Gmail filters synced yet</p>
                        <small>Click "Sync from Gmail" to import your existing filters</small>
                      </div>
                    </td></tr>
                  ) : (
                    gmailFilters.map(f => (
                      <tr key={f.id}>
                        <td>
                          <div style={{ fontWeight: 500, fontSize: 13 }}>{f.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2, fontFamily: 'monospace' }}>
                            {f.gmail_filter_id?.substring(0, 20)}…
                          </div>
                        </td>
                        <td><span className="badge badge-blue">{f.label}</span></td>
                        <td>
                          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                            {formatConditions(f.conditions)}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {f.action === 'archive' && <span className="badge badge-gray">Archive</span>}
                            {f.mark_read === 1 && <span className="badge badge-gray">Mark read</span>}
                            {f.action === 'label' && !f.mark_read && <span className="badge badge-gray">Label only</span>}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
