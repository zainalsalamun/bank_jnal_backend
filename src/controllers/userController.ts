import { Request, Response, NextFunction } from 'express';
import { db } from '../config/db';
import { formatSuccess } from '../utils/response';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/authMiddleware';
import bcrypt from 'bcrypt';

export const getProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await db.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        status: true,
        isVerified: true,
        lastLoginAt: true,
      }
    });

    if (!user) return next(new AppError(404, 'NOT_FOUND', 'User tidak ditemukan'));

    res.json(formatSuccess(user));
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { fullName, email } = req.body;

    const user = await db.user.update({
      where: { id: req.user!.id },
      data: {
        ...(fullName && { fullName }),
        ...(email && { email }),
      },
      select: { id: true, fullName: true, email: true }
    });

    res.json(formatSuccess(user));
  } catch (error) {
    next(error);
  }
};

export const updatePin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { currentPin, newPin } = req.body;
    
    const user = await db.user.findUnique({ where: { id: req.user!.id } });
    if (!user || !user.pinHash) return next(new AppError(404, 'NOT_FOUND', 'User tidak ditemukan'));

    const isMatch = await bcrypt.compare(currentPin, user.pinHash);
    if (!isMatch) return next(new AppError(401, 'UNAUTHORIZED', 'PIN saat ini salah'));

    const newPinHash = await bcrypt.hash(newPin, 10);
    await db.user.update({
      where: { id: user.id },
      data: { pinHash: newPinHash }
    });

    res.json(formatSuccess({ message: 'PIN berhasil diubah' }));
  } catch (error) {
    next(error);
  }
};
