import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const PLAN_ORDER = { BASIC: 0, MEDIUM: 1, PREMIUM: 2 }

export const useAuthStore = create(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      login: (token, user) => {
        localStorage.setItem('pfe_token', token)
        set({ token, user })
      },
      logout: () => {
        localStorage.removeItem('pfe_token')
        localStorage.removeItem('pfe_auth')
        set({ token: null, user: null })
      },
      isPremium: () => get().user?.plan_abonnement === 'PREMIUM',
      isMediumOrAbove: () =>
        (PLAN_ORDER[get().user?.plan_abonnement] ?? 0) >= PLAN_ORDER.MEDIUM,
      isMarque: () => get().user?.profil_client === 'MARQUE',
      isSiteEcommerce: () => get().user?.profil_client === 'SITE_ECOMMERCE',
    }),
    {
      name: 'pfe_auth',
      partialize: (state) => ({ token: state.token, user: state.user }),
    }
  )
)
