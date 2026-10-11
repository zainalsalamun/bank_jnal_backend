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
    const cleanPayload = (payload || '').trim();

    // 1. Check if payload is Dynamic Merchant Order (e.g. QRIS-DYN-ORD-...)
    if (cleanPayload.startsWith('QRIS-DYN-')) {
      const orderNumber = cleanPayload.replace('QRIS-DYN-', '');
      const order = await db.merchantOrder.findUnique({
        where: { orderNumber },
        include: {
          merchant: true,
          outlet: true
        }
      });

      if (order) {
        if (order.status === 'SUCCESS') {
          return next(new AppError(400, 'ORDER_ALREADY_PAID', 'Tagihan QRIS ini sudah dibayar'));
        }

        return res.json(formatSuccess({
          merchantId: cleanPayload,
          merchantName: order.merchant.name,
          outletName: order.outlet?.name || order.merchant.name,
          city: order.merchant.city,
          amount: Number(order.finalAmount),
          editableAmount: false,
          type: 'MERCHANT_DYNAMIC_QRIS',
          orderNumber: order.orderNumber,
          note: order.note
        }));
      }
    }

    // 2. Check if payload is Static Merchant Outlet QR (e.g. QRIS-JNAL-...)
    if (cleanPayload.startsWith('QRIS-JNAL-')) {
      const outlet = await db.merchantOutlet.findUnique({
        where: { qrisCode: cleanPayload },
        include: {
          merchant: {
            include: { user: true }
          }
        }
      });

      if (outlet && outlet.merchant.status === 'ACTIVE' && outlet.isActive) {
        return res.json(formatSuccess({
          merchantId: cleanPayload,
          merchantName: outlet.merchant.name,
          outletName: outlet.name,
          city: outlet.city,
          amount: 0,
          editableAmount: true,
          type: 'MERCHANT_STATIC_QRIS',
          category: outlet.merchant.category
        }));
      }
    }

    // 3. Check if payload represents another customer's pocket account (P2P Transfer)
    const pocket = await db.pocket.findUnique({
      where: { accountNumber: cleanPayload },
      include: { user: true }
    });

    if (pocket && pocket.user.status === 'ACTIVE') {
      return res.json(formatSuccess({
        merchantId: pocket.accountNumber,
        merchantName: pocket.user.fullName,
        city: 'Nasabah BANK J-NAL',
        amount: 0,
        editableAmount: true,
        type: 'P2P_TRANSFER'
      }));
    }

    // 4. Default to standard / mock QRIS merchant
    const merchantId = cleanPayload || 'mrc_01';
    const merchant = await db.qrisMerchant.findUnique({ where: { merchantId } });
    
    if (!merchant || !merchant.isActive) {
      return next(new AppError(404, 'NOT_FOUND', 'Merchant atau rekening tidak ditemukan'));
    }

    res.json(formatSuccess({
      merchantId: merchant.merchantId,
      merchantName: merchant.merchantName,
      city: merchant.city,
      amount: 35000,
      editableAmount: false,
      type: 'STANDARD_QRIS'
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
    const cleanMerchantId = (merchantId || '').trim();
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
      if (!sourcePocket || sourcePocket.userId !== user.id) {
        throw new AppError(404, 'NOT_FOUND', 'Kantong sumber tidak ditemukan');
      }

      if (sourcePocket.balance.lt(paymentAmount)) {
        throw new AppError(409, 'INSUFFICIENT_BALANCE', 'Saldo tidak mencukupi');
      }

      // Deduct sender balance
      await tx.pocket.update({
        where: { id: sourcePocket.id },
        data: { balance: sourcePocket.balance.sub(paymentAmount) }
      });

      const txReference = `QRS${Date.now()}`;

      // CASE A: Dynamic QRIS Order (QRIS-DYN-...)
      if (cleanMerchantId.startsWith('QRIS-DYN-')) {
        const orderNumber = cleanMerchantId.replace('QRIS-DYN-', '');
        const order = await tx.merchantOrder.findUnique({
          where: { orderNumber },
          include: {
            merchant: {
              include: { pocket: true, user: true }
            },
            outlet: true
          }
        });

        if (!order) throw new AppError(404, 'NOT_FOUND', 'Order QRIS tidak ditemukan');
        if (order.status === 'SUCCESS') throw new AppError(400, 'ALREADY_PAID', 'Order ini sudah dibayar');

        // Credit Merchant Settlement Pocket
        await tx.pocket.update({
          where: { id: order.merchant.pocketId },
          data: { balance: order.merchant.pocket.balance.add(paymentAmount) }
        });

        // Update Order to SUCCESS
        await tx.merchantOrder.update({
          where: { id: order.id },
          data: {
            status: 'SUCCESS',
            transactionRef: txReference,
            paidAt: new Date(),
            customerName: user.fullName
          }
        });

        // Customer Sender Transaction Record
        const senderTx = await tx.transaction.create({
          data: {
            reference: txReference,
            userId: user.id,
            sourcePocketId: sourcePocket.id,
            destinationPocketId: order.merchant.pocketId,
            type: 'QRIS',
            amount: paymentAmount,
            adminFee: 0,
            status: 'SUCCESS',
            description: `Pembayaran QRIS Dinamis ke ${order.merchant.name}`,
            recipientName: order.merchant.name,
            recipientBank: 'BANK J-NAL MERCHANT',
            recipientAccount: order.merchant.pocket.accountNumber,
            idempotencyKey,
            completedAt: new Date()
          }
        });

        // Merchant Settlement Credit Transaction Record
        await tx.transaction.create({
          data: {
            reference: `QIN${Date.now()}`,
            userId: order.merchant.userId,
            sourcePocketId: sourcePocket.id,
            destinationPocketId: order.merchant.pocketId,
            type: 'TRANSFER_IN',
            amount: paymentAmount,
            adminFee: 0,
            status: 'SUCCESS',
            description: `Penerimaan QRIS ${order.orderNumber} dari ${user.fullName}`,
            recipientName: user.fullName,
            recipientBank: 'BANK J-NAL',
            recipientAccount: sourcePocket.accountNumber,
            completedAt: new Date()
          }
        });

        return {
          senderTx,
          merchantId: order.merchantId,
          outletId: order.outletId,
          orderNumber: order.orderNumber,
          merchantName: order.merchant.name,
          ownerUserId: order.merchant.userId
        };
      }

      // CASE B: Static QRIS Outlet (QRIS-JNAL-...)
      if (cleanMerchantId.startsWith('QRIS-JNAL-')) {
        const outlet = await tx.merchantOutlet.findUnique({
          where: { qrisCode: cleanMerchantId },
          include: {
            merchant: {
              include: { pocket: true, user: true }
            }
          }
        });

        if (!outlet) throw new AppError(404, 'NOT_FOUND', 'Outlet QRIS tidak ditemukan');

        // Credit Merchant Settlement Pocket
        await tx.pocket.update({
          where: { id: outlet.merchant.pocketId },
          data: { balance: outlet.merchant.pocket.balance.add(paymentAmount) }
        });

        // Record a completed MerchantOrder for analytics
        const orderNumber = `STA-${Date.now().toString().slice(-8)}`;
        await tx.merchantOrder.create({
          data: {
            orderNumber,
            merchantId: outlet.merchantId,
            outletId: outlet.id,
            totalAmount: paymentAmount,
            finalAmount: paymentAmount,
            status: 'SUCCESS',
            paymentMethod: 'QRIS_STATIC',
            transactionRef: txReference,
            customerName: user.fullName,
            paidAt: new Date()
          }
        });

        const senderTx = await tx.transaction.create({
          data: {
            reference: txReference,
            userId: user.id,
            sourcePocketId: sourcePocket.id,
            destinationPocketId: outlet.merchant.pocketId,
            type: 'QRIS',
            amount: paymentAmount,
            adminFee: 0,
            status: 'SUCCESS',
            description: `Pembayaran QRIS Statis ke ${outlet.merchant.name}`,
            recipientName: outlet.merchant.name,
            recipientBank: 'BANK J-NAL MERCHANT',
            recipientAccount: outlet.merchant.pocket.accountNumber,
            idempotencyKey,
            completedAt: new Date()
          }
        });

        // Mutasi masuk merchant
        await tx.transaction.create({
          data: {
            reference: `QIN${Date.now()}`,
            userId: outlet.merchant.userId,
            sourcePocketId: sourcePocket.id,
            destinationPocketId: outlet.merchant.pocketId,
            type: 'TRANSFER_IN',
            amount: paymentAmount,
            adminFee: 0,
            status: 'SUCCESS',
            description: `Penerimaan QRIS Statis dari ${user.fullName}`,
            recipientName: user.fullName,
            recipientBank: 'BANK J-NAL',
            recipientAccount: sourcePocket.accountNumber,
            completedAt: new Date()
          }
        });

        return {
          senderTx,
          merchantId: outlet.merchantId,
          outletId: outlet.id,
          orderNumber,
          merchantName: outlet.merchant.name,
          ownerUserId: outlet.merchant.userId
        };
      }

      // CASE C: P2P Account Number QR
      const destPocket = await tx.pocket.findUnique({
        where: { accountNumber: cleanMerchantId },
        include: { user: true }
      });

      if (destPocket) {
        await tx.pocket.update({
          where: { id: destPocket.id },
          data: { balance: destPocket.balance.add(paymentAmount) }
        });

        const senderTx = await tx.transaction.create({
          data: {
            reference: txReference,
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

        await tx.transaction.create({
          data: {
            reference: `QIN${Date.now()}`,
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

        return { senderTx, receiverId: destPocket.userId };
      }

      // CASE D: Standard Mock QrisMerchant
      const stdMerchant = await tx.qrisMerchant.findUnique({ where: { merchantId: cleanMerchantId } });
      const senderTx = await tx.transaction.create({
        data: {
          reference: txReference,
          userId: user.id,
          sourcePocketId: sourcePocket.id,
          type: 'QRIS',
          amount: paymentAmount,
          adminFee: 0,
          status: 'SUCCESS',
          description: `Pembayaran QRIS ke ${stdMerchant?.merchantName || 'Merchant'}`,
          recipientName: stdMerchant?.merchantName || 'Merchant',
          recipientBank: 'QRIS',
          idempotencyKey,
          completedAt: new Date()
        }
      });

      return { senderTx };
    });

    // Real-time Event Broadcaster via Socket.io
    if (result.merchantId) {
      const merchantEvent = {
        type: 'PAYMENT_RECEIVED',
        amount: Number(paymentAmount),
        customerName: user.fullName,
        orderNumber: result.orderNumber,
        reference: result.senderTx.reference,
        merchantName: result.merchantName,
        paidAt: new Date().toISOString()
      };

      // Broadcast to merchant room, outlet room, and global socket
      io.to(`merchant_${result.merchantId}`).emit('payment_received', merchantEvent);
      if (result.outletId) {
        io.to(`outlet_${result.outletId}`).emit('payment_received', merchantEvent);
      }
      io.emit('merchant_payment_received', merchantEvent);

      if (result.ownerUserId) {
        io.to(`user_${result.ownerUserId}`).emit('notification', {
          title: 'Pembayaran Diterima',
          message: `Kamu menerima pembayaran QRIS sebesar Rp ${paymentAmount.toNumber().toLocaleString('id-ID')} di ${result.merchantName}`
        });
      }
    } else if (result.receiverId) {
      io.to(`user_${result.receiverId}`).emit('notification', {
        title: 'Transfer Masuk',
        message: `Kamu menerima pembayaran QRIS sebesar Rp ${paymentAmount.toNumber().toLocaleString('id-ID')} dari ${user.fullName}`
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
