import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { useUser } from '@/lib/user'

export function FavoriteButton({
  pokemonId,
  initial,
  className,
}: {
  pokemonId: number
  initial: boolean
  className?: string
}) {
  const user = useUser()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (target: boolean) => {
      if (!user) throw new Error('Sign in to save favorites')
      return target
        ? api.addFavorite(user.id, pokemonId)
        : api.removeFavorite(user.id, pokemonId)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pokemon-list'] })
      void queryClient.invalidateQueries({ queryKey: ['pokemon-detail'] })
      void queryClient.invalidateQueries({ queryKey: ['favorites'] })
    },
  })

  // Fully derived heart state: the persisted value, overridden optimistically
  // by the in-flight/last toggle and reverted on error. No state to sync.
  const favorite = mutation.isError ? initial : (mutation.variables ?? initial)

  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      disabled={!user || mutation.isPending}
      aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
      title={user ? undefined : 'Sign in to save favorites'}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        if (!user) return
        mutation.mutate(!favorite)
      }}
    >
      <Heart
        className={`transition-all ${favorite ? 'scale-110 fill-red-500 text-red-500' : 'text-muted-foreground'}`}
      />
    </Button>
  )
}
