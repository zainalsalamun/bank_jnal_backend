import { Request, Response, NextFunction } from 'express';
import { db } from '../config/db';
import { formatSuccess, formatError } from '../utils/response';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/authMiddleware';
import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';

export const resolveQris = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { payload } = req.body;
    
    // In a real scenario, this parses the QR code.
    // For demo, we just look for merchantId embedded or assume it's 'mrc_01'.
    const merchantId = 'mrc_01'; // Mocked
    const merchant = await db.qrisMerchant.findUnique({ where: { merchantId } });
    
    if (!merchant || !merchant.isActive) {
      return next(new AppError(404, 'NOT_FOUND', 'Merchant tidak ditemukan atau tidak aktif'));
    }

    res.json(formatSuccess({
      merchantId: merchant.merchantId,
      merchantName: merchant.merchantName,
      city: merchant.city,
      amount: 35000,
      editableAmount: false
    }));
  } catch (error) {
    next(error);
  }
};

export const payQris = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const idempotencyKey = req.headers['idempotency-key'] as string;
  if (!idempotencyKey) return next(new AppError(422, 'VALIDATION_ERROR', 'Idempotency-Key header is required'));

  try {
    const { sourcePocketId, merchantId, amount, pin } = req.body;
    const paymentAmount = new Prisma.Decimal(amount);

    // Check Idempotency
    const existingTx = await db.transaction.findFirst({
      where: { idempotencyKey, userId: req.user!.id }
    });
    if (existingTx) return res.status(201).json(formatSuccess(existingTx));

    // Verify PIN
    const user = await db.user.findUnique({ where: { id: req.user!.id } });
    if (!user || user.status !== 'ACTIVE') return res.status(403).json(formatError('ACCOUNT_BLOCKED', 'Akun tidak aktif'));
    const isPinValid = await bcrypt.compare(pin, user.pinHash!);
    if (!isPinValid) return res.status(409).json(formatError('INVALID_PIN', 'PIN salah'));

    const result = await db.$transaction(async (tx) => {
      const sourcePocket = await tx.pocket.findUnique({ where: { id: sourcePocketId } });
      const merchant = await tx.qrisMerchant.findUnique({ where: { merchantId } });

      if (!sourcePocket || sourcePocket.userId !== user.id) throw new AppError(404, 'NOT_FOUND', 'Kantong sumber tidak ditemukan');
      if (!merchant) throw new AppError(404, 'NOT_FOUND', 'Merchant tidak ditemukan');
      if (sourcePocket.balance.lt(paymentAmount)) throw new AppError(409, 'INSUFFICIENT_BALANCE', 'Saldo tidak mencukupi');

      await tx.pocket.update({
        where: { id: sourcePocket.id },
        data: { balance: sourcePocket.balance.sub(paymentAmount) }
      });

      const senderTx = await tx.transaction.create({
        data: {
          reference: `QRS${new Date().getTime()}`,
          userId: user.id,
          sourcePocketId: sourcePocket.id,
          type: 'QRIS',
          amount: paymentAmount,
          adminFee: 0,
          status: 'SUCCESS',
          description: `Pembayaran QRIS ke ${merchant.merchantName}`,
          recipientName: merchant.merchantName,
          recipientBank: 'QRIS',
          idempotencyKey,
          completedAt: new Date()
        }
      });
      return senderTx;
    });

    res.status(201).json(formatSuccess({
      transactionId: result.id,
      reference: result.reference,
      recipientName: result.recipientName,
      amount: result.amount,
      adminFee: result.adminFee,
      total: result.amount,
      status: result.status,
      createdAt: result.createdAt
    }));
  } catch (error: any) {
    if (error instanceof AppError) return res.status(error.statusCode).json(formatError(error.code, error.message));
    next(error);
  }
};
