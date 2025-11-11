import { Outlet, Link, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import {
  Database,
  Server,
  Calendar,
  Terminal,
  Bell,
  FileText,
  Settings,
  LogOut,
  LayoutDashboard,
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Servers', href: '/servers', icon: Server },
  { name: 'Backups', href: '/backups', icon: Database },
  { name: 'Schedules', href: '/schedules', icon: Calendar },
  { name: 'Commands', href: '/commands', icon: Terminal },
  { name: 'Notifications', href: '/notifications', icon: Bell },
  { name: 'Audit Logs', href: '/audit-logs', icon: FileText },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export default function Layout() {
  const location = useLocation()
  const { user, logout } = useAuthStore()

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <div className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-xl font-bold">DB Backup Platform</h1>
          <p className="text-sm text-gray-400 mt-1">Enterprise Edition</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                <Icon size={20} />
                <span>{item.name}</span>
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center">
              <span className="text-sm font-medium">
                {user?.username.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.username}</p>
              <p className="text-xs text-gray-400 truncate">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 w-full px-3 py-2 text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
