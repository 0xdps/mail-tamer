import { useState, useEffect } from 'react'
import { Play, Pause, Zap, Database, RefreshCw } from 'lucide-react'
import { api } from '../api'

export default function ControlPanel() {
  const [status, setStatus] = useState(null)
  const [settings, setSettings] = useState({})
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [batching, setBatching] = useState(false)
  const [msg, setMsg] = useState('')

  const load = async () => {
    try {
      const s = await api.getStatus()
      setStatus(s)
      setSettings(s.settings || {})
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  const toggleScheduler = async () => {
    const action = status?.paused ? 'resume' : 'pause'
    await api.controlScheduler(action)
    await load()
    flash(`Scheduler ${action}d`)
  }

  const updateSetting = async (key, value) => {
    const patch = { [key]: value }
    await api.updateSettings(patch)
    setSettings(s => ({ ...s, [key]: value }))
  }

  const triggerScan = async () => {
    setScanning(true)
    try { await api.triggerScan(); flash('Scan triggered — check Run History') }
    catch (e) { flash(e.message) }
    setScanning(false)
  }

  const triggerBatch = async () => {
    if (!confirm('This will process your entire inbox (up to 20,000 emails). Continue?')) return
    setBatching(true)
    try { await api.triggerBatch(); flash('Batch processing started — this may take a while') }
    catch (e) { flash(e.message) }
    setBatching(false)
  }

  if (loading) return <div style={{ color: 'var(--text-2)', padding: 40 }}>Loading…</div>

  const isPaused = status?.paused

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Control Panel</h1>
        <p className="page-subtitle">Manage the scheduler, settings, and manual operations</p>
      </div>

      {msg && (
        <div className="card" style={{ marginBottom: 20, borderColor: 'rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.08)', color: 'var(--accent)', fontWeight: 500 }}>
          {msg}
        </div>
      )}

      <div className="control-grid">

        {/* Scheduler */}
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 15 }}>Scheduler</div>

          <div className="control-row">
            <div>
              <div className="control-label">
                <span className={`dot ${isPaused ? 'dot-yellow' : 'dot-green'}`}></span>
                {isPaused ? 'Paused' : 'Running'}
              </div>
              <div className="control-desc">
                {status?.next_run ? `Next run: ${new Date(status.next_run).toLocaleTimeString()}` : 'No next run scheduled'}
              </div>
            </div>
            <button className={`btn ${isPaused ? 'btn-primary' : 'btn-ghost'}`} onClick={toggleScheduler}>
              {isPaused ? <><Play size={13} /> Resume</> : <><Pause size={13} /> Pause</>}
            </button>
          </div>

          <div className="control-row">
            <div>
              <div className="control-label">Poll interval</div>
              <div className="control-desc">How often to check for new emails</div>
            </div>
            <select
              className="input"
              style={{ width: 130 }}
              value={settings.poll_interval_minutes}
              onChange={e => updateSetting('poll_interval_minutes', parseInt(e.target.value))}
            >
              {[1, 2, 5, 10, 15, 30, 60].map(v => (
                <option key={v} value={v}>{v} min</option>
              ))}
            </select>
          </div>

          <div className="control-row">
            <div>
              <div className="control-label">Dry run mode</div>
              <div className="control-desc">Classify emails but don't apply labels</div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.dry_run === true}
                onChange={e => updateSetting('dry_run', e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>

        {/* AI Settings */}
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 15 }}>AI Model</div>

          <div className="control-row">
            <div>
              <div className="control-label">Model</div>
              <div className="control-desc">Used for unmatched emails</div>
            </div>
            <select
              className="input"
              style={{ width: 200 }}
              value={settings.ai_model}
              onChange={e => updateSetting('ai_model', e.target.value)}
            >
              <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
              <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
              <option value="claude-haiku-3-5-latest">Claude Haiku 3.5</option>
              <option value="claude-3-haiku-20240307">Claude Haiku 3</option>
            </select>
          </div>

          <div className="control-row">
            <div>
              <div className="control-label">Confidence threshold</div>
              <div className="control-desc">Min confidence to auto-promote a rule</div>
            </div>
            <select
              className="input"
              style={{ width: 100 }}
              value={settings.confidence_threshold}
              onChange={e => updateSetting('confidence_threshold', parseFloat(e.target.value))}
            >
              {[0.7, 0.75, 0.8, 0.85, 0.9, 0.95].map(v => (
                <option key={v} value={v}>{Math.round(v * 100)}%</option>
              ))}
            </select>
          </div>
        </div>

        {/* Manual actions */}
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 15 }}>Manual Operations</div>

          <div className="control-row">
            <div>
              <div className="control-label">On-demand scan</div>
              <div className="control-desc">Triage new emails right now</div>
            </div>
            <button className="btn btn-primary" onClick={triggerScan} disabled={scanning}>
              <RefreshCw size={13} className={scanning ? 'spin' : ''} />
              {scanning ? 'Scanning…' : 'Scan now'}
            </button>
          </div>

          <div className="control-row">
            <div>
              <div className="control-label">Batch processor</div>
              <div className="control-desc">One-time migration of existing inbox</div>
            </div>
            <button className="btn btn-ghost" onClick={triggerBatch} disabled={batching}>
              <Database size={13} />
              {batching ? 'Starting…' : 'Run batch'}
            </button>
          </div>
        </div>

      </div>

      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
