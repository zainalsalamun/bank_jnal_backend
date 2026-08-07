import { Request, Response, NextFunction } from 'express';
import { db } from '../config/db';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { formatSuccess } from '../utils/response';
import { AppError } from '../middleware/errorHandler';
import { z } from 'zod';
import { AuthRequest } from '../middleware/authMiddleware';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'refresh_secret';

const loginSchema = z.object({
  phone: z.string().min(5).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6),
});

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone, email, password } = loginSchema.parse(req.body);

    if (!phone && !email) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Harap masukkan nomor handphone atau email'));
    }

    const user = await db.user.findFirst({ 
      where: { 
        OR: [
          ...(phone ? [{ phone }] : []),
          ...(email ? [{ email }] : [])
        ]
      } 
    });
    
    if (!user || user.status !== 'ACTIVE') {
      return next(new AppError(401, 'UNAUTHORIZED', 'Email/No. HP atau password salah / akun tidak aktif'));
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return next(new AppError(401, 'UNAUTHORIZED', 'Email/No. HP atau password salah'));
    }

    const accessToken = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ userId: user.id }, JWT_REFRESH_SECRET, { expiresIn: '7d' });

    // Store refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    
    await db.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: await bcrypt.hash(refreshToken, 10),
        expiresAt,
      }
    });

    // Update last login
    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    res.json(formatSuccess({
      accessToken,
      refreshToken,
      expiresIn: 900,
      user: {
        id: user.id,
        fullName: user.fullName,
        phone: user.phone,
        role: user.role,
        status: user.status,
      }
    }));
  } catch (error) {
    next(error);
  }
};

export const refresh = async (req: Request, res: Response, next: NextFunction) => {
  // Simple implementation for demo purposes
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return next(new AppError(400, 'VALIDATION_ERROR', 'Refresh token required'));

    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as any;
    const user = await db.user.findUnique({ where: { id: decoded.userId } });
    if (!user || user.status !== 'ACTIVE') return next(new AppError(401, 'UNAUTHORIZED', 'Invalid token'));

    const newAccessToken = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '15m' });
    const newRefreshToken = jwt.sign({ userId: user.id }, JWT_REFRESH_SECRET, { expiresIn: '7d' });

    res.json(formatSuccess({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: 900,
    }));
  } catch (error) {
    next(new AppError(401, 'UNAUTHORIZED', 'Token tidak valid atau kedaluwarsa'));
  }
};

export const logout = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // In a real app we would revoke the refresh token in the DB
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
