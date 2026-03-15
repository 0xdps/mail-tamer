import { useState, useEffect } from 'react'
import { Play, Pause, Database, RefreshCw } from 'lucide-react'
import { api } from '../api'
import Select from '../components/Select'

export default function ControlPanel() {
  const [status, setStatus] = useState(null)
  const [settings, setSettings] = useState({})
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [batching, setBatching] = useState(false)
  const [msg, setMsg] = useState('')
  const [health, setHealth] = useState(null)
  const [healthLoading, setHealthLoading] = useState(false)

  const load = async () => {
    try {
      const s = await api.getStatus()
      setStatus(s)
      setSettings(s.settings || {})
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const checkHealth = async () => {
    setHealthLoading(true)
    try {
      const h = await api.getHealth()
      setHealth(h)
    } catch (e) {
      setHealth({ error: e.message })
    }
    setHealthLoading(false)
  }

  useEffect(() => { void (async () => { await load(); await checkHealth() })() }, [])

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  const toggleScheduler = async () => {
    const action = status?.paused ? 'resume' : 'pause'
    await api.controlScheduler(action)
    await load()
    flash(`Scheduler ${action}d`)
  }

  const updateSetting = async (key, value) => {
    const prev = settings[key]
    setSettings(s => ({ ...s, [key]: value }))
    try {
      await api.updateSettings({ [key]: value })
    } catch (e) {
      setSettings(s => ({ ...s, [key]: prev }))
      flash('Failed to save: ' + e.message)
    }
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

  if (loading) return <div className="flex items-center justify-center h-40 text-[var(--text-2)] text-sm">Loading…</div>

  const isPaused = status?.paused

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Control Panel</h1>
        <p className="page-subtitle">Manage the scheduler, settings, and manual operations</p>
      </div>


      <div className="control-grid">


        {/* Connection Status */}
        <div className="card col-span-full">
          <div className="flex items-center justify-between" style={{ marginBottom: health ? 14 : 0 }}>
            <div className="card-title mb-0">Connection Status</div>
            <button
              className="btn btn-ghost"
              style={{ padding: '5px 12px', fontSize: 12 }}
              onClick={checkHealth}
              disabled={healthLoading}
            >
              <RefreshCw size={12} className={healthLoading ? 'spin' : ''} />
              {healthLoading ? 'Checking…' : 'Recheck'}
            </button>
          </div>

          {healthLoading && !health && (
            <div className="text-[var(--text-2)] text-[13px]">Checking connections…</div>
          )}

          {health && !health.error && (
            <div className="flex gap-6 flex-wrap">
              {/* Google APIs */}
              <div className="flex flex-col flex-1" style={{ minWidth: 180 }}>
                <div className="flex items-center gap-2">
                  <span className={`dot ${health.google?.ok ? 'dot-green' : 'dot-red'}`} />
                  <span className="font-semibold text-[13px]">Google APIs</span>
                  <span className={`badge ${health.google?.ok ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 10 }}>
                    {health.google?.ok ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
                {health.google?.ok
                  ? <div className="text-[12px] text-[var(--text-2)] mt-1">{health.google.email_address}</div>
                  : <div className="text-[12px] text-[var(--red)] mt-1 font-mono break-all">{health.google?.error}</div>
                }
              </div>

              <div className="w-px bg-[var(--border)] self-stretch flex-shrink-0" />

              {/* Gemini API */}
              <div className="flex flex-col flex-1" style={{ minWidth: 180 }}>
                <div className="flex items-center gap-2">
                  <span className={`dot ${health.gemini?.ok ? 'dot-green' : 'dot-red'}`} />
                  <span className="font-semibold text-[13px]">Gemini API</span>
                  <span className={`badge ${health.gemini?.ok ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 10 }}>
                    {health.gemini?.ok ? 'Connected' : 'Disconnected'}
                  </span>
                  {health.active_model?.includes('gemini') && (
                    <span className="badge badge-blue" style={{ fontSize: 10 }}>Active</span>
                  )}
                </div>
                {health.gemini?.ok
                  ? <div className="text-[12px] text-[var(--text-2)] mt-1">GEMINI_API_KEY configured</div>
                  : <div className="text-[12px] text-[var(--red)] mt-1 font-mono break-all">{health.gemini?.error}</div>
                }
              </div>

              <div className="w-px bg-[var(--border)] self-stretch flex-shrink-0" />

              {/* Claude API */}
              <div className="flex flex-col flex-1" style={{ minWidth: 180 }}>
                <div className="flex items-center gap-2">
                  <span className={`dot ${health.claude?.ok ? 'dot-green' : 'dot-red'}`} />
                  <span className="font-semibold text-[13px]">Claude API</span>
                  <span className={`badge ${health.claude?.ok ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 10 }}>
                    {health.claude?.ok ? 'Connected' : 'Disconnected'}
                  </span>
                  {health.active_model?.includes('claude') && (
                    <span className="badge badge-blue" style={{ fontSize: 10 }}>Active</span>
                  )}
                </div>
                {health.claude?.ok
                  ? <div className="text-[12px] text-[var(--text-2)] mt-1">ANTHROPIC_API_KEY configured</div>
                  : <div className="text-[12px] text-[var(--red)] mt-1 font-mono break-all">{health.claude?.error}</div>
                }
              </div>
            </div>
          )}

          {health?.error && (
            <div className="text-[var(--red)] text-[13px]">Failed to fetch health: {health.error}</div>
          )}
        </div>

      {msg && (
        <div className="card col-span-full mb-5 text-[var(--accent)] font-medium" style={{ borderColor: 'rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.08)' }}>
          {msg}
        </div>
      )}
        {/* Scheduler */}
        <div className="card">
          <div className="card-title">Scheduler</div>

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
            <Select
              style={{ width: 130 }}
              value={settings.poll_interval_minutes}
              onChange={(v) => updateSetting('poll_interval_minutes', parseInt(v))}
              options={[1, 2, 5, 10, 15, 30, 60].map(v => ({ value: v, label: `${v} min` }))}
            />
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
          <div className="card-title">AI Model</div>

          <div className="control-row">
            <div>
              <div className="control-label">Model</div>
              <div className="control-desc">Used for unmatched emails</div>
            </div>
            <Select
              style={{ width: 200 }}
              value={settings.ai_model}
              onChange={(v) => updateSetting('ai_model', v)}
              options={[
                { value: 'gemini-2.0-flash',        label: 'Gemini 2.0 Flash' },
                { value: 'gemini-1.5-flash',        label: 'Gemini 1.5 Flash' },
                { value: 'claude-haiku-3-5-latest', label: 'Claude Haiku 3.5' },
                { value: 'claude-3-haiku-20240307', label: 'Claude Haiku 3' },
              ]}
            />
          </div>

          <div className="control-row">
            <div>
              <div className="control-label">Confidence threshold</div>
              <div className="control-desc">Min confidence to auto-promote a rule</div>
            </div>
            <Select
              style={{ width: 110 }}
              value={settings.confidence_threshold}
              onChange={(v) => updateSetting('confidence_threshold', parseFloat(v))}
              options={[0.7, 0.75, 0.8, 0.85, 0.9, 0.95].map(v => ({ value: v, label: `${Math.round(v * 100)}%` }))}
            />
          </div>
        </div>

        {/* Manual Operations — full-width bottom row */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-title">Manual Operations</div>

          <div style={{ display: 'grid' }}>
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

      </div>


    </div>
  )
}
