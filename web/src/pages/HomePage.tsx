import { useCallback, useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { Skeleton } from '@/components/ui/skeleton'
import { CardGridSkeleton } from '@/components/Skeletons'
import { PokemonCard } from '@/components/PokemonCard'
import { useArtworkPersist } from '@/hooks/use-artwork-persist'
import { api } from '@/lib/api'
import type { PokemonListResponse } from '@/lib/types'
import { useUser } from '@/lib/user'

const PAGE_SIZE = 24

/** Compact page window: first, last, and neighbours of the current page. */
function pageWindow(total: number, current: number): Array<number | 'ellipsis-l' | 'ellipsis-r'> {
  const pages = new Set<number>([1, total, current - 1, current, current + 1])
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  const out: Array<number | 'ellipsis-l' | 'ellipsis-r'> = []
  let previous = 0
  for (const page of sorted) {
    if (page - previous > 1) out.push(previous === 1 ? 'ellipsis-r' : 'ellipsis-l')
    out.push(page)
    previous = page
  }
  return out
}

/**
 * The URL is the single source of truth for view state: page, search and type
 * filter live in query params, so any view is shareable and survives
 * refresh/back/forward. Applying a filter always drops the page param
 * (back to page 1).
 */
export default function HomePage() {
  const user = useUser()
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const urlSearch = searchParams.get('search') ?? ''
  const type = searchParams.get('type') ?? undefined

  const [rawSearch, setRawSearch] = useState(urlSearch)

  // Keep the input in sync when the URL changes externally (back/forward).
  useEffect(() => setRawSearch(urlSearch), [urlSearch])

  // Debounced input -> URL. Committing (or clearing) a search resets the page.
  useEffect(() => {
    if (rawSearch === urlSearch) return
    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams)
      if (rawSearch) next.set('search', rawSearch)
      else next.delete('search')
      next.delete('page')
      setSearchParams(next, { replace: true })
    }, 300)
    return () => clearTimeout(timer)
  }, [rawSearch, urlSearch, searchParams, setSearchParams])

  const applyParams = useCallback(
    (mutate: (params: URLSearchParams) => void, replace = false): void => {
      const next = new URLSearchParams(searchParams)
      mutate(next)
      setSearchParams(next, { replace })
    },
    [searchParams, setSearchParams],
  )

  const setTypeFilter = useCallback(
    (name: string | undefined): void =>
      applyParams((next) => {
        if (name) next.set('type', name)
        else next.delete('type')
        next.delete('page')
      }),
    [applyParams],
  )

  const goToPage = useCallback(
    (nextPage: number): void =>
      applyParams((next) => {
        if (nextPage > 1) next.set('page', String(nextPage))
        else next.delete('page')
      }),
    [applyParams],
  )

  // Real hrefs for the pagination anchors (shareable, middle-clickable);
  // clicks stay client-side.
  const pageHref = useCallback(
    (p: number): string => {
      const next = new URLSearchParams(searchParams)
      if (p > 1) next.set('page', String(p))
      else next.delete('page')
      const qs = next.toString()
      return qs ? `/?${qs}` : '/'
    },
    [searchParams],
  )

  const listQueryKey = useMemo(
    () => ['pokemon-list', { page, search: urlSearch, type, user: user?.id }] as const,
    [page, urlSearch, type, user?.id],
  )
  const offset = (page - 1) * PAGE_SIZE
  const listQuery = useQuery({
    queryKey: listQueryKey,
    queryFn: () =>
      api.listPokemon({
        limit: PAGE_SIZE,
        offset,
        search: urlSearch || undefined,
        type,
        user: user?.id,
      }),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => {
      const data = query.state.data as PokemonListResponse | undefined
      return data?.results.some((card) => !card.is_cached) ? 5000 : false
    },
  })
  const typesQuery = useQuery({
    queryKey: ['types'],
    queryFn: () => api.types(),
    staleTime: Infinity,
  })

  const reportArtwork = useArtworkPersist()

  const results = listQuery.data?.results ?? []
  const totalPages = listQuery.data
    ? Math.max(1, Math.ceil(listQuery.data.count / PAGE_SIZE))
    : 1

  // A stale URL can point past the last page (e.g. after data changes) —
  // correct it once real data arrives. Fully declared deps + idempotent
  // guard, so it settles without looping.
  useEffect(() => {
    if (listQuery.data && !listQuery.isPlaceholderData && page > totalPages) {
      goToPage(totalPages)
    }
  }, [page, totalPages, listQuery.data, listQuery.isPlaceholderData, goToPage])

  const window_ = useMemo(() => pageWindow(totalPages, page), [totalPages, page])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={rawSearch}
            onChange={(event) => setRawSearch(event.target.value)}
            placeholder="Search by name…"
            className="pl-9 pr-9"
          />
          {rawSearch && (
            <button
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setRawSearch('')}
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant={type === undefined ? 'default' : 'outline'}
            size="sm"
            className="h-7 rounded-full px-3 text-xs"
            onClick={() => setTypeFilter(undefined)}
          >
            all
          </Button>
          {(typesQuery.data ?? []).map((badge) => {
            const active = type === badge.name
            return (
              <button
                key={badge.id}
                className={`rounded-full px-3 py-1 text-xs font-semibold capitalize text-white transition-transform hover:scale-105 ${
                  active ? 'ring-2 ring-foreground ring-offset-1' : 'opacity-80 hover:opacity-100'
                }`}
                style={{
                  background: `linear-gradient(135deg, ${badge.colors[1] ?? badge.colors[0]}, ${badge.colors[0]})`,
                }}
                onClick={() => setTypeFilter(active ? undefined : badge.name)}
              >
                {badge.name}
              </button>
            )
          })}
          {typesQuery.isLoading &&
            Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-16 rounded-full" />
            ))}
        </div>
      </div>

      {listQuery.isLoading ? (
        <CardGridSkeleton count={12} />
      ) : listQuery.isError ? (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <p>Couldn't load pokemon: {(listQuery.error as Error).message}</p>
          <Button variant="outline" size="sm" onClick={() => void listQuery.refetch()}>
            Try again
          </Button>
        </div>
      ) : results.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          No pokemon match{urlSearch ? ` “${urlSearch}”` : ''}
          {type ? ` with type ${type}` : ''}.
        </div>
      ) : (
        <motion.div
          animate={{ opacity: listQuery.isPlaceholderData ? 0.55 : 1 }}
          transition={{ duration: 0.15 }}
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
        >
          {results.map((pokemon, index) => (
            <PokemonCard
              key={pokemon.id}
              pokemon={pokemon}
              index={index}
              onArtworkLoaded={reportArtwork}
            />
          ))}
        </motion.div>
      )}

      {totalPages > 1 && (
        <Pagination className="pt-2">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href={pageHref(Math.max(1, page - 1))}
                aria-disabled={page === 1}
                className={page === 1 ? 'pointer-events-none opacity-50' : ''}
                onClick={(event) => {
                  event.preventDefault()
                  goToPage(Math.max(1, page - 1))
                }}
              />
            </PaginationItem>
            {window_.map((item, index) =>
              typeof item === 'number' ? (
                <PaginationItem key={item}>
                  <PaginationLink
                    href={pageHref(item)}
                    isActive={item === page}
                    onClick={(event) => {
                      event.preventDefault()
                      goToPage(item)
                    }}
                  >
                    {item}
                  </PaginationLink>
                </PaginationItem>
              ) : (
                <PaginationItem key={`${item}-${index}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <PaginationNext
                href={pageHref(Math.min(totalPages, page + 1))}
                aria-disabled={page === totalPages}
                className={page === totalPages ? 'pointer-events-none opacity-50' : ''}
                onClick={(event) => {
                  event.preventDefault()
                  goToPage(Math.min(totalPages, page + 1))
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  )
}
