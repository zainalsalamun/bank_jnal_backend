import { Request, Response, NextFunction } from 'express';
import { db } from '../../config/db';
import { formatSuccess, formatError } from '../../utils/response';
import { AppError } from '../../middleware/errorHandler';
import { AuthRequest } from '../../middleware/authMiddleware';
import { Prisma } from '@prisma/client';

export const createDynamicQris = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { amount, note, outletId, customerName } = req.body;
    const userId = req.user?.id;

    if (!amount || Number(amount) <= 0) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Nominal QRIS harus lebih besar dari 0'));
    }

    const merchant = await db.merchant.findFirst({
      where: {
        OR: [
          { userId },
          { staff: { some: { id: userId } } },
          { staff: { some: { userId } } }
        ]
      },
      include: {
        outlets: true
      }
    });

    if (!merchant) {
      return next(new AppError(404, 'NOT_FOUND', 'Merchant tidak ditemukan'));
    }

    const targetOutletId = outletId || merchant.outlets[0]?.id;
    const orderNumber = `ORD-${Date.now().toString().slice(-8)}-${Math.floor(100 + Math.random() * 900)}`;
    const qrisDynamicPayload = `QRIS-DYN-${orderNumber}`;

    const order = await db.merchantOrder.create({
      data: {
        orderNumber,
        merchantId: merchant.id,
        outletId: targetOutletId,
        totalAmount: new Prisma.Decimal(amount),
        finalAmount: new Prisma.Decimal(amount),
        status: 'PENDING',
        paymentMethod: 'QRIS_DYNAMIC',
        customerName: customerName || 'Pelanggan Toko',
        note: note || 'Pembayaran QRIS Kasir',
      },
      include: {
        merchant: true,
        outlet: true
      }
    });

    res.status(201).json(formatSuccess({
      orderId: order.id,
      orderNumber: order.orderNumber,
      qrisCode: qrisDynamicPayload,
      amount: order.finalAmount,
      merchantName: merchant.name,
      outletName: order.outlet?.name || merchant.name,
      city: merchant.city,
      status: order.status,
      createdAt: order.createdAt,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 mins validity
    }));
  } catch (error) {
    next(error);
  }
};

export const getStaticQris = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const { outletId } = req.query;

    const merchant = await db.merchant.findFirst({
      where: {
        OR: [
          { userId },
          { staff: { some: { id: userId } } },
          { staff: { some: { userId } } }
        ]
      },
      include: {
        outlets: true,
        pocket: true
      }
    });

    if (!merchant) {
      return next(new AppError(404, 'NOT_FOUND', 'Merchant tidak ditemukan'));
    }

    const outlet = outletId 
      ? merchant.outlets.find(o => o.id === outletId) 
      : merchant.outlets[0];

    if (!outlet) {
      return next(new AppError(404, 'NOT_FOUND', 'Outlet tidak ditemukan'));
    }

    res.json(formatSuccess({
      merchantId: merchant.id,
      merchantName: merchant.name,
      brandName: merchant.brandName,
      outletId: outlet.id,
      outletName: outlet.name,
      city: outlet.city,
      qrisCode: outlet.qrisCode,
      accountNumber: merchant.pocket?.accountNumber,
      category: merchant.category
    }));
  } catch (error) {
    next(error);
  }
};

export const checkOrderStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const orderNumber = req.params.orderNumber as string;
    const order = await db.merchantOrder.findUnique({
      where: { orderNumber },
      include: {
        items: true,
        outlet: true
      }
    });

    if (!order) {
      return next(new AppError(404, 'NOT_FOUND', 'Order tidak ditemukan'));
    }

    res.json(formatSuccess({
      orderNumber: order.orderNumber,
      status: order.status,
      amount: order.finalAmount,
      transactionRef: order.transactionRef,
      paidAt: order.paidAt,
      customerName: order.customerName
    }));
  } catch (error) {
    next(error);
  }
};
