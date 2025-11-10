import { ReactNode } from 'react'
import { Home, Mail, Shield, Users, BarChart3 } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

interface LayoutProps {
  children: ReactNode
  role?: string
}

export default function Layout({ children, role }: LayoutProps) {
  const location = useLocation()

  const getRoleColor = () => {
    switch (role) {
      case 'phisher':
        return 'bg-rose-600'
      case 'leader':
        return 'bg-indigo-600'
      case 'citizen':
        return 'bg-emerald-600'
      case 'admin':
        return 'bg-purple-600'
      default:
        return 'bg-gray-800'
    }
  }

  const getRoleName = () => {
    switch (role) {
      case 'phisher':
        return '钓鱼大师 · InfoPhisher'
      case 'leader':
        return '城市领袖 · InfoLeader'
      case 'citizen':
        return '普通市民 · InfoCitizen'
      case 'admin':
        return '主持人 / 管理员'
      default:
        return '信息战场 InfoBattle'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className={`${getRoleColor()} text-white shadow-lg`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Shield className="h-8 w-8 mr-2" />
              <span className="font-bold text-xl">{getRoleName()}</span>
            </div>
            <div className="flex space-x-4">
              <Link
                to="/"
                className={`px-3 py-2 rounded-md text-sm font-medium hover:bg-white/10 transition ${
                  location.pathname === '/' ? 'bg-white/20' : ''
                }`}
              >
                <Home className="h-5 w-5 inline mr-1" />
                首页
              </Link>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  )
}
