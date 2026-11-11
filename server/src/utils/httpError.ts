import type { Request, Response } from 'express';

export function fail(req: Request, res: Response, error: unknown, status = 500): void {
  req.log.error({ err: error, route: `${req.method} ${req.baseUrl}${req.path}` }, 'request failed');
  res.status(status).json({ error: 'Something went wrong. Please try again.', request_id: req.id });
}
