import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { BookOpen, Inbox, History, Settings, Mail, LogOut, MailOpen } from 'lucide-react'
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
          <Mail size={20} />
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
          <button className="nav-item btn" style={{ width: '100%', background: 'none', border: 'none', fontSize: 14 }} onClick={logout}>
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
