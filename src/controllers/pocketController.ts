import { Request, Response, NextFunction } from 'express';
import { db } from '../config/db';
import { formatSuccess } from '../utils/response';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/authMiddleware';

function generateAccountNumber() {
  return Math.floor(100000000000 + Math.random() * 900000000000).toString();
}

export const getPockets = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const pockets = await db.pocket.findMany({
      where: { userId: req.user!.id },
      orderBy: { isPrimary: 'desc' }
    });

    const formattedPockets = pockets.map(p => ({
      id: p.id,
      name: p.name,
      accountNumber: p.accountNumber,
      type: p.type,
      balance: p.balance,
      targetAmount: p.targetAmount,
      targetProgress: p.targetAmount ? Math.min(Math.round((Number(p.balance) / Number(p.targetAmount)) * 100), 100) : null,
      isPrimary: p.isPrimary
    }));

    res.json(formatSuccess(formattedPockets));
  } catch (error) {
    next(error);
  }
};

export const createPocket = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name, type, targetAmount } = req.body;

    const pocket = await db.pocket.create({
      data: {
        userId: req.user!.id,
        name,
        type,
        targetAmount,
        accountNumber: generateAccountNumber(),
        isPrimary: false,
      }
    });

    res.status(201).json(formatSuccess(pocket));
  } catch (error) {
    next(error);
  }
};

export const getPocketById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const pocket = await db.pocket.findUnique({
      where: { id: req.params.pocketId as string }
    });

    if (!pocket || pocket.userId !== req.user!.id) {
      return next(new AppError(404, 'NOT_FOUND', 'Kantong tidak ditemukan'));
    }

    res.json(formatSuccess(pocket));
  } catch (error) {
    next(error);
  }
};

export const updatePocket = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name, targetAmount } = req.body;
    
    const existing = await db.pocket.findUnique({ where: { id: req.params.pocketId as string } });
    if (!existing || existing.userId !== req.user!.id) {
      return next(new AppError(404, 'NOT_FOUND', 'Kantong tidak ditemukan'));
    }

    const pocket = await db.pocket.update({
      where: { id: req.params.pocketId as string },
      data: {
        ...(name && { name }),
        ...(targetAmount !== undefined && { targetAmount }),
      }
    });

    res.json(formatSuccess(pocket));
  } catch (error) {
    next(error);
  }
};
