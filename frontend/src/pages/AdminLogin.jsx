import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2, BarChart2 } from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { login as loginApi, getMe } from '../api/auth'

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { token, user, login: storeLogin } = useAuthStore()
  const navigate = useNavigate()

  if (token) {
    return <Navigate to={user?.role === 'ADMIN' ? '/admin' : '/tenant/dashboard'} replace />
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError('')
    try {
      const data = await loginApi(email, password)
      // Store token first so getMe() can attach the Authorization header
      localStorage.setItem('pfe_token', data.access_token)
      const fullUser = await getMe()
      storeLogin(data.access_token, fullUser)
      navigate(fullUser?.role === 'ADMIN' ? '/admin' : '/tenant/dashboard', { replace: true })
    } catch (err) {
      setError(err.response?.data?.detail || 'Email ou mot de passe incorrect')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#1B3A6B] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[#1B3A6B] rounded-2xl mb-4">
            <BarChart2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[#1B3A6B]">PriceWatch</h1>
          <p className="text-gray-500 text-sm mt-1">Connexion</p>
        </div>

        {error && (
          <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30 focus:border-[#1B3A6B] transition-colors"
              placeholder="admin@example.com"
              required
              autoFocus
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Mot de passe
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30 focus:border-[#1B3A6B] transition-colors"
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#1B3A6B] text-white text-sm font-medium rounded-xl hover:bg-[#152e58] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Connexion en cours…
              </>
            ) : (
              'Se connecter'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
