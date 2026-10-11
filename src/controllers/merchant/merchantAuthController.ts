import { Request, Response, NextFunction } from 'express';
import { db } from '../../config/db';
import { formatSuccess, formatError } from '../../utils/response';
import { AppError } from '../../middleware/errorHandler';
import { AuthRequest } from '../../middleware/authMiddleware';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'jnal_super_secret_key_2026_demo';

export const registerMerchant = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) return next(new AppError(401, 'UNAUTHORIZED', 'Silakan login sebagai nasabah Bank J-NAL terlebih dahulu'));

    const { name, brandName, category, address, city = 'Jakarta', pocketId, phone, email } = req.body;

    if (!name || !category || !pocketId) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Nama usaha, kategori, dan rekening penampung wajib diisi'));
    }

    // Verify pocket belongs to user
    const pocket = await db.pocket.findFirst({
      where: { id: pocketId, userId }
    });

    if (!pocket) {
      return next(new AppError(404, 'NOT_FOUND', 'Rekening/Kantong Bank J-NAL tidak ditemukan atau bukan milik Anda'));
    }

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return next(new AppError(404, 'NOT_FOUND', 'Pengguna tidak ditemukan'));

    // Create merchant & default main outlet
    const qrisStaticCode = `QRIS-JNAL-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;

    const result = await db.$transaction(async (tx) => {
      const merchant = await tx.merchant.create({
        data: {
          userId,
          pocketId: pocket.id,
          name,
          brandName: brandName || name,
          category,
          address: address || 'Alamat Utama Usaha',
          city,
          phone: phone || user.phone,
          email: email || user.email,
          status: 'ACTIVE'
        }
      });

      const defaultOutlet = await tx.merchantOutlet.create({
        data: {
          merchantId: merchant.id,
          name: `${name} - Outlet Utama`,
          address: address || 'Alamat Toko',
          city,
          qrisCode: qrisStaticCode,
          isActive: true
        }
      });

      // Create owner staff profile for cashier mode
      const pinHash = user.pinHash || await bcrypt.hash('123456', 10);
      const staffOwner = await tx.merchantStaff.create({
        data: {
          merchantId: merchant.id,
          outletId: defaultOutlet.id,
          userId: user.id,
          fullName: user.fullName,
          phone: user.phone,
          pinHash,
          role: 'OWNER',
          isActive: true
        }
      });

      // Also register into qrisMerchant table for general scanner lookup compatibility
      await tx.qrisMerchant.upsert({
        where: { merchantId: qrisStaticCode },
        update: { merchantName: name, city, isActive: true },
        create: { merchantId: qrisStaticCode, merchantName: name, city, isActive: true }
      });

      return { merchant, defaultOutlet, staffOwner };
    });

    const token = jwt.sign(
      {
        userId: user.id,
        merchantId: result.merchant.id,
        outletId: result.defaultOutlet.id,
        role: 'MERCHANT_OWNER'
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json(formatSuccess({
      token,
      merchant: result.merchant,
      outlet: result.defaultOutlet,
      pocket: {
        id: pocket.id,
        name: pocket.name,
        accountNumber: pocket.accountNumber,
        balance: pocket.balance
      }
    }));
  } catch (error) {
    next(error);
  }
};

export const loginMerchant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone, pin } = req.body;
    if (!phone || !pin) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Nomor telepon dan PIN wajib diisi'));
    }

    // 1. First check if user is Bank J-NAL user with registered merchant
    const user = await db.user.findUnique({
      where: { phone },
      include: {
        merchants: {
          include: {
            pocket: true,
            outlets: true
          }
        }
      }
    });

    if (user && user.pinHash) {
      const isPinValid = await bcrypt.compare(pin, user.pinHash);
      if (isPinValid) {
        if (!user.merchants || user.merchants.length === 0) {
          return res.status(403).json(formatError('MERCHANT_NOT_REGISTERED', 'Akun Bank J-NAL Anda belum terdaftar sebagai Merchant. Silakan registrasi merchant terlebih dahulu.'));
        }

        const merchant = user.merchants[0];
        if (!merchant) {
          return res.status(403).json(formatError('MERCHANT_NOT_REGISTERED', 'Data merchant tidak ditemukan.'));
        }
        const outlet = merchant.outlets[0] || null;

        const token = jwt.sign(
          {
            userId: user.id,
            merchantId: merchant.id,
            outletId: outlet?.id,
            role: 'MERCHANT_OWNER'
          },
          JWT_SECRET,
          { expiresIn: '30d' }
        );

        return res.json(formatSuccess({
          token,
          user: {
            id: user.id,
            fullName: user.fullName,
            phone: user.phone,
            email: user.email
          },
          merchant: {
            id: merchant.id,
            name: merchant.name,
            brandName: merchant.brandName,
            category: merchant.category,
            status: merchant.status,
            address: merchant.address,
            city: merchant.city
          },
          outlet,
          pocket: merchant.pocket
        }));
      }
    }

    // 2. Alternatively check merchant staff (cashier) login
    const staff = await db.merchantStaff.findFirst({
      where: { phone, isActive: true },
      include: {
        merchant: {
          include: {
            pocket: true
          }
        },
        outlet: true
      }
    });

    if (staff) {
      const isPinValid = await bcrypt.compare(pin, staff.pinHash);
      if (isPinValid) {
        const token = jwt.sign(
          {
            userId: staff.userId || staff.id,
            merchantId: staff.merchantId,
            outletId: staff.outletId,
            staffId: staff.id,
            role: staff.role
          },
          JWT_SECRET,
          { expiresIn: '30d' }
        );

        return res.json(formatSuccess({
          token,
          staff: {
            id: staff.id,
            fullName: staff.fullName,
            phone: staff.phone,
            role: staff.role
          },
          merchant: {
            id: staff.merchant.id,
            name: staff.merchant.name,
            category: staff.merchant.category,
            status: staff.merchant.status
          },
          outlet: staff.outlet,
          // Only show pocket if owner/manager
          pocket: staff.role === 'CASHIER' ? null : staff.merchant.pocket
        }));
      }
    }

    return res.status(401).json(formatError('INVALID_CREDENTIALS', 'Nomor telepon atau PIN salah'));
  } catch (error) {
    next(error);
  }
};

export const getMerchantProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) return next(new AppError(401, 'UNAUTHORIZED', 'Akses tidak diizinkan'));

    const merchant = await db.merchant.findFirst({
      where: {
        OR: [
          { userId },
          { staff: { some: { id: userId } } },
          { staff: { some: { userId } } }
        ]
      },
      include: {
        pocket: true,
        outlets: true,
        staff: true
      }
    });

    if (!merchant) {
      return next(new AppError(404, 'NOT_FOUND', 'Profil Merchant tidak ditemukan'));
    }

    res.json(formatSuccess(merchant));
  } catch (error) {
    next(error);
  }
};
