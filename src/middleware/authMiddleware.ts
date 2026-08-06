import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './errorHandler';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Token tidak tersedia/valid'));
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Token tidak tersedia/valid'));
  }

  try {
    const secret = process.env.JWT_SECRET || 'jnal_super_secret_key_2026_demo';
    const decoded = jwt.verify(token, secret as string) as any;
    req.user = {
      id: decoded.userId,
      role: decoded.role,
    };
    next();
  } catch (err) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Token tidak tersedia/valid'));
  }
};
