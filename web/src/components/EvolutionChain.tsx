import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { ChevronRight } from 'lucide-react'
import { ArtworkImage } from '@/components/ArtworkImage'
import type { EvolutionStageView } from '@/lib/types'

export function EvolutionChain({
  stages,
  currentId,
}: {
  stages: EvolutionStageView[]
  currentId: number
}) {
  if (stages.length === 0) return null
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {stages.map((stage, index) => (
        <div key={stage.id} className="flex items-center gap-2">
          {index > 0 && <ChevronRight className="size-4 text-muted-foreground" />}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.12, duration: 0.3 }}
          >
            <Link
              to={`/pokemon/${stage.id}`}
              className={`flex w-24 flex-col items-center gap-1 rounded-xl border p-3 transition-colors hover:bg-accent ${
                stage.id === currentId ? 'border-red-400 bg-red-500/5' : ''
              }`}
            >
              <ArtworkImage
                src={stage.image_url}
                alt={stage.name}
                containerClassName="size-16"
                iconClassName="size-5"
              />
              <span className="line-clamp-1 text-xs font-medium capitalize">{stage.name}</span>
            </Link>
          </motion.div>
        </div>
      ))}
    </div>
  )
}
