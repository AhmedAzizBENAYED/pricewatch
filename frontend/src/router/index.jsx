import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import Cover from '../pages/Cover'
import Login from '../pages/Login'
import AdminLogin from '../pages/AdminLogin'
import AdminLayout from '../layouts/AdminLayout'
import TenantLayout from '../layouts/TenantLayout'
import Overview from '../pages/admin/Overview'
import Tenants from '../pages/admin/Tenants'
import TenantDetail from '../pages/admin/TenantDetail'
import Sources from '../pages/admin/Sources'
import Brands from '../pages/admin/Brands'
import Categories from '../pages/admin/Categories'
import Scrapers from '../pages/admin/Scrapers'
import Matching from '../pages/admin/Matching'
import MatchingDetail from '../pages/admin/MatchingDetail'
import Stats from '../pages/admin/Stats'
import Audit from '../pages/admin/Audit'
import TenantDashboard from '../pages/tenant/Dashboard'
import Products from '../pages/tenant/Products'
import ProductDetail from '../pages/tenant/ProductDetail'
import Events from '../pages/tenant/Events'
import OfferDetail from '../pages/tenant/OfferDetail'
import Positioning from '../pages/tenant/Positioning'
import Analysis from '../pages/tenant/Analysis'
import AlertConfig from '../pages/tenant/AlertConfig'
import Alerts from '../pages/tenant/Alerts'
import Profile from '../pages/tenant/Profile'
import Reports from '../pages/tenant/Reports'
import Assistant from '../pages/tenant/Assistant'
import Scope from '../pages/tenant/Scope'

function RequireAdmin() {
  const { user, token } = useAuthStore()
  if (!token) return <Navigate to="/admin/login" replace />
  if (user?.role !== 'ADMIN') return <Navigate to="/tenant/dashboard" replace />
  return <Outlet />
}

function RequireTenant() {
  const { user, token } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  if (user?.role === 'ADMIN') return <Navigate to="/admin" replace />
  return <TenantLayout />
}

function RequireRole({ roles, children }) {
  const user = useAuthStore((s) => s.user)
  if (!roles.includes(user?.role)) return <Navigate to="/tenant/dashboard" replace />
  return children
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Cover />,
  },
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/admin/login',
    element: <AdminLogin />,
  },
  {
    path: '/admin',
    element: <RequireAdmin />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { index: true,           element: <Overview /> },
          { path: 'tenants',       element: <Tenants /> },
          { path: 'tenants/:id',   element: <TenantDetail /> },
          { path: 'sources',       element: <Sources /> },
          { path: 'brands',        element: <Brands /> },
          { path: 'categories',    element: <Categories /> },
          { path: 'scrapers',      element: <Scrapers /> },
          { path: 'matching',      element: <Matching /> },
          { path: 'matching/:id',  element: <MatchingDetail /> },
          { path: 'stats',         element: <Stats /> },
          { path: 'audit',         element: <Audit /> },
        ],
      },
    ],
  },
  {
    path: '/tenant',
    element: <RequireTenant />,
    children: [
      { index: true,                   element: <Navigate to="/tenant/dashboard" replace /> },
      { path: 'dashboard',             element: <TenantDashboard /> },
      { path: 'products',              element: <Products /> },
      { path: 'products/:id',          element: <ProductDetail /> },
      { path: 'offers/:id',            element: <OfferDetail /> },
      { path: 'events',                element: <Events /> },
      { path: 'alerts',                element: <Alerts /> },
      { path: 'positioning',           element: <RequireRole roles={['RESP_MARKETING', 'MANAGER']}><Positioning /></RequireRole> },
      { path: 'analysis',              element: <RequireRole roles={['RESP_MARKETING', 'MANAGER']}><Analysis /></RequireRole> },
      { path: 'reports',               element: <RequireRole roles={['RESP_MARKETING', 'MANAGER']}><Reports /></RequireRole> },
      { path: 'assistant',             element: <RequireRole roles={['RESP_MARKETING', 'MANAGER']}><Assistant /></RequireRole> },
      { path: 'settings/alerts',       element: <RequireRole roles={['RESP_MARKETING']}><AlertConfig /></RequireRole> },
      { path: 'settings/scope',        element: <RequireRole roles={['RESP_MARKETING']}><Scope /></RequireRole> },
      { path: 'profile',               element: <Profile /> },
    ],
  },
])
