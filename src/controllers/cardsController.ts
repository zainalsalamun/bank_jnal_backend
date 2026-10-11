import { Request, Response, NextFunction } from 'express';
import { db } from '../config/db';
import { formatSuccess, formatError } from '../utils/response';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/authMiddleware';
import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';

function formatCard(c: any) {
  return {
    id: c.id,
    cardType: c.cardType,
    cardName: c.cardName,
    holderName: c.user?.fullName?.toUpperCase() || 'NASABAH J-NAL',
    pocketName: c.pocket?.name || 'Kantong Utama',
    pocketAccountNumber: c.pocket?.accountNumber || '',
    maskedNumber: c.maskedNumber,
    expiryMonth: c.expiryMonth,
    expiryYear: c.expiryYear,
    dailyLimit: c.dailyLimit,
    status: c.status
  };
}

export const getCards = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const cards = await db.card.findMany({
      where: { userId: req.user!.id },
      include: {
        user: true,
        pocket: true
      }
    });

    const formatted = cards.map(formatCard);
    res.json(formatSuccess(formatted));
  } catch (error) {
    next(error);
  }
};

export const updateLimit = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { dailyLimit, pin } = req.body;

    const numLimit = Number(dailyLimit);
    if (!numLimit || isNaN(numLimit) || numLimit <= 0) {
      return res.status(400).json(formatError('INVALID_LIMIT', 'Nominal limit harian harus lebih dari 0'));
    }

    if (numLimit > 500000000) {
      return res.status(400).json(formatError('LIMIT_EXCEEDED', 'Maksimal limit harian adalah Rp 500.000.000'));
    }

    if (!pin) {
      return res.status(400).json(formatError('PIN_REQUIRED', 'PIN transaksi diperlukan'));
    }

    const user = await db.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return next(new AppError(404, 'NOT_FOUND', 'User tidak ditemukan'));

    const isPinValid = await bcrypt.compare(pin, user.pinHash!);
    if (!isPinValid) return res.status(409).json(formatError('INVALID_PIN', 'PIN yang Anda masukkan salah'));

    const card = await db.card.update({
      where: { id: req.params.cardId as string, userId: req.user!.id },
      data: { dailyLimit: new Prisma.Decimal(numLimit) },
      include: {
        user: true,
        pocket: true
      }
    });

    res.json(formatSuccess(formatCard(card)));
  } catch (error) {
    next(error);
  }
};

export const freezeCard = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { pin } = req.body;
    
    const user = await db.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return next(new AppError(404, 'NOT_FOUND', 'User tidak ditemukan'));

    const isPinValid = await bcrypt.compare(pin, user.pinHash!);
    if (!isPinValid) return res.status(409).json(formatError('INVALID_PIN', 'PIN yang Anda masukkan salah'));

    const card = await db.card.update({
      where: { id: req.params.cardId as string, userId: req.user!.id },
      data: { status: 'FROZEN' },
      include: {
        user: true,
        pocket: true
      }
    });

    res.json(formatSuccess(formatCard(card)));
  } catch (error) {
    next(error);
  }
};

export const unfreezeCard = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { pin } = req.body;
    
    const user = await db.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return next(new AppError(404, 'NOT_FOUND', 'User tidak ditemukan'));

    const isPinValid = await bcrypt.compare(pin, user.pinHash!);
    if (!isPinValid) return res.status(409).json(formatError('INVALID_PIN', 'PIN yang Anda masukkan salah'));

    const card = await db.card.update({
      where: { id: req.params.cardId as string, userId: req.user!.id },
      data: { status: 'ACTIVE' },
      include: {
        user: true,
        pocket: true
      }
    });

    res.json(formatSuccess(formatCard(card)));
  } catch (error) {
    next(error);
  }
};

export const createCard = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { cardType = 'DIGITAL', cardName, pocketId, dailyLimit = 10000000, pin } = req.body;

    if (!pin) {
      return res.status(400).json(formatError('PIN_REQUIRED', 'PIN transaksi diperlukan'));
    }

    const user = await db.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return next(new AppError(404, 'NOT_FOUND', 'User tidak ditemukan'));

    const isPinValid = await bcrypt.compare(pin, user.pinHash!);
    if (!isPinValid) return res.status(409).json(formatError('INVALID_PIN', 'PIN yang Anda masukkan salah'));

    let targetPocket = null;
    if (pocketId) {
      targetPocket = await db.pocket.findFirst({
        where: { id: pocketId, userId: req.user!.id }
      });
    }

    if (!targetPocket) {
      targetPocket = await db.pocket.findFirst({
        where: { userId: req.user!.id, type: 'MAIN' }
      });
    }

    if (!targetPocket) {
      targetPocket = await db.pocket.findFirst({
        where: { userId: req.user!.id }
      });
    }

    const rand4 = Math.floor(1000 + Math.random() * 9000).toString();
    const maskedNumber = `•••• ${rand4}`;
    const now = new Date();
    const expiryMonth = now.getMonth() + 1;
    const expiryYear = now.getFullYear() + 5;

    const newCard = await db.card.create({
      data: {
        userId: req.user!.id,
        pocketId: targetPocket ? targetPocket.id : null,
        cardType: cardType.toUpperCase() === 'PHYSICAL' ? 'PHYSICAL' : 'DIGITAL',
        cardName: cardName || (cardType.toUpperCase() === 'PHYSICAL' ? 'Kartu Fisik J-NAL' : 'Kartu Digital J-NAL'),
        maskedNumber,
        expiryMonth,
        expiryYear,
        dailyLimit: new Prisma.Decimal(Number(dailyLimit) || 10000000),
        status: 'ACTIVE'
      },
      include: {
        user: true,
        pocket: true
      }
    });

    await db.notification.create({
      data: {
        userId: req.user!.id,
        title: 'Kartu Baru Berhasil Diterbitkan',
        message: `${newCard.cardName} (${newCard.cardType}) berhasil dibuat dan siap digunakan.`,
        type: 'SECURITY'
      }
    });

    res.status(201).json(formatSuccess(formatCard(newCard)));
  } catch (error) {
    next(error);
  }
};
