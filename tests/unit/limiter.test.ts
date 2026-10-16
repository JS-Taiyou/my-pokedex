import { describe, expect, it } from 'vitest'
import { Limiter } from '../../src/services/pokeapi'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

describe('Limiter', () => {
  it('never exceeds max concurrent tasks', async () => {
    const limiter = new Limiter(2)
    let running = 0
    let peak = 0
    await Promise.all(
      Array.from({ length: 12 }).map(() =>
        limiter.run(async () => {
          running++
          peak = Math.max(peak, running)
          await sleep(5)
          running--
        }),
      ),
    )
    expect(peak).toBe(2)
  })

  it('keeps working after many queued bursts (slot-handoff regression)', async () => {
    const limiter = new Limiter(2)
    // Several rounds of tasks that queue behind each other — the old
    // implementation leaked a slot per handoff and deadlocked here.
    for (let round = 0; round < 20; round++) {
      await Promise.all(
        Array.from({ length: 6 }).map((i) => limiter.run(async () => i)),
      )
    }
    // After all the churn, a fresh task must still be granted a slot.
    const result = await limiter.run(async () => 'still-alive')
    expect(result).toBe('still-alive')
  })
})
