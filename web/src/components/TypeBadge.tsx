import { memo } from 'react'
import type { TypeBadge as TypeBadgeData } from '@/lib/types'

export const TypeBadge = memo(function TypeBadge({
  type,
  className,
}: {
  type: TypeBadgeData
  className?: string
}) {
  const [primary, tint] = type.colors
  const background = tint
    ? `linear-gradient(135deg, ${tint}, ${primary})`
    : (primary ?? '#68A090')
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize text-white shadow-sm ${className ?? ''}`}
      style={{ background }}
    >
      {type.name}
    </span>
  )
})
