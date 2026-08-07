import { Request, Response, NextFunction } from 'express';
import { db } from '../config/db';
import { formatSuccess } from '../utils/response';
import bcrypt from 'bcrypt';
import { AppError } from '../middleware/errorHandler';
import { Role, UserStatus } from '@prisma/client';

export const getUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const [users, total] = await Promise.all([
      db.user.findMany({
        take: limit,
        skip: (page - 1) * limit,
        orderBy: { createdAt: 'desc' }
      }),
      db.user.count()
    ]);

    const formatted = users.map(u => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      phone: u.phone,
      role: u.role,
      status: u.status,
      createdAt: u.createdAt
    }));

    res.json(formatSuccess(formatted, { page, limit, total, totalPages: Math.ceil(total / limit) }));
  } catch (error) {
    next(error);
  }
};

export const getTransactions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const [transactions, total] = await Promise.all([
      db.transaction.findMany({
        take: limit,
        skip: (page - 1) * limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { fullName: true } } }
      }),
      db.transaction.count()
    ]);

    res.json(formatSuccess(transactions.map(t => ({
      id: t.id,
      reference: t.reference,
      userName: t.user.fullName,
      type: t.type,
      amount: t.amount,
      status: t.status,
      createdAt: t.createdAt
    })), { page, limit, total, totalPages: Math.ceil(total / limit) }));
  } catch (error) {
    next(error);
  }
};

export const getStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const usersTotal = await db.user.count();
    const txTotal = await db.transaction.count();
    const failedTx = await db.transaction.count({ where: { status: 'FAILED' } });
    const successTx = await db.transaction.count({ where: { status: 'SUCCESS' } });
    
    const volumeResult = await db.transaction.aggregate({
      where: { status: 'SUCCESS' },
      _sum: { amount: true }
    });
    const totalVolume = Number(volumeResult._sum.amount || 0);

    // Mocking 7-day chart data based on total volume for simplicity
    const baseDaily = totalVolume / 7;
    const chartData = [
      { day: "Sen", volume: baseDaily * 0.8 },
      { day: "Sel", volume: baseDaily * 1.2 },
      { day: "Rab", volume: baseDaily * 0.9 },
      { day: "Kam", volume: baseDaily * 1.1 },
      { day: "Jum", volume: baseDaily * 1.5 },
      { day: "Sab", volume: baseDaily * 1.3 },
      { day: "Min", volume: baseDaily * 0.7 }
    ];

    res.json(formatSuccess({
      usersTotal,
      txTotal,
      failedRate: txTotal > 0 ? (failedTx / txTotal) * 100 : 0,
      totalVolume,
      chartData
    }));
  } catch (error) {
    next(error);
  }
};

export const getMonitoring = async (req: Request, res: Response) => {
  // Simulating monitoring metrics
  res.json(formatSuccess({
    uptime: "99.98%",
    apiResponseP95: "126 ms",
    errorRate: "0.32%",
    onlineUsers: Math.floor(Math.random() * 500) + 100,
    resources: [
      { name: "CPU", value: "38%", width: 38 },
      { name: "Memori", value: "62%", width: 62 },
      { name: "Database", value: "44%", width: 44 },
      { name: "Penyimpanan", value: "57%", width: 57 }
    ],
    logs: [
      { status: "ok", title: "Transfer API pulih", time: "14:02 · otomatis" },
      { status: "warn", title: "Latensi QRIS meningkat", time: "13:46 · sedang dipantau" },
      { status: "ok", title: "Backup database selesai", time: "12:00 · berhasil" }
    ]
  }));
};

export const createNotification = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, message, target } = req.body;
    // target is 'all', 'active', etc.
    // For simplicity, we just save one notification record where userId is null (broadcast)
    const notif = await db.notification.create({
      data: {
        title,
        message,
        type: 'SYSTEM', // default
        userId: null 
      }
    });
    res.json(formatSuccess(notif));
  } catch (error) {
    next(error);
  }
};

export const getNotifications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notifs = await db.notification.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    res.json(formatSuccess(notifs));
  } catch (error) {
    next(error);
  }
};

export const createPromotion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, description } = req.body;
    const promo = await db.promotion.create({
      data: {
        title,
        description,
        status: 'DRAFT',
        startAt: new Date(),
        endAt: new Date(new Date().setMonth(new Date().getMonth() + 1))
      }
    });
    res.json(formatSuccess(promo));
  } catch (error) {
    next(error);
  }
};

export const getPromotions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const promos = await db.promotion.findMany({
      orderBy: { startAt: 'desc' }
    });
    res.json(formatSuccess(promos));
  } catch (error) {
    next(error);
  }
};

export const createUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { fullName, email, phone, role } = req.body;
    
    // Check if user already exists
    const existing = await db.user.findFirst({
      where: {
        OR: [
          { email },
          { phone }
        ]
      }
    });

    if (existing) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Email atau nomor telepon sudah terdaftar'));
    }

    const passwordHash = await bcrypt.hash('password-demo', 10);
    
    const user = await db.user.create({
      data: {
        fullName,
        email,
        phone,
        role: role as Role || 'CUSTOMER',
        passwordHash,
        status: 'ACTIVE',
        isVerified: true
      }
    });

    res.json(formatSuccess({ id: user.id, fullName: user.fullName, email: user.email, role: user.role }));
  } catch (error) {
    next(error);
  }
};

export const updateUserStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['ACTIVE', 'BLOCKED', 'PENDING'].includes(status)) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Status tidak valid'));
    }

    const user = await db.user.update({
      where: { id },
      data: { status: status as UserStatus }
    });

    res.json(formatSuccess({ id: user.id, status: user.status }));
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { fullName, phone, email, role } = req.body;
    
    const user = await db.user.update({
      where: { id },
      data: { 
        ...(fullName && { fullName }),
        ...(phone && { phone }),
        ...(email && { email }),
        ...(role && { role: role as Role })
      }
    });

    res.json(formatSuccess({ id: user.id, fullName: user.fullName, role: user.role }));
  } catch (error) {
    next(error);
  }
};

export const deleteUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    
    // Check if trying to delete a SUPER_ADMIN
    const user = await db.user.findUnique({ where: { id } });
    if (user?.role === 'SUPER_ADMIN') {
      return next(new AppError(403, 'FORBIDDEN', 'Tidak dapat menghapus Super Admin'));
    }

    await db.user.delete({
      where: { id }
    });

    res.json(formatSuccess(null, { message: 'Pengguna berhasil dihapus' }));
  } catch (error) {
    next(error);
  }
};
