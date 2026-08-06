import { Response, NextFunction } from 'express';
import { db } from '../config/db';
import { formatSuccess, formatError } from '../utils/response';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/authMiddleware';
import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';

function generateReference(type: string) {
  const prefix = type === 'TRANSFER_IN' || type === 'TRANSFER_OUT' ? 'TRF' : type === 'QRIS' ? 'QRS' : 'TRX';
  const date = new Date().toISOString().replace(/[-:T]/g, '').slice(2, 10); // YYMMDDHH
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}${date}${rand}`;
}

export const getTransactions = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const type = req.query.type as string;
    const status = req.query.status as any;
    
    const where: any = { userId: req.user!.id };
    if (type) where.type = type;
    if (status) where.status = status;

    const [transactions, total] = await Promise.all([
      db.transaction.findMany({
        where,
        take: limit,
        skip: (page - 1) * limit,
        orderBy: { createdAt: 'desc' }
      }),
      db.transaction.count({ where })
    ]);

    const formatted = transactions.map(t => ({
      id: t.id,
      reference: t.reference,
      type: t.type,
      title: t.description || t.type,
      amount: t.amount,
      direction: t.type === 'TRANSFER_IN' ? 'CREDIT' : 'DEBIT',
      status: t.status,
      createdAt: t.createdAt
    }));

    res.json(formatSuccess(formatted, {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }));
  } catch (error) {
    next(error);
  }
};

export const getTransactionById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const transaction = await db.transaction.findUnique({
      where: { id: req.params.transactionId as string }
    });

    if (!transaction || transaction.userId !== req.user!.id) {
      return next(new AppError(404, 'NOT_FOUND', 'Transaksi tidak ditemukan'));
    }

    const total = Number(transaction.amount) + Number(transaction.adminFee);

    res.json(formatSuccess({
      id: transaction.id,
      reference: transaction.reference,
      type: transaction.type,
      amount: transaction.amount,
      adminFee: transaction.adminFee,
      total,
      status: transaction.status,
      senderName: transaction.recipientName || 'BANK J-NAL',
      sourceBank: 'BANK J-NAL',
      description: transaction.description,
      createdAt: transaction.createdAt,
      completedAt: transaction.completedAt,
    }));
  } catch (error) {
    next(error);
  }
};

export const inquiryTransfer = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { bankCode, accountNumber } = req.body;
    
    if (bankCode !== 'JNAL') {
      return next(new AppError(404, 'NOT_FOUND', 'Bank belum didukung'));
    }

    const pocket = await db.pocket.findUnique({
      where: { accountNumber },
      include: { user: true }
    });

    if (!pocket || pocket.user.status !== 'ACTIVE') {
      return next(new AppError(404, 'DESTINATION_NOT_FOUND', 'Rekening tujuan tidak ditemukan atau tidak aktif'));
    }

    res.json(formatSuccess({
      bankCode: 'JNAL',
      bankName: 'BANK J-NAL',
      accountNumber: pocket.accountNumber,
      accountName: pocket.user.fullName,
      adminFee: 0
    }));
  } catch (error) {
    next(error);
  }
};

export const transfer = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const idempotencyKey = req.headers['idempotency-key'] as string;
  if (!idempotencyKey) {
    return next(new AppError(422, 'VALIDATION_ERROR', 'Idempotency-Key header is required'));
  }

  try {
    const { sourcePocketId, destinationBankCode, destinationAccountNumber, amount, description, pin } = req.body;
    const transferAmount = new Prisma.Decimal(amount);

    if (transferAmount.lte(0) || transferAmount.gt(10000000)) {
      return res.status(409).json(formatError('LIMIT_EXCEEDED', 'Nominal tidak valid atau melampaui limit Rp 10.000.000'));
    }

    // Check Idempotency
    const existingTx = await db.transaction.findFirst({
      where: { idempotencyKey, userId: req.user!.id }
    });
    if (existingTx) {
      return res.status(201).json(formatSuccess(existingTx));
    }

    // Verify PIN
    const user = await db.user.findUnique({ where: { id: req.user!.id } });
    if (!user || user.status !== 'ACTIVE') {
      return res.status(403).json(formatError('ACCOUNT_BLOCKED', 'Akun tidak aktif'));
    }
    const isPinValid = await bcrypt.compare(pin, user.pinHash!);
    if (!isPinValid) {
      return res.status(409).json(formatError('INVALID_PIN', 'PIN salah'));
    }

    // Process Transaction Atomically
    const result = await db.$transaction(async (tx) => {
      const sourcePocket = await tx.pocket.findUnique({ where: { id: sourcePocketId } });
      const destPocket = await tx.pocket.findUnique({ where: { accountNumber: destinationAccountNumber }, include: { user: true } });
      
      if (!sourcePocket || sourcePocket.userId !== user.id) {
        throw new AppError(404, 'NOT_FOUND', 'Kantong sumber tidak ditemukan');
      }
      if (!destPocket) {
        throw new AppError(404, 'DESTINATION_NOT_FOUND', 'Rekening tujuan tidak ditemukan');
      }

      if (sourcePocket.balance.lt(transferAmount)) {
        throw new AppError(409, 'INSUFFICIENT_BALANCE', 'Saldo tidak mencukupi');
      }

      // Deduct source
      await tx.pocket.update({
        where: { id: sourcePocket.id },
        data: { balance: sourcePocket.balance.sub(transferAmount) }
      });

      // Add to dest
      await tx.pocket.update({
        where: { id: destPocket.id },
        data: { balance: destPocket.balance.add(transferAmount) }
      });

      // Create Sender Transaction
      const senderTx = await tx.transaction.create({
        data: {
          reference: generateReference('TRANSFER_OUT'),
          userId: user.id,
          sourcePocketId: sourcePocket.id,
          destinationPocketId: destPocket.id,
          type: 'TRANSFER_OUT',
          amount: transferAmount,
          adminFee: 0,
          status: 'SUCCESS',
          description,
          recipientName: destPocket.user.fullName,
          recipientBank: 'BANK J-NAL',
          recipientAccount: destPocket.accountNumber,
          idempotencyKey,
          completedAt: new Date()
        }
      });

      // Create Receiver Transaction (different idempotency key to avoid clash)
      await tx.transaction.create({
        data: {
          reference: generateReference('TRANSFER_IN'),
          userId: destPocket.userId,
          sourcePocketId: sourcePocket.id,
          destinationPocketId: destPocket.id,
          type: 'TRANSFER_IN',
          amount: transferAmount,
          adminFee: 0,
          status: 'SUCCESS',
          description,
          recipientName: user.fullName,
          recipientBank: 'BANK J-NAL',
          recipientAccount: sourcePocket.accountNumber,
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
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(formatError(error.code, error.message));
    }
    next(error);
  }
};
