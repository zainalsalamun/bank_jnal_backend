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
        ...(targetAmount !== undefined && { targetAmount: targetAmount ? Number(targetAmount) : null }),
      }
    });

    res.json(formatSuccess(pocket));
  } catch (error) {
    next(error);
  }
};

export const transferBetweenPockets = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { fromPocketId, toPocketId, amount } = req.body;
    const transferAmount = Number(amount);

    if (!fromPocketId || !toPocketId || !transferAmount || transferAmount <= 0) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Parameter alokasi saldo tidak valid'));
    }

    if (fromPocketId === toPocketId) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Kantong asal dan tujuan tidak boleh sama'));
    }

    const result = await db.$transaction(async (tx) => {
      const sourcePocket = await tx.pocket.findUnique({ where: { id: fromPocketId } });
      const destPocket = await tx.pocket.findUnique({ where: { id: toPocketId } });

      if (!sourcePocket || sourcePocket.userId !== req.user!.id) {
        throw new AppError(404, 'NOT_FOUND', 'Kantong asal tidak ditemukan');
      }
      if (!destPocket || destPocket.userId !== req.user!.id) {
        throw new AppError(404, 'NOT_FOUND', 'Kantong tujuan tidak ditemukan');
      }

      if (Number(sourcePocket.balance) < transferAmount) {
        throw new AppError(409, 'INSUFFICIENT_BALANCE', 'Saldo di kantong asal tidak mencukupi');
      }

      // Deduct from source
      await tx.pocket.update({
        where: { id: sourcePocket.id },
        data: { balance: { decrement: transferAmount } }
      });

      // Add to dest
      const updatedDest = await tx.pocket.update({
        where: { id: destPocket.id },
        data: { balance: { increment: transferAmount } }
      });

      // Record transaction
      await tx.transaction.create({
        data: {
          reference: `PKT${Date.now()}`,
          userId: req.user!.id,
          sourcePocketId: sourcePocket.id,
          destinationPocketId: destPocket.id,
          type: 'TRANSFER_OUT',
          amount: transferAmount,
          adminFee: 0,
          status: 'SUCCESS',
          description: `Pindah saldo dari ${sourcePocket.name} ke ${destPocket.name}`,
          recipientName: destPocket.name,
          recipientBank: 'BANK J-NAL',
          recipientAccount: destPocket.accountNumber,
          completedAt: new Date()
        }
      });

      return { sourcePocket, destPocket: updatedDest };
    });

    res.json(formatSuccess(result, { message: 'Alokasi saldo antar kantong berhasil!' }));
  } catch (error) {
    next(error);
  }
};

export const deletePocket = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { pocketId } = req.params;

    const pocket = await db.pocket.findUnique({ where: { id: pocketId } });
    if (!pocket || pocket.userId !== req.user!.id) {
      return next(new AppError(404, 'NOT_FOUND', 'Kantong tidak ditemukan'));
    }

    if (pocket.isPrimary) {
      return next(new AppError(400, 'CANNOT_DELETE_PRIMARY', 'Kantong Utama tidak dapat dihapus'));
    }

    await db.$transaction(async (tx) => {
      // If pocket has remaining balance, return to primary pocket
      const remainingBalance = Number(pocket.balance);
      if (remainingBalance > 0) {
        const primaryPocket = await tx.pocket.findFirst({
          where: { userId: req.user!.id, isPrimary: true }
        });

        if (primaryPocket) {
          await tx.pocket.update({
            where: { id: primaryPocket.id },
            data: { balance: { increment: remainingBalance } }
          });
        }
      }

      await tx.pocket.delete({
        where: { id: pocket.id }
      });
    });

    res.json(formatSuccess(null, { message: 'Kantong berhasil dihapus dan saldo dialihkan ke Kantong Utama' }));
  } catch (error) {
    next(error);
  }
};
