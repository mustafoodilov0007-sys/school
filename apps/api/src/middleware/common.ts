import { ErrorCode } from '@pep/shared';
import type { ApiErrorBody } from '@pep/shared';
import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import type { Logger } from 'pino';
import { AppError } from '../lib/errors';

/** async handler'dagi xatolarni Express xato middleware'iga uzatadi (Express 4). */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export const notFoundHandler: RequestHandler = (_req, res) => {
  const body: ApiErrorBody = { error: { code: ErrorCode.NOT_FOUND, message: 'Manzil topilmadi' } };
  res.status(404).json(body);
};

/** Yagona xato formati. Ichki xato tafsilotlari (stack, SQL, sirlar) mijozga HECH QACHON chiqmaydi. */
export const errorHandler = (logger: Logger): ErrorRequestHandler => (err, req, res, _next) => {
  const requestId = String((req as Request & { id?: unknown }).id ?? '');
  if (err instanceof AppError) {
    if (err.status >= 500) logger.error({ err, requestId }, 'app error');
    const body: ApiErrorBody = {
      error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}), requestId },
    };
    res.status(err.status).json(body);
    return;
  }
  const e = err as { type?: string; status?: number };
  if (e.type === 'entity.parse.failed' || e.type === 'entity.too.large') {
    const body: ApiErrorBody = {
      error: { code: ErrorCode.VALIDATION, message: 'So\'rov tanasi noto\'g\'ri yoki juda katta', requestId },
    };
    res.status(e.status ?? 400).json(body);
    return;
  }
  logger.error({ err, requestId }, 'unhandled error');
  const body: ApiErrorBody = { error: { code: ErrorCode.INTERNAL, message: 'Ichki xatolik. Keyinroq qayta urinib ko\'ring', requestId } };
  res.status(500).json(body);
};
