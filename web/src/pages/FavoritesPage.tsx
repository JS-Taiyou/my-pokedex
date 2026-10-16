import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { Heart, HeartCrack, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CardGridSkeleton } from '@/components/Skeletons'
import { PokemonCard } from '@/components/PokemonCard'
import { useArtworkPersist } from '@/hooks/use-artwork-persist'
import { api } from '@/lib/api'
import type { PokemonListResponse } from '@/lib/types'
import { useUser } from '@/lib/user'

export default function FavoritesPage() {
  const user = useUser()
  const favoritesQueryKey = useMemo(
    () => ['favorites', user?.id] as const,
    [user?.id],
  )
  const favoritesQuery = useQuery({
    queryKey: favoritesQueryKey,
    queryFn: () => api.favorites(user!.id),
    enabled: Boolean(user),
    // Poll gently while any favorite is still un-enriched — the server's
    // background enricher fills the database, we just pick it up.
    refetchInterval: (query) => {
      const data = query.state.data as PokemonListResponse | undefined
      return data?.results.some((card) => !card.is_cached) ? 5000 : false
    },
  })

  const reportArtwork = useArtworkPersist()
  const favorites = favoritesQuery.data?.results ?? []

  if (!user) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center text-muted-foreground">
        <UserRound className="size-10" />
        <p>Sign in from the header to keep your favorite pokemon here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">
        {user.name}&rsquo;s favorites
      </h1>
      {favoritesQuery.isLoading ? (
        <CardGridSkeleton count={6} />
      ) : favoritesQuery.isError ? (
        <p className="py-12 text-center text-muted-foreground">
          Couldn't load favorites: {(favoritesQuery.error as Error).message}
        </p>
      ) : favorites.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 text-muted-foreground">
          <HeartCrack className="size-10" />
          <p>No favorites yet.</p>
          <Button variant="outline" asChild>
            <Link to="/">
              <Heart /> Catch some favorites
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {favorites.map((pokemon, index) => (
            <PokemonCard
              key={pokemon.id}
              pokemon={pokemon}
              index={index}
              onArtworkLoaded={reportArtwork}
            />
          ))}
        </div>
      )}
    </div>
  )
}
