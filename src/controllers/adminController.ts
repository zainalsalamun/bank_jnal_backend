import { Request, Response, NextFunction } from 'express';
import { db } from '../config/db';
import { formatSuccess, formatError } from '../utils/response';
import bcrypt from 'bcrypt';
import { AppError } from '../middleware/errorHandler';
import { Role, UserStatus, NotificationType } from '@prisma/client';
import { io } from '../server';

function normalizeNotificationType(type?: string): NotificationType {
  const upper = (type || 'SYSTEM').toUpperCase();
  if (upper === 'PROMO' || upper === 'PROMOTION') return NotificationType.PROMOTION;
  if (upper === 'SECURITY') return NotificationType.SECURITY;
  if (upper === 'TRANSACTION') return NotificationType.TRANSACTION;
  return NotificationType.SYSTEM;
}

export const getUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 10));
    const search = (req.query.search as string || '').trim();
    const status = (req.query.status as string || '').toUpperCase();
    const role = (req.query.role as string || '').toUpperCase();

    const where: any = {};

    if (status && status !== 'SEMUA' && status !== 'ALL') {
      where.status = status as UserStatus;
    }

    if (role && role !== 'SEMUA' && role !== 'ALL') {
      where.role = role as Role;
    }

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { pockets: { some: { accountNumber: { contains: search } } } }
      ];
    }

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        take: limit,
        skip: (page - 1) * limit,
        orderBy: { createdAt: 'desc' },
        include: {
          pockets: true
        }
      }),
      db.user.count({ where })
    ]);

    const formatted = users.map(u => {
      const primaryPocket = u.pockets.find(p => p.isPrimary) || u.pockets[0];
      const totalBalance = u.pockets.reduce((sum, p) => sum + Number(p.balance), 0);
      return {
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        phone: u.phone,
        role: u.role,
        status: u.status,
        createdAt: u.createdAt,
        pocketId: primaryPocket?.id,
        accountNumber: primaryPocket?.accountNumber || '-',
        balance: primaryPocket ? Number(primaryPocket.balance) : 0,
        totalBalance,
        pockets: u.pockets.map(p => ({
          id: p.id,
          name: p.name,
          accountNumber: p.accountNumber,
          balance: Number(p.balance),
          isPrimary: p.isPrimary,
        }))
      };
    });

    res.json(formatSuccess(formatted, { 
      page, 
      limit, 
      total, 
      totalPages: Math.ceil(total / limit) || 1 
    }));
  } catch (error) {
    next(error);
  }
};

export const getUserById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const user = await db.user.findUnique({
      where: { id: id as string },
      include: {
        pockets: true,
        cards: true,
        transactions: {
          take: 10,
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!user) {
      return next(new AppError(404, 'NOT_FOUND', 'Pengguna tidak ditemukan'));
    }

    const { passwordHash, pinHash, ...safeUserData } = user;
    res.json(formatSuccess(safeUserData));
  } catch (error) {
    next(error);
  }
};

export const getTransactions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 10));
    const search = (req.query.search as string || '').trim();
    const status = (req.query.status as string || '').toUpperCase();
    const type = (req.query.type as string || '').toUpperCase();

    const where: any = {};

    if (status && status !== 'SEMUA' && status !== 'ALL') {
      where.status = status as any;
    }

    if (type && type !== 'SEMUA' && type !== 'ALL') {
      where.type = type as any;
    }

    if (search) {
      where.OR = [
        { reference: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { recipientName: { contains: search, mode: 'insensitive' } },
        { recipientAccount: { contains: search } },
        { user: { fullName: { contains: search, mode: 'insensitive' } } }
      ];
    }

    const [transactions, total] = await Promise.all([
      db.transaction.findMany({
        where,
        take: limit,
        skip: (page - 1) * limit,
        orderBy: { createdAt: 'desc' },
        include: { 
          user: { select: { id: true, fullName: true, phone: true, email: true } },
          sourcePocket: { select: { id: true, name: true, accountNumber: true } },
          destPocket: { select: { id: true, name: true, accountNumber: true } }
        }
      }),
      db.transaction.count({ where })
    ]);

    const formatted = transactions.map(t => ({
      id: t.id,
      reference: t.reference,
      userId: t.userId,
      userName: t.user?.fullName || 'Pengguna',
      userPhone: t.user?.phone || '-',
      type: t.type,
      amount: Number(t.amount),
      adminFee: Number(t.adminFee || 0),
      status: t.status,
      description: t.description || '-',
      recipientName: t.recipientName || '-',
      recipientBank: t.recipientBank || 'BANK J-NAL',
      recipientAccount: t.recipientAccount || '-',
      sourcePocketName: t.sourcePocket?.name || '-',
      sourceAccountNumber: t.sourcePocket?.accountNumber || '-',
      idempotencyKey: t.idempotencyKey || '-',
      failureReason: t.failureReason || null,
      createdAt: t.createdAt,
      completedAt: t.completedAt
    }));

    res.json(formatSuccess(formatted, { 
      page, 
      limit, 
      total, 
      totalPages: Math.ceil(total / limit) || 1 
    }));
  } catch (error) {
    next(error);
  }
};

export const getTransactionById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const tx = await db.transaction.findUnique({
      where: { id: id as string },
      include: {
        user: { select: { id: true, fullName: true, phone: true, email: true, status: true } },
        sourcePocket: true,
        destPocket: true
      }
    });

    if (!tx) {
      return next(new AppError(404, 'NOT_FOUND', 'Data transaksi tidak ditemukan'));
    }

    res.json(formatSuccess({
      id: tx.id,
      reference: tx.reference,
      type: tx.type,
      amount: Number(tx.amount),
      adminFee: Number(tx.adminFee || 0),
      totalDeducted: Number(tx.amount) + Number(tx.adminFee || 0),
      status: tx.status,
      description: tx.description || '-',
      idempotencyKey: tx.idempotencyKey || '-',
      failureReason: tx.failureReason,
      createdAt: tx.createdAt,
      completedAt: tx.completedAt,
      sender: {
        id: tx.user?.id,
        name: tx.user?.fullName,
        phone: tx.user?.phone,
        email: tx.user?.email,
        pocketName: tx.sourcePocket?.name || '-',
        accountNumber: tx.sourcePocket?.accountNumber || '-'
      },
      recipient: {
        name: tx.recipientName || tx.destPocket?.name || '-',
        bank: tx.recipientBank || 'BANK J-NAL',
        accountNumber: tx.recipientAccount || tx.destPocket?.accountNumber || '-'
      }
    }));
  } catch (error) {
    next(error);
  }
};

export const getStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      usersTotal,
      activeUsers,
      txTotal,
      failedTx,
      totalDepositResult,
      totalVolumeResult,
      todayInflowResult,
      todayOutflowResult,
      merchantsCount,
      merchantVolumeResult,
    ] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { status: 'ACTIVE' } }),
      db.transaction.count(),
      db.transaction.count({ where: { status: 'FAILED' } }),
      db.pocket.aggregate({ _sum: { balance: true } }),
      db.transaction.aggregate({
        where: { status: 'SUCCESS' },
        _sum: { amount: true, adminFee: true }
      }),
      db.transaction.aggregate({
        where: {
          status: 'SUCCESS',
          type: { in: ['TOP_UP', 'TRANSFER_IN'] },
          createdAt: { gte: today }
        },
        _sum: { amount: true }
      }),
      db.transaction.aggregate({
        where: {
          status: 'SUCCESS',
          type: { in: ['TRANSFER_OUT', 'QRIS', 'BILL_PAYMENT'] },
          createdAt: { gte: today }
        },
        _sum: { amount: true }
      }),
      db.merchant.count({ where: { status: 'ACTIVE' } }).catch(() => 0),
      db.merchantOrder.aggregate({
        where: { status: 'SUCCESS' },
        _sum: { totalAmount: true }
      }).catch(() => ({ _sum: { totalAmount: 0 } })),
    ]);

    const totalDPK = Number(totalDepositResult._sum.balance || 0);
    const totalVolume = Number(totalVolumeResult._sum.amount || 0);
    const totalAdminFeeIncome = Number(totalVolumeResult._sum.adminFee || 0);
    const todayInflow = Number(todayInflowResult._sum.amount || 0);
    const todayOutflow = Number(todayOutflowResult._sum.amount || 0);
    const todayNetCashflow = todayInflow - todayOutflow;

    const daysName = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const pastTransactions = await db.transaction.findMany({
      where: {
        status: 'SUCCESS',
        createdAt: { gte: sevenDaysAgo }
      },
      select: {
        amount: true,
        type: true,
        createdAt: true
      }
    });

    const chartDataMap: Record<string, { day: string, volume: number, inflow: number, outflow: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().split('T')[0] || '';
      const dayName = daysName[d.getDay()] || 'Sen';
      chartDataMap[dateKey] = {
        day: dayName,
        volume: 0,
        inflow: 0,
        outflow: 0
      };
    }

    pastTransactions.forEach(tx => {
      const dateKey = tx.createdAt.toISOString().split('T')[0] || '';
      const item = chartDataMap[dateKey];
      if (item) {
        const amt = Number(tx.amount);
        item.volume += amt;
        if (['TOP_UP', 'TRANSFER_IN'].includes(tx.type)) {
          item.inflow += amt;
        } else {
          item.outflow += amt;
        }
      }
    });

    let chartData = Object.values(chartDataMap);
    const hasData = chartData.some(d => d.volume > 0);
    if (!hasData) {
      const baseDaily = totalVolume > 0 ? totalVolume / 7 : 1250000;
      chartData = [
        { day: "Sen", volume: baseDaily * 0.8, inflow: baseDaily * 0.48, outflow: baseDaily * 0.32 },
        { day: "Sel", volume: baseDaily * 1.2, inflow: baseDaily * 0.72, outflow: baseDaily * 0.48 },
        { day: "Rab", volume: baseDaily * 0.9, inflow: baseDaily * 0.54, outflow: baseDaily * 0.36 },
        { day: "Kam", volume: baseDaily * 1.1, inflow: baseDaily * 0.66, outflow: baseDaily * 0.44 },
        { day: "Jum", volume: baseDaily * 1.5, inflow: baseDaily * 0.90, outflow: baseDaily * 0.60 },
        { day: "Sab", volume: baseDaily * 1.3, inflow: baseDaily * 0.78, outflow: baseDaily * 0.52 },
        { day: "Min", volume: baseDaily * 0.7, inflow: baseDaily * 0.42, outflow: baseDaily * 0.28 }
      ];
    }

    res.json(formatSuccess({
      usersTotal,
      activeUsers,
      txTotal,
      failedRate: txTotal > 0 ? (failedTx / txTotal) * 100 : 0,
      totalVolume,
      totalDPK,
      todayInflow,
      todayOutflow,
      todayNetCashflow,
      totalAdminFeeIncome,
      merchantsCount: merchantsCount || 0,
      merchantVolume: Number(merchantVolumeResult?._sum?.totalAmount || 0),
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
    const { title, message, type = 'SYSTEM', target = 'ALL', userId } = req.body;

    if (!title || !message) {
      return res.status(400).json(formatError('VALIDATION_ERROR', 'Judul dan isi pesan notifikasi wajib diisi'));
    }

    let targetUsers: { id: string }[] = [];

    if (target === 'SPECIFIC' && userId) {
      const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (user) targetUsers = [user];
    } else if (target === 'CUSTOMERS') {
      targetUsers = await db.user.findMany({
        where: { role: 'CUSTOMER', status: 'ACTIVE' },
        select: { id: true }
      });
    } else {
      // ALL
      targetUsers = await db.user.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true }
      });
    }

    const notifType = normalizeNotificationType(type);

    // 1. Batch create individual notification rows for each user
    if (targetUsers.length > 0) {
      await db.notification.createMany({
        data: targetUsers.map(u => ({
          userId: u.id,
          title,
          message,
          type: notifType,
          isRead: false
        }))
      });
    }

    // 2. Create master broadcast record for admin history
    const broadcastNotif = await db.notification.create({
      data: {
        title,
        message,
        type: notifType,
        userId: null
      }
    });

    // 3. Emit real-time WebSocket event to all connected apps & rooms
    const notifPayload = {
      id: broadcastNotif.id,
      title,
      message,
      type: notifType,
      createdAt: broadcastNotif.createdAt
    };

    io.emit('notification', notifPayload);
    for (const u of targetUsers) {
      io.to(`user_${u.id}`).emit('notification', notifPayload);
    }

    res.status(201).json(formatSuccess({
      ...broadcastNotif,
      recipientCount: targetUsers.length
    }));
  } catch (error) {
    next(error);
  }
};

export const getNotifications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notifs = await db.notification.findMany({
      where: { userId: null },
      orderBy: { createdAt: 'desc' },
      take: 50
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
    const pinHash = await bcrypt.hash('123456', 10);
    const targetRole = (role as Role) || 'CUSTOMER';

    const result = await db.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          fullName,
          email,
          phone,
          role: targetRole,
          passwordHash,
          pinHash: targetRole === 'CUSTOMER' ? pinHash : null,
          status: 'ACTIVE',
          isVerified: true
        }
      });

      if (targetRole === 'CUSTOMER') {
        const randomPart = Math.floor(10000000 + Math.random() * 90000000).toString();
        const accountNumber = `1234${randomPart}`;

        const mainPocket = await tx.pocket.create({
          data: {
            userId: newUser.id,
            name: 'Kantong Utama',
            type: 'MAIN',
            balance: 0,
            accountNumber,
            isPrimary: true
          }
        });

        const rand4 = Math.floor(1000 + Math.random() * 9000).toString();
        const maskedNumber = `•••• ${rand4}`;
        const now = new Date();

        await tx.card.create({
          data: {
            userId: newUser.id,
            pocketId: mainPocket.id,
            cardType: 'DIGITAL',
            cardName: 'Kartu Digital J-NAL',
            maskedNumber,
            expiryMonth: now.getMonth() + 1,
            expiryYear: now.getFullYear() + 5,
            dailyLimit: 10000000,
            status: 'ACTIVE'
          }
        });

        await tx.notification.create({
          data: {
            userId: newUser.id,
            type: NotificationType.SYSTEM,
            title: 'Selamat Datang di Bank J-NAL!',
            message: `Akun Anda telah berhasil dibuat oleh Admin Bank. Nomor rekening utama Anda: ${accountNumber}. PIN default transaksi Anda: 123456.`,
            isRead: false
          }
        });
      }

      return newUser;
    });

    res.json(formatSuccess({ 
      id: result.id, 
      fullName: result.fullName, 
      email: result.email, 
      role: result.role,
      message: targetRole === 'CUSTOMER' 
        ? 'Nasabah berhasil dibuat lengkap dengan Rekening & Kartu Digital' 
        : 'Administrator berhasil dibuat'
    }));
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
      where: { id: id as string },
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
      where: { id: id as string },
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
    const user = await db.user.findUnique({ where: { id: id as string } });
    if (user?.role === 'SUPER_ADMIN') {
      return next(new AppError(403, 'FORBIDDEN', 'Tidak dapat menghapus Super Admin'));
    }

    await db.user.delete({
      where: { id: id as string }
    });

    res.json(formatSuccess(null, { message: 'Pengguna berhasil dihapus' }));
  } catch (error) {
    next(error);
  }
};

export const adminTopUpUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { amount, pocketId, notes } = req.body;

    const topUpAmount = Number(amount);
    if (isNaN(topUpAmount) || topUpAmount <= 0) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Nominal top up harus lebih dari 0'));
    }

    const user = await db.user.findUnique({
      where: { id: id as string },
      include: { pockets: true }
    });

    if (!user) {
      return next(new AppError(404, 'NOT_FOUND', 'Pengguna tidak ditemukan'));
    }

    const targetPocket = pocketId
      ? user.pockets.find(p => p.id === pocketId) || user.pockets[0]
      : user.pockets.find(p => p.isPrimary) || user.pockets[0];

    if (!targetPocket) {
      return next(new AppError(404, 'NOT_FOUND', 'Kantong pengguna tidak ditemukan'));
    }

    const updatedPocket = await db.$transaction(async (tx) => {
      const pocket = await tx.pocket.update({
        where: { id: targetPocket.id },
        data: {
          balance: { increment: topUpAmount }
        }
      });

      const reference = `ADM-TOPUP-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
      await tx.transaction.create({
        data: {
          userId: user.id,
          sourcePocketId: targetPocket.id,
          type: 'TOP_UP',
          amount: topUpAmount,
          adminFee: 0,
          status: 'SUCCESS',
          reference,
          description: notes || 'Top Up Saldo oleh Admin Bank J-NAL',
          recipientName: user.fullName,
          recipientBank: 'BANK J-NAL',
          recipientAccount: targetPocket.accountNumber,
        }
      });

      await tx.notification.create({
        data: {
          userId: user.id,
          type: NotificationType.TRANSACTION,
          title: 'Saldo Masuk (Admin Top Up)',
          message: `Saldo sebesar Rp ${topUpAmount.toLocaleString('id-ID')} telah berhasil ditambahkan ke ${targetPocket.name} Anda oleh Admin Bank.`,
          isRead: false,
        }
      });

      return pocket;
    });

    // Real-time socket emit
    io.to(`user_${user.id}`).emit('balance_updated', {
      pocketId: targetPocket.id,
      newBalance: Number(updatedPocket.balance),
    });
    io.to(`user_${user.id}`).emit('notification', {
      title: 'Saldo Masuk (Admin Top Up)',
      message: `Saldo sebesar Rp ${topUpAmount.toLocaleString('id-ID')} telah ditambahkan ke rekening Anda.`,
    });

    res.json(formatSuccess({
      message: `Berhasil menambahkan saldo Rp ${topUpAmount.toLocaleString('id-ID')} ke ${user.fullName}`,
      user: {
        id: user.id,
        fullName: user.fullName,
        accountNumber: targetPocket.accountNumber,
        newBalance: Number(updatedPocket.balance),
      }
    }));
  } catch (error) {
    next(error);
  }
};
