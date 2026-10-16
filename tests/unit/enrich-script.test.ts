import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/db.js', () => ({
  sql: Object.assign(vi.fn(), { end: vi.fn().mockResolvedValue(undefined) }),
}))
vi.mock('../../src/services/enrichment.js', () => ({
  enrichPokemon: vi.fn(),
}))

import { sql } from '../../src/db.js'
import { enrichPokemon } from '../../src/services/enrichment.js'

const mockedSql = vi.mocked(sql)
const mockedEnrich = vi.mocked(enrichPokemon)

beforeEach(() => {
  mockedSql.mockReset()
  mockedEnrich.mockReset().mockResolvedValue(undefined)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

/** Imports the enrich script fresh; it runs main() on import with argv set. */
async function runEnrich(argv: string[]): Promise<void> {
  vi.resetModules()
  const previous = process.argv
  process.argv = ['node', 'enrich.ts', ...argv]
  try {
    await import('../../src/scripts/enrich.js')
  } finally {
    process.argv = previous
  }
}

describe('enrich script', () => {
  it('enriches the requested number of uncached pokemon and reports progress', async () => {
    mockedSql.mockImplementation(((strings: TemplateStringsArray) => {
      const query = strings.join('$?')
      if (query.includes('not is_cached') && query.includes('limit')) {
        return Promise.resolve([{ id: 1 }, { id: 2 }])
      }
      return Promise.resolve([])
    }) as never)

    await runEnrich(['2'])
    await vi.waitFor(() =>
      expect(vi.mocked(console.log)).toHaveBeenCalledWith(
        expect.stringContaining('Done. enriched=2'),
      ),
    )
    expect(mockedEnrich).toHaveBeenCalledTimes(2)
  })

  it('rejects invalid arguments', async () => {
    await runEnrich(['zero'])
    await vi.waitFor(() => expect(vi.mocked(console.error)).toHaveBeenCalled())
    const error = vi.mocked(console.error).mock.calls[0][0] as Error
    expect(error.message).toContain('Usage')
    expect(mockedEnrich).not.toHaveBeenCalled()
  })
})
