/**
 * PokeAPI's official-artwork sprites follow a fixed id-based pattern, e.g.
 * .../official-artwork/1000.png. We use it as a best-effort guess for
 * pokemon that have not been enriched yet: the client renders the derived
 * url, and when it actually loads we persist it via
 * POST /api/pokemon/image-urls. Enrichment later overwrites the guess with
 * the URL straight from the API payload.
 */
export const ARTWORK_BASE_URL =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork'

// Form ids verified to have no artwork upstream at all (no official artwork
// and no front_default sprite) — the pattern would 404 for these, so we
// never derive or persist a guess for them. Enrichment is unaffected: it
// stores whatever the API actually provides (null included).
export const SPRITELESS_IDS: ReadonlySet<number> = new Set([10264, 10266, 10268, 10270])

export function provisionalArtworkUrl(id: number): string {
  return `${ARTWORK_BASE_URL}/${id}.png`
}

/** Pattern-derived url, or null for pokemon known to have no artwork. */
export function provisionalArtworkFor(id: number): string | null {
  return SPRITELESS_IDS.has(id) ? null : provisionalArtworkUrl(id)
}

/** Attach the derived artwork + a provisional flag to a list row. */
export function withProvisionalArtwork<T extends { id: number; image_url: string | null }>(
  row: T,
): T & { image_url: string | null; image_provisional: boolean } {
  const derived = provisionalArtworkFor(row.id)
  return {
    ...row,
    image_url: row.image_url ?? derived,
    image_provisional: row.image_url === null && derived !== null,
  }
}
