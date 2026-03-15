import { useState, useEffect } from 'react'
import { CheckCircle, Clock, Trash2, Edit2, X, Plus, Filter } from 'lucide-react'
import { api } from '../api'

const STATUS_BADGE = {
  active:   'badge-green',
  pending:  'badge-yellow',
  disabled: 'badge-gray',
}
const SOURCE_BADGE = { manual: 'badge-blue', ai: 'badge-blue' }

function RuleModal({ rule, onClose, onSave }) {
  const initial = rule || { name: '', description: '', label: '', action: 'label', conditions: {} }
  const [form, setForm] = useState({
    ...initial,
    conditions_domain: initial.conditions?.domain || '',
    conditions_subject: Array.isArray(initial.conditions?.subject_contains)
      ? initial.conditions.subject_contains.join(', ')
      : initial.conditions?.subject_contains || '',
  })
  const [saving, setSaving] = useState(false)

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    setSaving(true)
    const conditions = {}
    if (form.conditions_domain) conditions.domain = form.conditions_domain.trim()
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
            <input className="input" value={form.label} onChange={set('label')} placeholder="e.g. Developer" />
          </div>
          <div className="form-group">
            <label className="form-label">Action</label>
            <select className="input" value={form.action} onChange={set('action')}>
              <option value="label">Label only</option>
              <option value="archive">Label + Archive</option>
              <option value="trash">Trash</option>
            </select>
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label className="form-label">Condition: Domain</label>
          <input className="input" value={form.conditions_domain} onChange={set('conditions_domain')} placeholder="e.g. github.com" />
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
  const [filter, setFilter] = useState({ status: '', source: '' })
  const [modal, setModal] = useState(null) // null | 'new' | rule object
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try { setRules(await api.getRules(filter)) } catch (e) { console.error(e) }
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

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Rules</h1>
        <p className="page-subtitle">Deterministic classification rules — checked before AI</p>
      </div>

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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div className="filters" style={{ margin: 0 }}>
          <Filter size={14} color="var(--text-2)" />
          <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="disabled">Disabled</option>
          </select>
          <select value={filter.source} onChange={e => setFilter(f => ({ ...f, source: e.target.value }))}>
            <option value="">All sources</option>
            <option value="manual">Manual</option>
            <option value="ai">AI promoted</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={() => setModal('new')}>
          <Plus size={14} /> New Rule
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
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
                    <td><span className={`badge ${SOURCE_BADGE[r.source] || 'badge-gray'}`}>{r.source}</span></td>
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
    </div>
  )
}
