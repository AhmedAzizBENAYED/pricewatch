const COLORS = {
  navy:  { border: 'border-[#1B3A6B]', icon: 'text-[#1B3A6B]', bg: 'bg-[#1B3A6B]/10' },
  blue:  { border: 'border-blue-500',  icon: 'text-blue-500',  bg: 'bg-blue-50'       },
  teal:  { border: 'border-teal-500',  icon: 'text-teal-500',  bg: 'bg-teal-50'       },
  amber: { border: 'border-amber-500', icon: 'text-amber-700', bg: 'bg-amber-50'      },
  red:   { border: 'border-red-500',   icon: 'text-red-600',   bg: 'bg-red-50'        },
  gray:  { border: 'border-gray-300',  icon: 'text-gray-400',  bg: 'bg-gray-50'       },
}

export default function StatCard({ icon: Icon, value, label, color = 'gray', sub }) {
  const { border, icon: iconColor, bg } = COLORS[color] ?? COLORS.gray
  return (
    <div className={`bg-white rounded-xl shadow-sm border-l-4 ${border} p-5 flex items-start justify-between`}>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1 leading-none">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </div>
      <div className={`p-2 rounded-lg flex-shrink-0 ${bg}`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
    </div>
  )
}

export function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-xl shadow-sm border-l-4 border-gray-200 p-5 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <div className="h-3 bg-gray-200 rounded w-24" />
          <div className="h-7 bg-gray-200 rounded w-16" />
          <div className="h-3 bg-gray-200 rounded w-20" />
        </div>
        <div className="w-9 h-9 bg-gray-200 rounded-lg" />
      </div>
    </div>
  )
}
