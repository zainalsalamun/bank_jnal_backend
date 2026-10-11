import { Request, Response, NextFunction } from 'express';
import { db } from '../../config/db';
import { formatSuccess, formatError } from '../../utils/response';
import { AppError } from '../../middleware/errorHandler';
import { AuthRequest } from '../../middleware/authMiddleware';
import { Prisma } from '@prisma/client';

export const createPosOrder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const { items, discountAmount = 0, taxAmount = 0, note, customerName, outletId } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Keranjang kasir kosong'));
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

    // Calculate subtotal
    let totalSubtotal = 0;
    const orderItemsData = items.map((item: any) => {
      const itemPrice = Number(item.price);
      const qty = Number(item.quantity) || 1;
      const subtotal = itemPrice * qty;
      totalSubtotal += subtotal;

      return {
        productId: item.productId || null,
        productName: item.productName || item.name,
        price: new Prisma.Decimal(itemPrice),
        quantity: qty,
        subtotal: new Prisma.Decimal(subtotal)
      };
    });

    const discount = Number(discountAmount) || 0;
    const tax = Number(taxAmount) || 0;
    const finalAmount = Math.max(0, totalSubtotal - discount + tax);

    const orderNumber = `POS-${Date.now().toString().slice(-8)}-${Math.floor(100 + Math.random() * 900)}`;
    const qrisDynamicPayload = `QRIS-DYN-${orderNumber}`;

    const order = await db.merchantOrder.create({
      data: {
        orderNumber,
        merchantId: merchant.id,
        outletId: targetOutletId,
        totalAmount: new Prisma.Decimal(totalSubtotal),
        discountAmount: new Prisma.Decimal(discount),
        taxAmount: new Prisma.Decimal(tax),
        finalAmount: new Prisma.Decimal(finalAmount),
        status: 'PENDING',
        paymentMethod: 'QRIS_DYNAMIC',
        customerName: customerName || 'Pelanggan Walk-in',
        note,
        items: {
          create: orderItemsData
        }
      },
      include: {
        items: true,
        outlet: true,
        merchant: true
      }
    });

    res.status(201).json(formatSuccess({
      orderId: order.id,
      orderNumber: order.orderNumber,
      qrisCode: qrisDynamicPayload,
      totalAmount: order.totalAmount,
      discountAmount: order.discountAmount,
      taxAmount: order.taxAmount,
      finalAmount: order.finalAmount,
      items: order.items,
      merchantName: merchant.name,
      outletName: order.outlet?.name,
      createdAt: order.createdAt
    }));
  } catch (error) {
    next(error);
  }
};

export const getMerchantOrders = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const { status, startDate, endDate } = req.query;

    const merchant = await db.merchant.findFirst({
      where: {
        OR: [
          { userId },
          { staff: { some: { id: userId } } },
          { staff: { some: { userId } } }
        ]
      }
    });

    if (!merchant) {
      return next(new AppError(404, 'NOT_FOUND', 'Merchant tidak ditemukan'));
    }

    const whereClause: any = {
      merchantId: merchant.id,
      ...(status ? { status: status as any } : {}),
      ...(startDate && endDate ? {
        createdAt: {
          gte: new Date(startDate as string),
          lte: new Date(endDate as string)
        }
      } : {})
    };

    const [orders, total] = await Promise.all([
      db.merchantOrder.findMany({
        where: whereClause,
        include: {
          items: true,
          outlet: { select: { name: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit
      }),
      db.merchantOrder.count({ where: whereClause })
    ]);

    res.json(formatSuccess(orders, {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }));
  } catch (error) {
    next(error);
  }
};

export const getDailySummary = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;

    const merchant = await db.merchant.findFirst({
      where: {
        OR: [
          { userId },
          { staff: { some: { id: userId } } },
          { staff: { some: { userId } } }
        ]
      },
      include: {
        pocket: true
      }
    });

    if (!merchant) {
      return next(new AppError(404, 'NOT_FOUND', 'Merchant tidak ditemukan'));
    }

    // Start of today
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [todayOrders, todaySuccessOrders, todayVolumeResult, latestTransactions] = await Promise.all([
      db.merchantOrder.count({
        where: {
          merchantId: merchant.id,
          createdAt: { gte: startOfToday }
        }
      }),
      db.merchantOrder.count({
        where: {
          merchantId: merchant.id,
          status: 'SUCCESS',
          createdAt: { gte: startOfToday }
        }
      }),
      db.merchantOrder.aggregate({
        where: {
          merchantId: merchant.id,
          status: 'SUCCESS',
          createdAt: { gte: startOfToday }
        },
        _sum: { finalAmount: true }
      }),
      db.merchantOrder.findMany({
        where: {
          merchantId: merchant.id
        },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          items: true
        }
      })
    ]);

    const todayOmset = Number(todayVolumeResult._sum.finalAmount || 0);

    res.json(formatSuccess({
      merchantName: merchant.name,
      category: merchant.category,
      pocketBalance: merchant.pocket?.balance || 0,
      pocketAccountNumber: merchant.pocket?.accountNumber || '-',
      todayOmset,
      todayTotalTransactions: todayOrders,
      todaySuccessTransactions: todaySuccessOrders,
      averageTicket: todaySuccessOrders > 0 ? Math.round(todayOmset / todaySuccessOrders) : 0,
      recentOrders: latestTransactions
    }));
  } catch (error) {
    next(error);
  }
};

export const getTransferAccount = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;

    const merchant = await db.merchant.findFirst({
      where: {
        OR: [
          { userId },
          { staff: { some: { id: userId } } },
          { staff: { some: { userId } } }
        ]
      },
      include: {
        pocket: {
          include: {
            user: { select: { fullName: true, phone: true } }
          }
        }
      }
    });

    if (!merchant || !merchant.pocket) {
      return next(new AppError(404, 'NOT_FOUND', 'Rekening merchant tidak ditemukan'));
    }

    res.json(formatSuccess({
      bankName: 'BANK J-NAL',
      bankCode: 'JNAL',
      accountNumber: merchant.pocket.accountNumber,
      accountName: merchant.pocket.user.fullName,
      merchantName: merchant.name,
      brandName: merchant.brandName || merchant.name,
      category: merchant.category,
      pocketName: merchant.pocket.name,
      balance: Number(merchant.pocket.balance),
    }));
  } catch (error) {
    next(error);
  }
};

export const getTransferMutations = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const limit = parseInt(req.query.limit as string) || 20;

    const merchant = await db.merchant.findFirst({
      where: {
        OR: [
          { userId },
          { staff: { some: { id: userId } } },
          { staff: { some: { userId } } }
        ]
      }
    });

    if (!merchant || !merchant.pocketId) {
      return next(new AppError(404, 'NOT_FOUND', 'Merchant tidak ditemukan'));
    }

    const mutations = await db.transaction.findMany({
      where: {
        destinationPocketId: merchant.pocketId,
        type: { in: ['TRANSFER_IN', 'QRIS'] },
        status: 'SUCCESS'
      },
      orderBy: { completedAt: 'desc' },
      take: limit
    });

    res.json(formatSuccess(mutations));
  } catch (error) {
    next(error);
  }
};

