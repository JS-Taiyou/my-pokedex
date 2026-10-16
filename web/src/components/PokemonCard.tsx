import { memo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { Card, CardContent } from '@/components/ui/card'
import { ArtworkImage } from '@/components/ArtworkImage'
import { FavoriteButton } from '@/components/FavoriteButton'
import { TypeBadge } from '@/components/TypeBadge'
import type { PokemonCardData } from '@/lib/types'

interface PokemonCardProps {
  pokemon: PokemonCardData
  index?: number
  onArtworkLoaded?: (id: number) => void
}

function PokemonCardImpl({ pokemon, index = 0, onArtworkLoaded }: PokemonCardProps) {
  // Pattern-derived guess that actually loaded → persist it.
  const handleArtworkLoaded = useCallback(() => {
    if (pokemon.image_provisional) onArtworkLoaded?.(pokemon.id)
  }, [pokemon.id, pokemon.image_provisional, onArtworkLoaded])

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.45), duration: 0.3, ease: 'easeOut' }}
      whileHover={{ y: -4 }}
    >
      <Card className="group relative h-full transition-shadow hover:shadow-lg">
        <FavoriteButton
          pokemonId={pokemon.id}
          initial={pokemon.is_favorite}
          className="absolute right-1.5 top-1.5 z-10 opacity-80 hover:opacity-100"
        />
        <Link to={`/pokemon/${pokemon.id}`} className="block">
          <CardContent className="flex flex-col items-center gap-2 p-4">
            <ArtworkImage
              src={pokemon.image_url}
              alt={pokemon.name}
              containerClassName="size-28"
              iconClassName="size-8"
              imgClassName="group-hover:scale-105"
              onLoaded={handleArtworkLoaded}
            />
            <p className="text-xs tabular-nums text-muted-foreground">
              #{String(pokemon.id).padStart(4, '0')}
            </p>
            <p className="line-clamp-1 font-semibold capitalize">{pokemon.name}</p>
            <div className="flex flex-wrap justify-center gap-1">
              {pokemon.types.map((type) => (
                <TypeBadge key={type.id} type={type} />
              ))}
            </div>
          </CardContent>
        </Link>
      </Card>
    </motion.div>
  )
}

/**
 * Memoized with a field comparator: the 5s polling refetch recreates every
 * card object, and shallow identity would defeat memo — but re-rendering is
 * only needed when a rendered field actually changed.
 */
function cardPropsEqual(prev: PokemonCardProps, next: PokemonCardProps): boolean {
  const a = prev.pokemon
  const b = next.pokemon
  return (
    prev.index === next.index &&
    prev.onArtworkLoaded === next.onArtworkLoaded &&
    a.id === b.id &&
    a.name === b.name &&
    a.image_url === b.image_url &&
    a.image_provisional === b.image_provisional &&
    a.is_cached === b.is_cached &&
    a.is_favorite === b.is_favorite &&
    (a.types === b.types ||
      (a.types.length === b.types.length &&
        a.types.every((t, i) => t.id === b.types[i]?.id && t.name === b.types[i]?.name)))
  )
}

export const PokemonCard = memo(PokemonCardImpl, cardPropsEqual)
