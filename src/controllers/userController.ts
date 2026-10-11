import { Response, NextFunction } from 'express';
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
    const { fullName, email, phone } = req.body;

    if (phone) {
      const existingPhone = await db.user.findFirst({
        where: {
          phone,
          NOT: { id: req.user!.id }
        }
      });
      if (existingPhone) {
        return next(new AppError(400, 'PHONE_ALREADY_EXISTS', 'Nomor handphone sudah digunakan oleh akun lain'));
      }
    }

    if (email) {
      const existingEmail = await db.user.findFirst({
        where: {
          email,
          NOT: { id: req.user!.id }
        }
      });
      if (existingEmail) {
        return next(new AppError(400, 'EMAIL_ALREADY_EXISTS', 'Email sudah digunakan oleh akun lain'));
      }
    }

    const user = await db.user.update({
      where: { id: req.user!.id },
      data: {
        ...(fullName && { fullName: fullName.trim() }),
        ...(email !== undefined && { email: email ? email.trim() : null }),
        ...(phone && { phone: phone.trim() }),
      },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        status: true,
        isVerified: true,
      }
    });

    res.json(formatSuccess(user));
  } catch (error) {
    next(error);
  }
};

export const updatePin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { currentPin, newPin } = req.body;
    
    if (!currentPin || !newPin) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'PIN saat ini dan PIN baru wajib diisi'));
    }

    if (!/^\d{6}$/.test(newPin)) {
      return next(new AppError(400, 'INVALID_PIN_FORMAT', 'PIN baru harus terdiri dari 6 digit angka'));
    }

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

export const updatePassword = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Password saat ini dan password baru wajib diisi'));
    }

    if (newPassword.length < 6) {
      return next(new AppError(400, 'INVALID_PASSWORD_FORMAT', 'Password baru minimal 6 karakter'));
    }

    const user = await db.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return next(new AppError(404, 'NOT_FOUND', 'User tidak ditemukan'));

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      return next(new AppError(401, 'UNAUTHORIZED', 'Password saat ini tidak sesuai'));
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash }
    });

    res.json(formatSuccess({ message: 'Password berhasil diubah' }));
  } catch (error) {
    next(error);
  }
};
