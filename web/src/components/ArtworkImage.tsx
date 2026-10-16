import { useState } from 'react'
import { HelpCircle } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Artwork <img> that can't get stuck: besides onLoad/onError it checks
 * node.complete in the ref callback, so images satisfied from the browser
 * cache (where load events can fire before handlers attach) still resolve.
 * Renders a round skeleton while loading and a placeholder icon on failure.
 */
export function ArtworkImage({
  src,
  alt,
  containerClassName,
  iconClassName,
  imgClassName,
  onLoaded,
  onError,
}: {
  src: string | null | undefined
  alt: string
  containerClassName: string
  iconClassName: string
  imgClassName?: string
  onLoaded?: () => void
  onError?: () => void
}) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center rounded-full bg-muted/60 text-muted-foreground/50 ${containerClassName}`}
      >
        <HelpCircle className={iconClassName} />
      </div>
    )
  }

  return (
    <div className={`relative flex items-center justify-center ${containerClassName}`}>
      {!loaded && <Skeleton className="absolute inset-0 rounded-full" />}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        ref={(node) => {
          if (node?.complete) {
            if (node.naturalWidth === 0) {
              setFailed(true)
              onError?.()
            } else {
              setLoaded(true)
              onLoaded?.()
            }
          }
        }}
        onLoad={() => {
          setLoaded(true)
          onLoaded?.()
        }}
        onError={() => {
          setFailed(true)
          onError?.()
        }}
        className={`object-contain transition-opacity duration-300 ${containerClassName} ${imgClassName ?? ''} ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  )
}
