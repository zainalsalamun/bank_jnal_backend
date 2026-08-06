import { Request, Response, NextFunction } from 'express';
import { db } from '../config/db';
import { formatSuccess, formatError } from '../utils/response';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/authMiddleware';
import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';

export const getCards = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const cards = await db.card.findMany({
      where: { userId: req.user!.id }
    });

    const formatted = cards.map(c => ({
      id: c.id,
      cardType: c.cardType,
      cardName: c.cardName,
      maskedNumber: c.maskedNumber,
      expiryMonth: c.expiryMonth,
      expiryYear: c.expiryYear,
      dailyLimit: c.dailyLimit,
      status: c.status
    }));

    res.json(formatSuccess(formatted));
  } catch (error) {
    next(error);
  }
};

export const updateLimit = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { dailyLimit, pin } = req.body;

    const user = await db.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return next(new AppError(404, 'NOT_FOUND', 'User tidak ditemukan'));

    const isPinValid = await bcrypt.compare(pin, user.pinHash!);
    if (!isPinValid) return res.status(409).json(formatError('INVALID_PIN', 'PIN salah'));

    const card = await db.card.update({
      where: { id: req.params.cardId as string, userId: req.user!.id },
      data: { dailyLimit }
    });

    res.json(formatSuccess(card));
  } catch (error) {
    next(error);
  }
};

export const freezeCard = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { pin } = req.body;
    
    const user = await db.user.findUnique({ where: { id: req.user!.id } });
    const isPinValid = await bcrypt.compare(pin, user!.pinHash!);
    if (!isPinValid) return res.status(409).json(formatError('INVALID_PIN', 'PIN salah'));

    const card = await db.card.update({
      where: { id: req.params.cardId as string, userId: req.user!.id },
      data: { status: 'FROZEN' }
    });

    res.json(formatSuccess(card));
  } catch (error) {
    next(error);
  }
};

export const unfreezeCard = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { pin } = req.body;
    
    const user = await db.user.findUnique({ where: { id: req.user!.id } });
    const isPinValid = await bcrypt.compare(pin, user!.pinHash!);
    if (!isPinValid) return res.status(409).json(formatError('INVALID_PIN', 'PIN salah'));

    const card = await db.card.update({
      where: { id: req.params.cardId as string, userId: req.user!.id },
      data: { status: 'ACTIVE' }
    });

    res.json(formatSuccess(card));
  } catch (error) {
    next(error);
  }
};
