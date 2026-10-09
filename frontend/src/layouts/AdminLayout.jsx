import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Building2, Globe, Tag, FolderOpen,
  RefreshCw, GitMerge, BarChart2, Shield, LogOut,
} from 'lucide-react'
import { useAuthStore } from '../store/auth'

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Vue d'ensemble", path: '/admin' },
  { icon: Building2,       label: 'Tenants',        path: '/admin/tenants' },
  { icon: Globe,           label: 'Sources',         path: '/admin/sources' },
  { icon: Tag,             label: 'Marques',         path: '/admin/brands' },
  { icon: FolderOpen,      label: 'Catégories',      path: '/admin/categories' },
  { icon: RefreshCw,       label: 'Scraping',        path: '/admin/scrapers' },
  { icon: GitMerge,        label: 'Matching',        path: '/admin/matching' },
  { icon: BarChart2,       label: 'Statistiques',    path: '/admin/stats' },
  { icon: Shield,          label: 'Audit',           path: '/admin/audit' },
]

const PAGE_TITLES = {
  '/admin':            "Vue d'ensemble",
  '/admin/tenants':    'Tenants',
  '/admin/sources':    'Sources',
  '/admin/brands':     'Marques',
  '/admin/categories': 'Catégories',
  '/admin/scrapers':   'Scraping',
  '/admin/matching':   'Matching',
  '/admin/stats':      'Statistiques',
  '/admin/audit':      'Audit',
}

export default function AdminLayout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  const pageTitle = PAGE_TITLES[location.pathname] || 'PriceWatch Admin'
  const initials = user?.nom?.charAt(0)?.toUpperCase() ?? '?'

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="fixed top-0 left-0 h-screen w-60 bg-[#1B3A6B] flex flex-col z-10">
        {/* Brand */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
          <div className="flex items-center justify-center w-9 h-9 bg-blue-500 rounded-lg flex-shrink-0">
            <BarChart2 className="w-5 h-5 text-white" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-base leading-none">PriceWatch</span>
            <span className="text-xs font-medium bg-blue-500 text-white px-1.5 py-0.5 rounded">
              Admin
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ icon: Icon, label, path }) => {
            const isActive =
              path === '/admin'
                ? location.pathname === '/admin'
                : location.pathname.startsWith(path)

            return (
              <NavLink
                key={path}
                to={path}
                className={
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ` +
                  (isActive
                    ? 'border-l-4 border-blue-400 bg-white/10 text-white pl-2'
                    : 'text-blue-200 hover:bg-white/10 hover:text-white')
                }
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </NavLink>
            )
          })}
        </nav>

        {/* User footer */}
        <div className="px-4 py-4 border-t border-white/10 flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 bg-blue-500 rounded-full flex-shrink-0 text-white text-sm font-bold">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{user?.nom}</p>
            <p className="text-blue-200 text-xs">Administrateur</p>
          </div>
          <button
            onClick={handleLogout}
            title="Se déconnecter"
            className="text-blue-300 hover:text-white transition-colors flex-shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 ml-60 flex flex-col min-h-screen">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-white border-b border-gray-200 h-16 flex items-center justify-between px-6">
          <h1 className="text-xl font-semibold text-gray-800">{pageTitle}</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700">{user?.nom}</span>
            <span className="text-xs font-medium bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full">
              Administrateur
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 bg-gray-50 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
