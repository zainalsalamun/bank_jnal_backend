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

    const accessToken = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
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
      expiresIn: 604800,
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

    const newAccessToken = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    const newRefreshToken = jwt.sign({ userId: user.id }, JWT_REFRESH_SECRET, { expiresIn: '7d' });

    res.json(formatSuccess({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: 604800,
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

const registerSchema = z.object({
  fullName: z.string().min(3, 'Nama lengkap minimal 3 karakter'),
  phone: z.string().min(9, 'Nomor HP minimal 9 karakter'),
  email: z.string().email('Format email tidak valid').optional().or(z.literal('')),
  password: z.string().min(6, 'Password minimal 6 karakter'),
  pin: z.string().length(6, 'PIN harus 6 digit angka').regex(/^\d{6}$/, 'PIN harus berupa angka'),
});

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { fullName, phone, email, password, pin } = registerSchema.parse(req.body);

    const existingPhone = await db.user.findUnique({ where: { phone: phone.trim() } });
    if (existingPhone) {
      return next(new AppError(409, 'PHONE_ALREADY_EXISTS', 'Nomor handphone sudah terdaftar'));
    }

    if (email && email.trim() !== '') {
      const existingEmail = await db.user.findUnique({ where: { email: email.trim() } });
      if (existingEmail) {
        return next(new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Email sudah terdaftar'));
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const pinHash = await bcrypt.hash(pin, 10);

    const result = await db.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          fullName: fullName.trim(),
          phone: phone.trim(),
          email: email && email.trim() !== '' ? email.trim() : null,
          passwordHash,
          pinHash,
          status: 'ACTIVE',
          role: 'CUSTOMER',
          isVerified: true,
        }
      });

      const randomPart = Math.floor(10000000 + Math.random() * 90000000).toString();
      const accountNumber = `1234${randomPart}`;

      const mainPocket = await tx.pocket.create({
        data: {
          userId: newUser.id,
          name: 'Kantong Utama',
          accountNumber,
          type: 'MAIN',
          balance: 1000000.00,
          isPrimary: true,
        }
      });

      const now = new Date();
      const expiryMonth = now.getMonth() + 1;
      const expiryYear = now.getFullYear() + 5;
      const rand4 = accountNumber.slice(-4);
      const maskedNumber = `•••• ${rand4}`;

      await tx.card.create({
        data: {
          userId: newUser.id,
          pocketId: mainPocket.id,
          cardType: 'DIGITAL',
          cardName: 'Kartu Digital J-NAL',
          maskedNumber,
          expiryMonth,
          expiryYear,
          dailyLimit: 10000000.00,
          status: 'ACTIVE',
        }
      });

      await tx.notification.create({
        data: {
          userId: newUser.id,
          title: 'Selamat Datang di Bank J-NAL! 🎉',
          message: `Halo ${newUser.fullName}, rekening Anda (${accountNumber}) telah aktif dengan saldo awal Rp 1.000.000 dan Kartu Digital siap digunakan.`,
          type: 'SYSTEM',
        }
      });

      return { user: newUser, mainPocket };
    });

    const accessToken = jwt.sign({ userId: result.user.id, role: result.user.role }, JWT_SECRET, { expiresIn: '7d' });
    const refreshToken = jwt.sign({ userId: result.user.id }, JWT_REFRESH_SECRET, { expiresIn: '7d' });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    
    await db.refreshToken.create({
      data: {
        userId: result.user.id,
        tokenHash: await bcrypt.hash(refreshToken, 10),
        expiresAt,
      }
    });

    res.status(201).json(formatSuccess({
      accessToken,
      refreshToken,
      expiresIn: 604800,
      user: {
        id: result.user.id,
        fullName: result.user.fullName,
        phone: result.user.phone,
        email: result.user.email,
        role: result.user.role,
        status: result.user.status,
      }
    }));
  } catch (error) {
    next(error);
  }
};

export const forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { identifier } = req.body;
    if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Nomor handphone atau email wajib diisi'));
    }

    const trimmed = identifier.trim();
    const user = await db.user.findFirst({
      where: {
        OR: [
          { phone: trimmed },
          { email: trimmed.toLowerCase() }
        ]
      }
    });

    if (!user) {
      return next(new AppError(404, 'USER_NOT_FOUND', 'Nomor HP atau Email tidak terdaftar di sistem'));
    }

    const otpDemo = '123456';
    const resetToken = jwt.sign(
      { userId: user.id, phone: user.phone, purpose: 'PASSWORD_RESET' },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    const masked = user.phone.length > 6 
      ? user.phone.substring(0, 4) + '****' + user.phone.substring(user.phone.length - 3)
      : user.phone;

    res.json(formatSuccess({
      message: `Kode verifikasi OTP telah dikirim ke ${masked}`,
      phone: user.phone,
      email: user.email,
      resetToken,
      otpDemo,
    }));
  } catch (error) {
    next(error);
  }
};

export const verifyOtp = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone, otp, resetToken } = req.body;
    if (!otp || typeof otp !== 'string' || otp.trim().length !== 6) {
      return next(new AppError(400, 'INVALID_OTP_FORMAT', 'Kode OTP harus terdiri dari 6 digit'));
    }

    if (otp !== '123456') {
      return next(new AppError(400, 'INVALID_OTP', 'Kode OTP yang Anda masukkan salah'));
    }

    let userId: string | undefined;
    if (resetToken) {
      try {
        const decoded = jwt.verify(resetToken, JWT_SECRET) as any;
        if (decoded.purpose === 'PASSWORD_RESET') {
          userId = decoded.userId;
        }
      } catch (_) {}
    }

    if (!userId && phone) {
      const user = await db.user.findUnique({ where: { phone } });
      if (user) userId = user.id;
    }

    if (!userId) {
      return next(new AppError(400, 'INVALID_REQUEST', 'Sesi verifikasi tidak valid atau telah kedaluwarsa'));
    }

    const verifiedToken = jwt.sign(
      { userId, verified: true, purpose: 'RESET_AUTHORIZED' },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json(formatSuccess({
      message: 'Verifikasi OTP berhasil',
      verifiedToken,
    }));
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { verifiedToken, resetToken, phone, newPassword } = req.body;

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return next(new AppError(400, 'WEAK_PASSWORD', 'Password baru minimal 6 karakter'));
    }

    let targetUserId: string | undefined;

    const tokenToCheck = verifiedToken || resetToken;
    if (tokenToCheck) {
      try {
        const decoded = jwt.verify(tokenToCheck, JWT_SECRET) as any;
        if (decoded.userId) {
          targetUserId = decoded.userId;
        }
      } catch (_) {}
    }

    if (!targetUserId && phone) {
      const user = await db.user.findUnique({ where: { phone } });
      if (user) targetUserId = user.id;
    }

    if (!targetUserId) {
      return next(new AppError(400, 'UNAUTHORIZED', 'Sesi reset password tidak valid atau telah kedaluwarsa'));
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.user.update({
      where: { id: targetUserId },
      data: { passwordHash }
    });

    await db.refreshToken.deleteMany({ where: { userId: targetUserId } });

    res.json(formatSuccess({
      message: 'Password berhasil direset! Silakan login dengan password baru Anda.',
    }));
  } catch (error) {
    next(error);
  }
};
