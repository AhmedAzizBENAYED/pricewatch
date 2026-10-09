import { Lock } from 'lucide-react'
import { useAuthStore } from '../../store/auth'

const PLAN_STYLES = {
  PREMIUM: 'bg-amber-100 text-amber-700',
  MEDIUM:  'bg-blue-100  text-blue-700',
  BASIC:   'bg-gray-100  text-gray-600',
}

export default function PlanLocked({ requiredPlan, featureName }) {
  const user = useAuthStore((s) => s.user)
  const currentPlan = user?.plan_abonnement ?? 'BASIC'

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-6">
        <Lock className="w-8 h-8 text-gray-400" />
      </div>
      <h2 className="text-xl font-semibold text-gray-800 mb-2">
        Fonctionnalité {featureName}
      </h2>
      <p className="text-gray-500 text-sm mb-6">
        Disponible à partir du plan{' '}
        <span className="font-semibold">{requiredPlan}</span>
      </p>
      <div className="flex items-center gap-3 mb-8">
        <span className="text-xs text-gray-400">Votre plan actuel :</span>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${PLAN_STYLES[currentPlan] ?? PLAN_STYLES.BASIC}`}>
          {currentPlan}
        </span>
      </div>
      <a
        href="#"
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
      >
        Mettre à niveau →
      </a>
    </div>
  )
}
