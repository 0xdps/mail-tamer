import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { BookOpen, Inbox, History, Settings, LogOut, MailOpen } from 'lucide-react'
import { api } from './api'

const navItems = [
  { to: '/rules',    label: 'Rules',       icon: BookOpen  },
  { to: '/decisions',label: 'Decisions',   icon: Inbox     },
  { to: '/runs',     label: 'Run History', icon: History   },
  { to: '/emails',   label: 'Emails',      icon: MailOpen  },
  { to: '/control',  label: 'Control Panel', icon: Settings },
]

export default function Layout() {
  const navigate = useNavigate()

  const logout = async () => {
    await api.logout()
    navigate('/login')
  }

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="sidebar-logo">
          <img src="/logo-192.png" alt="Mail Tamer" style={{ width: 28, height: 28, objectFit: 'contain' }} />
          Mail Tamer
        </div>

        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}

        <div className="sidebar-footer">
          <button
            className="btn btn-ghost"
            style={{ width: '100%', justifyContent: 'flex-start', gap: 9, paddingLeft: 10, paddingRight: 10 }}
            onClick={logout}
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </nav>

      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
