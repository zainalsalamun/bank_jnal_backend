import { Request, Response, NextFunction } from 'express';
import { db } from '../config/db';
import { formatSuccess, formatError } from '../utils/response';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/authMiddleware';
import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { io } from '../server';

export const resolveQris = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { payload } = req.body;
    
    // Jika qrData merepresentasikan Account Number nasabah lain
    const pocket = await db.pocket.findUnique({
      where: { accountNumber: payload },
      include: { user: true }
    });

    if (pocket && pocket.user.status === 'ACTIVE') {
      return res.json(formatSuccess({
        merchantId: pocket.accountNumber, // We use account number as merchantId for P2P
        merchantName: pocket.user.fullName,
        city: 'Nasabah BANK J-NAL',
        amount: 0,
        editableAmount: true
      }));
    }

    // Default to merchant if not a pocket
    const merchantId = payload || 'mrc_01'; // Fallback for mock demo
    const merchant = await db.qrisMerchant.findUnique({ where: { merchantId } });
    
    if (!merchant || !merchant.isActive) {
      return next(new AppError(404, 'NOT_FOUND', 'Merchant atau rekening tidak ditemukan'));
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
      const destPocket = await tx.pocket.findUnique({ where: { accountNumber: merchantId }, include: { user: true } });

      if (!sourcePocket || sourcePocket.userId !== user.id) throw new AppError(404, 'NOT_FOUND', 'Kantong sumber tidak ditemukan');
      if (!merchant && !destPocket) throw new AppError(404, 'NOT_FOUND', 'Target pembayaran (Merchant/Nasabah) tidak ditemukan');
      if (sourcePocket.balance.lt(paymentAmount)) throw new AppError(409, 'INSUFFICIENT_BALANCE', 'Saldo tidak mencukupi');

      // Kurangi saldo sumber
      await tx.pocket.update({
        where: { id: sourcePocket.id },
        data: { balance: sourcePocket.balance.sub(paymentAmount) }
      });

      let senderTx;

      if (destPocket) {
        // P2P Transfer Logic via QRIS
        await tx.pocket.update({
          where: { id: destPocket.id },
          data: { balance: destPocket.balance.add(paymentAmount) }
        });

        senderTx = await tx.transaction.create({
          data: {
            reference: `QRS${new Date().getTime()}`,
            userId: user.id,
            sourcePocketId: sourcePocket.id,
            destinationPocketId: destPocket.id,
            type: 'QRIS',
            amount: paymentAmount,
            adminFee: 0,
            status: 'SUCCESS',
            description: `Transfer P2P via QRIS ke ${destPocket.user.fullName}`,
            recipientName: destPocket.user.fullName,
            recipientBank: 'BANK J-NAL',
            recipientAccount: destPocket.accountNumber,
            idempotencyKey,
            completedAt: new Date()
          }
        });

        // Buat mutasi untuk penerima
        await tx.transaction.create({
          data: {
            reference: `QIN${new Date().getTime()}`,
            userId: destPocket.userId,
            sourcePocketId: sourcePocket.id,
            destinationPocketId: destPocket.id,
            type: 'TRANSFER_IN',
            amount: paymentAmount,
            adminFee: 0,
            status: 'SUCCESS',
            description: `Terima Transfer P2P via QRIS dari ${user.fullName}`,
            recipientName: user.fullName,
            recipientBank: 'BANK J-NAL',
            recipientAccount: sourcePocket.accountNumber,
            completedAt: new Date()
          }
        });
      } else {
        // Merchant Logic
        senderTx = await tx.transaction.create({
          data: {
            reference: `QRS${new Date().getTime()}`,
            userId: user.id,
            sourcePocketId: sourcePocket.id,
            type: 'QRIS',
            amount: paymentAmount,
            adminFee: 0,
            status: 'SUCCESS',
            description: `Pembayaran QRIS ke ${merchant!.merchantName}`,
            recipientName: merchant!.merchantName,
            recipientBank: 'QRIS',
            idempotencyKey,
            completedAt: new Date()
          }
        });
      }

      return { senderTx, receiverId: destPocket?.userId };
    });

    if (result.receiverId) {
      io.to(`user_${result.receiverId}`).emit('notification', {
        title: 'Transfer Masuk',
        message: `Kamu menerima pembayaran QRIS sebesar Rp ${amount} dari pengguna`
      });
    }

    res.status(201).json(formatSuccess({
      transactionId: result.senderTx.id,
      reference: result.senderTx.reference,
      recipientName: result.senderTx.recipientName,
      amount: result.senderTx.amount,
      adminFee: result.senderTx.adminFee,
      total: result.senderTx.amount,
      status: result.senderTx.status,
      createdAt: result.senderTx.createdAt
    }));
  } catch (error: any) {
    if (error instanceof AppError) return res.status(error.statusCode).json(formatError(error.code, error.message));
    next(error);
  }
};
