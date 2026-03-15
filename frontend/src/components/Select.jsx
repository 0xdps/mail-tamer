import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

/**
 * Custom dropdown select — same height as .btn and .input (36px).
 * @param {Array<{value: string|number, label: string}>} options
 * @param {string|number} value — currently selected value
 * @param {(value: string|number) => void} onChange — receives the raw option value
 * @param {string} [placeholder]
 * @param {string} [className] — applied to the wrapper div
 * @param {object} [style] — applied to the wrapper div (e.g. { width: 160 })
 */
export default function Select({ value, onChange, options, placeholder = 'Select…', className = '', style }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onKey  = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const current = options.find(o => String(o.value) === String(value ?? ''))

  return (
    <div ref={ref} style={{ position: 'relative', ...style }} className={className}>
      <button type="button" className="select-trigger" onClick={() => setOpen(o => !o)}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', color: current ? 'var(--text)' : 'var(--text-2)' }}>
          {current?.label ?? placeholder}
        </span>
        <ChevronDown size={13} className={`select-chevron${open ? ' open' : ''}`} />
      </button>

      {open && (
        <div className="select-dropdown">
          {options.map(o => (
            <button
              key={String(o.value)}
              type="button"
              className={`select-option${String(o.value) === String(value ?? '') ? ' selected' : ''}`}
              onClick={() => { onChange(o.value); setOpen(false) }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
