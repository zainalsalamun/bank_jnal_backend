import { Response, NextFunction } from 'express';
import { db } from '../config/db';
import { formatSuccess, formatError } from '../utils/response';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/authMiddleware';
import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { io } from '../server';

function generateReference(type: string) {
  const prefix = type === 'TRANSFER_IN' || type === 'TRANSFER_OUT'
      ? 'TRF'
      : type === 'QRIS'
          ? 'QRS'
          : type === 'TOP_UP'
              ? 'TOP'
              : 'TRX';
  const date = new Date().toISOString().replace(/[-:T]/g, '').slice(2, 10); // YYMMDDHH
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}${date}${rand}`;
}

export const getSavedAccounts = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const savedAccounts = await db.savedAccount.findMany({
      where: { userId: req.user!.id },
      orderBy: { lastTransferAt: 'desc' },
      take: 50
    });

    const formatted = savedAccounts.map(account => ({
      id: account.id,
      bankCode: account.bankCode,
      bankName: account.bankCode === 'JNAL' ? 'BANK J-NAL' : account.bankCode,
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      lastTransferAt: account.lastTransferAt,
      createdAt: account.createdAt
    }));

    res.json(formatSuccess(formatted));
  } catch (error) {
    next(error);
  }
};

export const saveAccount = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { accountNumber, bankCode = 'JNAL', accountName } = req.body;
    if (!accountNumber) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Nomor rekening wajib diisi'));
    }

    let finalAccountName = accountName;
    if (!finalAccountName) {
      const targetPocket = await db.pocket.findUnique({
        where: { accountNumber: accountNumber.trim() },
        include: { user: true }
      });
      if (!targetPocket) {
        return next(new AppError(404, 'ACCOUNT_NOT_FOUND', 'Nomor rekening tidak ditemukan'));
      }
      finalAccountName = targetPocket.user.fullName;
    }

    const saved = await db.savedAccount.upsert({
      where: {
        userId_bankCode_accountNumber: {
          userId: req.user!.id,
          bankCode: bankCode || 'JNAL',
          accountNumber: accountNumber.trim()
        }
      },
      update: {
        accountName: finalAccountName,
        lastTransferAt: new Date()
      },
      create: {
        userId: req.user!.id,
        bankCode: bankCode || 'JNAL',
        accountNumber: accountNumber.trim(),
        accountName: finalAccountName,
        lastTransferAt: new Date()
      }
    });

    res.status(201).json(formatSuccess(saved));
  } catch (error) {
    next(error);
  }
};

export const deleteSavedAccount = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    await db.savedAccount.deleteMany({
      where: {
        id,
        userId: req.user!.id
      }
    });

    res.json(formatSuccess({ message: 'Kontak berhasil dihapus dari daftar tersimpan' }));
  } catch (error) {
    next(error);
  }
};

export const getTransactions = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const type = req.query.type as string;
    const status = req.query.status as any;
    const search = req.query.search as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const direction = req.query.direction as string; // IN (income/transfer_in/top_up) or OUT (expense/transfer_out/qris/etc)
    
    const where: any = { userId: req.user!.id };
    if (type && type !== 'ALL') where.type = type;
    if (status && status !== 'ALL') where.status = status;
    if (direction === 'IN') {
      where.type = { in: ['TRANSFER_IN', 'TOP_UP'] };
    } else if (direction === 'OUT') {
      where.type = { in: ['TRANSFER_OUT', 'QRIS', 'BILL_PAYMENT'] };
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { description: { contains: q, mode: 'insensitive' } },
        { recipientName: { contains: q, mode: 'insensitive' } },
        { recipientAccount: { contains: q, mode: 'insensitive' } },
        { reference: { contains: q, mode: 'insensitive' } },
      ];
    }

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

    const formattedAccountNumber = accountNumber.startsWith('JNAL-') ? accountNumber : `JNAL-${accountNumber}`;

    const pocket = await db.pocket.findUnique({
      where: { accountNumber: formattedAccountNumber },
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
      const formattedDestination = destinationBankCode === 'JNAL' && !destinationAccountNumber.startsWith('JNAL-') 
          ? `JNAL-${destinationAccountNumber}` 
          : destinationAccountNumber;
      const destPocket = await tx.pocket.findUnique({ where: { accountNumber: formattedDestination }, include: { user: true } });
      
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
      
      // Buat notifikasi di DB untuk penerima
      await tx.notification.create({
        data: {
          userId: destPocket.userId,
          title: 'Transfer Masuk',
          message: `Kamu menerima transfer sebesar Rp ${transferAmount} dari ${user.fullName}`,
          type: 'TRANSACTION'
        }
      });

      // Simpan/Update akun ke daftar tersimpan
      await tx.savedAccount.upsert({
        where: {
          userId_bankCode_accountNumber: {
            userId: user.id,
            bankCode: destinationBankCode,
            accountNumber: formattedDestination
          }
        },
        update: {
          accountName: destPocket.user.fullName,
          lastTransferAt: new Date()
        },
        create: {
          userId: user.id,
          bankCode: destinationBankCode,
          accountNumber: formattedDestination,
          accountName: destPocket.user.fullName,
          lastTransferAt: new Date()
        }
      });

      return { senderTx, receiverId: destPocket.userId, destPocketId: destPocket.id };
    });

    // Check if destPocket is linked to a Merchant
    const merchant = await db.merchant.findFirst({
      where: { pocketId: result.destPocketId }
    });

    if (merchant) {
      io.to(`merchant_${merchant.id}`).emit('payment_received', {
        merchantId: merchant.id,
        orderNumber: `TRF-${Date.now().toString().slice(-6)}`,
        amount: Number(amount),
        customerName: user.fullName,
        paymentMethod: 'BANK_TRANSFER',
        status: 'SUCCESS',
        timestamp: new Date().toISOString(),
      });
      io.to(`merchant_${merchant.id}`).emit('merchant_payment_received', {
        merchantId: merchant.id,
        amount: Number(amount),
        customerName: user.fullName,
        paymentMethod: 'BANK_TRANSFER',
        status: 'SUCCESS',
      });
    }

    // Emit Socket.IO event to receiver
    io.to(`user_${result.receiverId}`).emit('notification', {
      title: 'Transfer Masuk',
      message: `Kamu menerima transfer sebesar Rp ${amount} dari pengguna`
    });

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
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(formatError(error.code, error.message));
    }
    next(error);
  }
};

export const topUpPocket = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { pocketId, amount, method, description } = req.body;

    const numAmount = Number(amount);
    if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
      return next(new AppError(400, 'INVALID_AMOUNT', 'Nominal top up harus lebih dari 0'));
    }

    if (numAmount > 100000000) {
      return next(new AppError(400, 'AMOUNT_EXCEEDED', 'Maksimal top up per transaksi adalah Rp 100.000.000'));
    }

    const user = await db.user.findUnique({
      where: { id: req.user!.id }
    });
    if (!user) return next(new AppError(404, 'NOT_FOUND', 'User tidak ditemukan'));

    // Find destination pocket (if not provided, find user's primary pocket)
    let destPocket;
    if (pocketId) {
      destPocket = await db.pocket.findFirst({
        where: { id: pocketId, userId: user.id }
      });
    } else {
      destPocket = await db.pocket.findFirst({
        where: { userId: user.id, isPrimary: true }
      }) || await db.pocket.findFirst({
        where: { userId: user.id }
      });
    }

    if (!destPocket) {
      return next(new AppError(404, 'NOT_FOUND', 'Kantong tujuan tidak ditemukan'));
    }

    const methodLabels: Record<string, string> = {
      'INSTANT': 'Instant Top-Up',
      'VA_BCA': 'Virtual Account BCA',
      'VA_MANDIRI': 'Virtual Account Mandiri',
      'VA_BRI': 'Virtual Account BRI',
      'VA_BNI': 'Virtual Account BNI',
      'INDOMARET': 'Indomaret Retail',
      'ALFAMART': 'Alfamart Retail'
    };

    const methodLabel = methodLabels[method] || 'Setor Saldo / Top Up';
    const reference = generateReference('TOP_UP');

    const result = await db.$transaction(async (tx) => {
      // 1. Increment pocket balance
      const updatedPocket = await tx.pocket.update({
        where: { id: destPocket.id },
        data: {
          balance: { increment: new Prisma.Decimal(numAmount) }
        }
      });

      // 2. Create Top Up transaction record
      const topUpTx = await tx.transaction.create({
        data: {
          reference,
          userId: user.id,
          destinationPocketId: destPocket.id,
          type: 'TOP_UP',
          amount: new Prisma.Decimal(numAmount),
          adminFee: new Prisma.Decimal(0),
          status: 'SUCCESS',
          recipientName: user.fullName,
          recipientBank: methodLabel,
          recipientAccount: destPocket.accountNumber,
          description: description || `Top Up Saldo via ${methodLabel}`,
          completedAt: new Date()
        }
      });

      // 3. Create Notification
      await tx.notification.create({
        data: {
          userId: user.id,
          title: 'Top Up Berhasil',
          message: `Saldo sebesar Rp ${numAmount.toLocaleString('id-ID')} berhasil ditambahkan ke ${destPocket.name}`,
          type: 'TRANSACTION'
        }
      });

      return { topUpTx, updatedPocket };
    });

    // Emit Socket.IO event to update balance in real-time
    io.to(`user_${user.id}`).emit('notification', {
      title: 'Top Up Berhasil',
      message: `Top up sebesar Rp ${numAmount.toLocaleString('id-ID')} berhasil ditambahkan ke kantongmu!`
    });
    io.to(`user_${user.id}`).emit('balance_updated', {
      pocketId: destPocket.id,
      newBalance: result.updatedPocket.balance
    });

    res.status(201).json(formatSuccess({
      transactionId: result.topUpTx.id,
      reference: result.topUpTx.reference,
      recipientName: user.fullName,
      recipientBank: methodLabel,
      recipientAccount: destPocket.accountNumber,
      pocketName: destPocket.name,
      amount: result.topUpTx.amount,
      adminFee: 0,
      total: result.topUpTx.amount,
      status: result.topUpTx.status,
      type: 'TOP_UP',
      createdAt: result.topUpTx.createdAt
    }));
  } catch (error: any) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(formatError(error.code, error.message));
    }
    next(error);
  }
};

export const getTransactionAnalytics = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const month = parseInt(req.query.month as string) || (now.getMonth() + 1); // 1-12
    const year = parseInt(req.query.year as string) || now.getFullYear();

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const user = await db.user.findUnique({
      where: { id: req.user!.id }
    });
    if (!user) return next(new AppError(404, 'NOT_FOUND', 'User tidak ditemukan'));

    // Fetch all successful transactions in this month with pocket relations
    const transactions = await db.transaction.findMany({
      where: {
        userId: user.id,
        status: 'SUCCESS',
        createdAt: {
          gte: startDate,
          lte: endDate,
        }
      },
      include: {
        sourcePocket: true,
        destPocket: true,
      },
      orderBy: { createdAt: 'desc' }
    });

    let totalIncome = 0;
    let totalExpense = 0;

    // Categories breakdown for expenses
    const categoryTotals: Record<string, { amount: number; count: number; name: string }> = {
      'MAIN': { amount: 0, count: 0, name: 'Bayar / Belanja' },
      'SAVING': { amount: 0, count: 0, name: 'Nabung' },
      'INVESTMENT': { amount: 0, count: 0, name: 'Investasi' },
      'CHARITY': { amount: 0, count: 0, name: 'Donasi' },
    };

    // 4 Weeks breakdown
    const weeklyData = [
      { week: 'M1', label: 'Tgl 1-7', income: 0, expense: 0 },
      { week: 'M2', label: 'Tgl 8-14', income: 0, expense: 0 },
      { week: 'M3', label: 'Tgl 15-21', income: 0, expense: 0 },
      { week: 'M4', label: 'Tgl 22-31', income: 0, expense: 0 },
    ];

    const expenseTransactions: any[] = [];

    for (const tx of transactions) {
      const amount = Number(tx.amount);
      const day = new Date(tx.createdAt).getDate();
      let weekIdx = 0;
      if (day > 21) weekIdx = 3;
      else if (day > 14) weekIdx = 2;
      else if (day > 7) weekIdx = 1;

      if (tx.type === 'TRANSFER_IN' || tx.type === 'TOP_UP') {
        totalIncome += amount;
        weeklyData[weekIdx].income += amount;
      } else {
        totalExpense += amount;
        weeklyData[weekIdx].expense += amount;
        expenseTransactions.push(tx);

        const cat = tx.sourcePocket?.type || 'MAIN';
        if (categoryTotals[cat]) {
          categoryTotals[cat].amount += amount;
          categoryTotals[cat].count += 1;
        } else {
          categoryTotals['MAIN'].amount += amount;
          categoryTotals['MAIN'].count += 1;
        }
      }
    }

    const netCashflow = totalIncome - totalExpense;
    const savingsRate = totalIncome > 0 ? Math.max(0, Math.round(((totalIncome - totalExpense) / totalIncome) * 100)) : 0;

    // Format category distribution
    const categories = Object.entries(categoryTotals).map(([key, data]) => ({
      category: key,
      name: data.name,
      amount: data.amount,
      count: data.count,
      percentage: totalExpense > 0 ? Math.round((data.amount / totalExpense) * 100) : 0,
    }));

    // Top 5 largest expenses
    const topExpenses = expenseTransactions
      .sort((a, b) => Number(b.amount) - Number(a.amount))
      .slice(0, 5)
      .map(tx => ({
        id: tx.id,
        reference: tx.reference,
        title: tx.recipientName || tx.description || 'Pengeluaran',
        amount: Number(tx.amount),
        type: tx.type,
        pocketName: tx.sourcePocket?.name || 'Kantong Utama',
        createdAt: tx.createdAt,
      }));

    res.json(formatSuccess({
      period: {
        month,
        year,
        startDate,
        endDate,
      },
      summary: {
        totalIncome,
        totalExpense,
        netCashflow,
        savingsRate,
        transactionCount: transactions.length,
      },
      categories,
      weeklyTrend: weeklyData,
      topExpenses,
    }));
  } catch (error) {
    next(error);
  }
};

export const getAccountStatement = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const month = parseInt(req.query.month as string) || (new Date().getMonth() + 1);
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const pocketId = req.query.pocketId as string;

    const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const user = await db.user.findUnique({
      where: { id: req.user!.id },
      include: {
        pockets: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!user) return next(new AppError(404, 'NOT_FOUND', 'User tidak ditemukan'));

    const selectedPocket = pocketId
      ? user.pockets.find(p => p.id === pocketId) || user.pockets[0]
      : user.pockets[0];

    const pocketAccountNumber = selectedPocket ? selectedPocket.accountNumber : 'JNAL-000000000000';
    const currentBalance = selectedPocket ? Number(selectedPocket.balance) : 0;

    const transactions = await db.transaction.findMany({
      where: {
        userId: user.id,
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    const futureTransactions = await db.transaction.findMany({
      where: {
        userId: user.id,
        createdAt: {
          gt: endDate
        }
      }
    });

    let totalDebit = 0;
    let totalCredit = 0;

    const formattedTransactions = transactions.map(t => {
      const isCredit = t.type === 'TRANSFER_IN' || t.type === 'TOP_UP';
      const amount = Number(t.amount);
      if (isCredit) {
        totalCredit += amount;
      } else {
        totalDebit += amount;
      }

      return {
        id: t.id,
        reference: t.reference,
        type: t.type,
        direction: isCredit ? 'CREDIT' : 'DEBIT',
        amount,
        adminFee: Number(t.adminFee || 0),
        description: t.description || (isCredit ? 'Pemasukan' : 'Pengeluaran'),
        recipientName: t.recipientName || '-',
        recipientBank: t.recipientBank || 'BANK J-NAL',
        recipientAccount: t.recipientAccount || '-',
        status: t.status,
        date: t.createdAt.toISOString(),
      };
    });

    let futureNet = 0;
    futureTransactions.forEach(ft => {
      const isCredit = ft.type === 'TRANSFER_IN' || ft.type === 'TOP_UP';
      if (isCredit) futureNet += Number(ft.amount);
      else futureNet -= Number(ft.amount);
    });

    const closingBalance = currentBalance - futureNet;
    const openingBalance = closingBalance - (totalCredit - totalDebit);

    const monthNames = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const periodLabel = `${monthNames[month - 1]} ${year}`;
    const statementNumber = `STMT-${year}${month.toString().padStart(2, '0')}-${user.id.substring(0, 6).toUpperCase()}`;

    res.json(formatSuccess({
      statementNumber,
      statementDate: new Date().toISOString(),
      period: {
        month,
        year,
        label: periodLabel,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      account: {
        fullName: user.fullName,
        phone: user.phone,
        email: user.email,
        accountNumber: pocketAccountNumber,
        pocketName: selectedPocket ? selectedPocket.name : 'Kantong Utama',
        currency: 'IDR',
        bankName: 'PT BANK J-NAL (Persero) Tbk',
        branch: 'KC Digital Sudirman Jakarta',
      },
      summary: {
        openingBalance: Math.max(0, openingBalance),
        totalCredit,
        totalDebit,
        closingBalance: Math.max(0, closingBalance),
        transactionCount: transactions.length,
      },
      transactions: formattedTransactions,
      verification: {
        digitalSignature: `JNAL-SIGN-SHA256-${Date.now().toString(36).toUpperCase()}`,
        status: 'OFFICIAL_VERIFIED',
        issuer: 'PT BANK J-NAL (Persero) Tbk',
        license: 'Berizin dan Diawasi oleh Otoritas Jasa Keuangan (OJK) serta Bank Indonesia (BI)'
      }
    }));
  } catch (error) {
    next(error);
  }
};
