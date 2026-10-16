import type { ContentfulStatusCode } from 'hono/utils/http-status'

export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const notFound = (what: string): ApiError => new ApiError(404, `${what} not found`)
export const badRequest = (message: string): ApiError => new ApiError(400, message)
