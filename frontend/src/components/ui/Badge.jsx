const VARIANTS = {
  success: { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
  warning: { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
  danger:  { bg: 'bg-red-100',   text: 'text-red-700',   dot: 'bg-red-500'   },
  info:    { bg: 'bg-blue-100',  text: 'text-blue-700',  dot: 'bg-blue-500'  },
  gray:    { bg: 'bg-gray-100',  text: 'text-gray-600',  dot: 'bg-gray-400'  },
}

export default function Badge({ variant = 'gray', label }) {
  const { bg, text, dot } = VARIANTS[variant] ?? VARIANTS.gray
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${bg} ${text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
      {label}
    </span>
  )
}
