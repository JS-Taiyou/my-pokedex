import type { z } from 'zod'
import { ApiError } from './errors.js'

const describeIssues = (error: z.ZodError): string =>
  error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ')

export function parseWith<T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input)
  if (!result.success) throw new ApiError(400, describeIssues(result.error))
  return result.data
}

/** `?param=` (empty) should behave the same as the param being absent. */
export function emptyToUndefined(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new ApiError(400, 'Request body must be valid JSON')
  }
}
