import { motion } from 'motion/react'
import type { StatView } from '@/lib/types'

// Per-stat maxima across all pokemon — used only to scale the bars visually.
const STAT_MAX: Record<string, number> = {
  hp: 255,
  attack: 190,
  defense: 250,
  'special-attack': 194,
  'special-defense': 250,
  speed: 180,
}

const LABELS: Record<string, string> = {
  hp: 'HP',
  attack: 'Attack',
  defense: 'Defense',
  'special-attack': 'Sp. Atk',
  'special-defense': 'Sp. Def',
  speed: 'Speed',
}

export function StatBar({ stat, index }: { stat: StatView; index: number }) {
  const max = STAT_MAX[stat.name] ?? 255
  const percent = Math.min(100, (stat.value / max) * 100)
  return (
    <div className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-3">
      <span className="text-sm text-muted-foreground">
        {LABELS[stat.name] ?? stat.name}
      </span>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-red-500 to-orange-400"
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ delay: 0.15 + index * 0.08, duration: 0.5, ease: 'easeOut' }}
        />
      </div>
      <span className="text-right text-sm font-semibold tabular-nums">{stat.value}</span>
    </div>
  )
}
