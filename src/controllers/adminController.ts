import { Request, Response, NextFunction } from 'express';
import { db } from '../config/db';
import { formatSuccess } from '../utils/response';

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
