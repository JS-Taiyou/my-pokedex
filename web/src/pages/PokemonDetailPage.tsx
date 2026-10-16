import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, HelpCircle, Ruler, Scale, ShieldCheck, VenetianMask } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { DetailSkeleton } from '@/components/Skeletons'
import { EvolutionChain } from '@/components/EvolutionChain'
import { FavoriteButton } from '@/components/FavoriteButton'
import { StatBar } from '@/components/StatBar'
import { TypeBadge } from '@/components/TypeBadge'
import { api } from '@/lib/api'
import type { WeaknessView } from '@/lib/types'
import { useUser } from '@/lib/user'

const sectionTitle =
  'text-sm font-semibold uppercase tracking-wide text-muted-foreground'

const FRACTION_GLYPHS: Record<string, string> = { '0.5': '½', '0.25': '¼' }

function MatchupBadge({ weakness }: { weakness: WeaknessView }) {
  const value = Number(weakness.modifier)

  let chip: string
  let tooltip: string
  if (value === 0) {
    chip = 'immune'
    tooltip = `Takes no damage from ${weakness.type.name}-type moves`
  } else if (value < 1) {
    chip = FRACTION_GLYPHS[weakness.modifier] ?? `×${weakness.modifier}`
    tooltip = `Damage from ${weakness.type.name}-type moves is divided by ${1 / value}`
  } else {
    chip = `×${weakness.modifier}`
    tooltip = `Takes ${weakness.modifier}× damage from ${weakness.type.name}-type moves`
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-default">
          <span
            className="inline-flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-xs font-semibold capitalize text-white"
            style={{
              background: `linear-gradient(135deg, ${weakness.type.colors[1] ?? weakness.type.colors[0]}, ${weakness.type.colors[0]})`,
            }}
          >
            <span className="rounded-full bg-black/30 px-1.5 py-0.5 tabular-nums">
              {chip}
            </span>
            {weakness.type.name}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Matchup table split by direction: multipliers above 1x are weaknesses
 * ("Weak against", always rendered — a shield icon when there are none),
 * below 1x are resistances/immunities ("Strong against", hidden when empty).
 */
function Matchups({ weaknesses }: { weaknesses: WeaknessView[] }) {
  const weak = weaknesses.filter((w) => Number(w.modifier) > 1)
  // most resilient first: immunities before resistances
  const strong = weaknesses
    .filter((w) => Number(w.modifier) < 1)
    .reverse()

  return (
    <>
      <div className="space-y-2">
        <h2 className={sectionTitle}>Weak against</h2>
        {weak.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="size-4 text-emerald-500" />
            None — no type deals super-effective damage
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {weak.map((weakness) => (
              <MatchupBadge key={weakness.type.id} weakness={weakness} />
            ))}
          </div>
        )}
      </div>

      {strong.length > 0 && (
        <div className="space-y-2">
          <h2 className={sectionTitle}>Strong against</h2>
          <div className="flex flex-wrap gap-1.5">
            {strong.map((weakness) => (
              <MatchupBadge key={weakness.type.id} weakness={weakness} />
            ))}
          </div>
        </div>
      )}
    </>
  )
}

const formatHeight = (decimeters: number | null): string =>
  decimeters === null ? '—' : `${(decimeters / 10).toFixed(1)} m`

const formatWeight = (hectograms: number | null): string =>
  hectograms === null ? '—' : `${(hectograms / 10).toFixed(1)} kg`

export default function PokemonDetailPage() {
  const { id } = useParams<{ id: string }>()
  const user = useUser()
  const detailQuery = useQuery({
    queryKey: ['pokemon-detail', id, user?.id],
    queryFn: () => api.pokemon(id!, user?.id),
    enabled: Boolean(id),
    retry: 1,
  })

  if (detailQuery.isLoading) {
    // Covers both ordinary loads and the first-visit wait while the backend
    // enriches this pokemon from PokeAPI into our database.
    return <DetailSkeleton />
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="flex flex-col items-center gap-4 py-24">
        <p className="text-muted-foreground">
          {(detailQuery.error as Error | undefined)?.message ?? 'Pokemon not found.'}
        </p>
        <Button variant="outline" asChild>
          <Link to="/">
            <ArrowLeft /> Back to the Pokédex
          </Link>
        </Button>
      </div>
    )
  }

  const pokemon = detailQuery.data

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pokemon.id}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, transition: { duration: 0.15 } }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="space-y-8"
      >
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">
              <ArrowLeft /> All pokemon
            </Link>
          </Button>
          <FavoriteButton
            pokemonId={pokemon.id}
            initial={pokemon.is_favorite}
            className="static"
          />
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="relative flex flex-col items-center justify-center gap-4 rounded-2xl border bg-gradient-to-b from-muted/40 to-background p-8"
          >
            {pokemon.image_url ? (
              <motion.img
                src={pokemon.image_url}
                alt={pokemon.name}
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
                className="size-64 object-contain drop-shadow-xl sm:size-72"
              />
            ) : (
              <div className="flex size-64 items-center justify-center rounded-full bg-muted/60 text-muted-foreground/50 sm:size-72">
                <HelpCircle className="size-16" />
              </div>
            )}
            <div className="flex flex-wrap justify-center gap-1.5">
              {pokemon.types.map((type) => (
                <TypeBadge key={type.id} type={type} className="px-3 py-1 text-sm" />
              ))}
            </div>
          </motion.div>

          <div className="space-y-8">
            <div className="space-y-1">
              <p className="text-sm tabular-nums text-muted-foreground">
                #{String(pokemon.id).padStart(4, '0')}
              </p>
              <h1 className="text-4xl font-bold capitalize">{pokemon.name}</h1>
              {pokemon.category && (
                <p className="text-muted-foreground">{pokemon.category}</p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col items-center gap-1 rounded-xl border p-3">
                <Ruler className="size-4 text-muted-foreground" />
                <span className="text-sm font-semibold">{formatHeight(pokemon.height)}</span>
                <span className="text-xs text-muted-foreground">Height</span>
              </div>
              <div className="flex flex-col items-center gap-1 rounded-xl border p-3">
                <Scale className="size-4 text-muted-foreground" />
                <span className="text-sm font-semibold">{formatWeight(pokemon.weight)}</span>
                <span className="text-xs text-muted-foreground">Weight</span>
              </div>
              <div className="flex flex-col items-center gap-1 rounded-xl border p-3">
                <VenetianMask className="size-4 text-muted-foreground" />
                <span className="text-sm font-semibold capitalize">
                  {pokemon.genders.length > 0 ? pokemon.genders.join(' / ') : '—'}
                </span>
                <span className="text-xs text-muted-foreground">Gender</span>
              </div>
            </div>

            {pokemon.stats.length > 0 && (
              <div className="space-y-2.5">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Base stats
                </h2>
                {pokemon.stats.map((stat, index) => (
                  <StatBar key={stat.name} stat={stat} index={index} />
                ))}
              </div>
            )}

            <Matchups weaknesses={pokemon.weaknesses} />

            {pokemon.abilities.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Abilities
                </h2>
                <div className="space-y-2.5">
                  {pokemon.abilities.map((ability) => (
                    <div key={ability.id}>
                      <p className="text-sm font-medium capitalize">
                        {ability.name.replace(/-/g, ' ')}
                        {ability.is_hidden && (
                          <span className="ml-2 text-xs text-muted-foreground">(hidden)</span>
                        )}
                      </p>
                      {ability.description && (
                        <p className="text-sm text-muted-foreground">{ability.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {pokemon.evolutions.length > 0 && (
          <>
            <Separator />
            <div className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Evolution chain
              </h2>
              <EvolutionChain stages={pokemon.evolutions} currentId={pokemon.id} />
            </div>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
