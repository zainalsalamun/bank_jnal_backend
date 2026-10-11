import { Request, Response, NextFunction } from 'express';
import { db } from '../../config/db';
import { formatSuccess, formatError } from '../../utils/response';
import { AppError } from '../../middleware/errorHandler';
import { MerchantStatus } from '@prisma/client';

export const getAllMerchants = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const { status, search } = req.query;

    const whereClause: any = {
      ...(status ? { status: status as MerchantStatus } : {}),
      ...(search ? {
        OR: [
          { name: { contains: search as string, mode: 'insensitive' } },
          { phone: { contains: search as string } },
          { user: { fullName: { contains: search as string, mode: 'insensitive' } } }
        ]
      } : {})
    };

    const [merchants, total] = await Promise.all([
      db.merchant.findMany({
        where: whereClause,
        include: {
          user: { select: { fullName: true, phone: true, email: true } },
          pocket: { select: { accountNumber: true, name: true, balance: true } },
          outlets: true,
          _count: { select: { orders: true, products: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit
      }),
      db.merchant.count({ where: whereClause })
    ]);

    const formatted = merchants.map(m => ({
      id: m.id,
      name: m.name,
      brandName: m.brandName,
      category: m.category,
      city: m.city,
      address: m.address,
      phone: m.phone,
      status: m.status,
      ownerName: m.user.fullName,
      ownerPhone: m.user.phone,
      settlementAccount: m.pocket.accountNumber,
      pocketBalance: m.pocket.balance,
      outletCount: m.outlets.length,
      orderCount: m._count.orders,
      productCount: m._count.products,
      createdAt: m.createdAt
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

export const getMerchantDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const merchant = await db.merchant.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, fullName: true, phone: true, email: true } },
        pocket: true,
        outlets: true,
        staff: true,
        products: { take: 10 },
        orders: {
          take: 20,
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!merchant) {
      return next(new AppError(404, 'NOT_FOUND', 'Merchant tidak ditemukan'));
    }

    res.json(formatSuccess(merchant));
  } catch (error) {
    next(error);
  }
};

export const updateMerchantStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { status } = req.body;

    if (!['ACTIVE', 'PENDING', 'SUSPENDED', 'REJECTED'].includes(status)) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Status merchant tidak valid'));
    }

    const merchant = await db.merchant.update({
      where: { id },
      data: { status: status as MerchantStatus },
      include: { user: true }
    });

    res.json(formatSuccess(merchant));
  } catch (error) {
    next(error);
  }
};

export const getAllMerchantTransactions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const { merchantId, status } = req.query;

    const whereClause: any = {
      ...(merchantId ? { merchantId: merchantId as string } : {}),
      ...(status ? { status: status as any } : {})
    };

    const [orders, total] = await Promise.all([
      db.merchantOrder.findMany({
        where: whereClause,
        include: {
          merchant: { select: { name: true, category: true } },
          outlet: { select: { name: true } },
          items: true
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

export const getMerchantGlobalStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [totalMerchants, activeMerchants, totalOrders, volumeResult] = await Promise.all([
      db.merchant.count(),
      db.merchant.count({ where: { status: 'ACTIVE' } }),
      db.merchantOrder.count(),
      db.merchantOrder.aggregate({
        where: { status: 'SUCCESS' },
        _sum: { finalAmount: true }
      })
    ]);

    const totalTurnover = Number(volumeResult._sum.finalAmount || 0);

    res.json(formatSuccess({
      totalMerchants,
      activeMerchants,
      totalOrders,
      totalTurnover,
      mdrRevenue: Math.round(totalTurnover * 0.007)
    }));
  } catch (error) {
    next(error);
  }
};
