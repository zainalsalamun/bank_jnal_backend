import { Request, Response, NextFunction } from 'express';
import { formatError } from '../utils/response';
import { ZodError } from 'zod';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(422).json(formatError('VALIDATION_ERROR', 'Request tidak valid', err.issues));
    return;
  }

  // Handle custom AppError if we create one, otherwise general 500
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.message || 'Kesalahan server';
  
  if (statusCode === 500) {
    console.error('[Error]', err);
  }

  res.status(statusCode).json(formatError(code, message));
};

export class AppError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}
