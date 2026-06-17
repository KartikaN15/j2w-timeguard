import type { Request, Response, NextFunction, RequestHandler } from 'express'

// Wraps an async route handler so thrown errors hit the global error middleware.
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next)
  }
}
