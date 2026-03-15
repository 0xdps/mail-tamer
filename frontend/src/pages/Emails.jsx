import { useState, useEffect } from 'react'
import { RefreshCw, ChevronLeft, ChevronRight, MailOpen } from 'lucide-react'
import { api } from '../api'

export default function Emails() {
  const [emails, setEmails] = useState([])
  const [loading, setLoading] = useState(true)
  const [pageStack, setPageStack] = useState([null])
  const [currentPage, setCurrentPage] = useState(0)
  const [nextToken, setNextToken] = useState(null)
  const [marking, setMarking] = useState(false)
  const [markMsg, setMarkMsg] = useState('')

  const load = async (pageToken = null) => {
    setLoading(true)
    try {
      const data = await api.getEmails(pageToken)
      setEmails(data.emails || [])
      setNextToken(data.next_page_token || null)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  useEffect(() => {
    load(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const goNext = () => {
    const newStack = [...pageStack, nextToken]
    setPageStack(newStack)
    setCurrentPage(currentPage + 1)
    load(nextToken)
  }

  const goPrev = () => {
    const newPage = currentPage - 1
    const token = pageStack[newPage] ?? null
    setPageStack(pageStack.slice(0, newPage + 1))
    setCurrentPage(newPage)
    load(token)
  }

  const refresh = () => {
    const token = pageStack[currentPage] ?? null
    load(token)
  }

  const handleMarkAllRead = async () => {
    if (!confirm('Mark all ~10k unread messages as read? This may take a minute.')) return
    setMarking(true)
    setMarkMsg('')
    try {
      const res = await api.markAllRead()
      setMarkMsg(`Marked ${res.marked_read.toLocaleString()} messages as read`)
      load(null) // reload first page to reflect changes
    } catch (e) {
      setMarkMsg(e.message)
    }
    setMarking(false)
    setTimeout(() => setMarkMsg(''), 6000)
  }

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title">Inbox</h1>
            <p className="page-subtitle">Your Gmail inbox — read-only view</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {markMsg && <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{markMsg}</span>}
            <button className="btn btn-ghost" onClick={handleMarkAllRead} disabled={marking || loading}>
              <MailOpen size={13} className={marking ? 'spin' : ''} />
              {marking ? 'Marking…' : 'Mark All Read'}
            </button>
            <button className="btn btn-ghost" onClick={refresh} disabled={loading}>
              <RefreshCw size={13} className={loading ? 'spin' : ''} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, color: 'var(--text-2)', textAlign: 'center' }}>Loading emails…</div>
        ) : emails.length === 0 ? (
          <div className="empty" style={{ padding: 60 }}>
            <p>No emails found</p>
          </div>
        ) : (
          <div>
            {emails.map((email, i) => (
              <div
                key={email.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '220px 1fr auto',
                  alignItems: 'center',
                  gap: 16,
                  padding: '13px 20px',
                  borderBottom: i < emails.length - 1 ? '1px solid var(--border)' : 'none',
                  background: email.unread ? 'rgba(99,102,241,0.04)' : 'transparent',
                }}
              >
                {/* Sender */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                  {email.unread && <span className="dot dot-green" style={{ flexShrink: 0 }} />}
                  <span style={{
                    fontSize: 13,
                    fontWeight: email.unread ? 600 : 400,
                    color: 'var(--text)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {email.from.replace(/<.*>/, '').trim() || email.from}
                  </span>
                </div>

                {/* Subject + snippet */}
                <div style={{ overflow: 'hidden' }}>
                  <span style={{
                    fontSize: 13,
                    fontWeight: email.unread ? 600 : 400,
                    color: 'var(--text)',
                  }}>
                    {email.subject}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--text-2)', marginLeft: 8 }}>
                    — {email.snippet}
                  </span>
                </div>

                {/* Date */}
                <div style={{ fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {formatDate(email.date)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && emails.length > 0 && (
        <div className="pagination">
          <button className="btn btn-ghost" onClick={goPrev} disabled={currentPage === 0} style={{ padding: '6px 10px' }}>
            <ChevronLeft size={14} />
          </button>
          <span>Page {currentPage + 1}</span>
          <button className="btn btn-ghost" onClick={goNext} disabled={!nextToken} style={{ padding: '6px 10px' }}>
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d)) return dateStr
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
