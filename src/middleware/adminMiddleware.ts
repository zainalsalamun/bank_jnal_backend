import { Response, NextFunction } from 'express';
import { AppError } from './errorHandler';
import { AuthRequest } from './authMiddleware';

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'SUPER_ADMIN' && req.user?.role !== 'CONTENT_ADMIN') {
    return next(new AppError(403, 'FORBIDDEN', 'Akses ditolak'));
  }
  next();
};

export const requireSuperAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'SUPER_ADMIN') {
    return next(new AppError(403, 'FORBIDDEN', 'Akses ditolak: Membutuhkan hak Super Admin'));
  }
  next();
};
