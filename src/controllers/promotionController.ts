import { Request, Response, NextFunction } from 'express';
import { db } from '../config/db';
import { formatSuccess } from '../utils/response';

export const getPromotions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;

    const promos = await db.promotion.findMany({
      where: { status: 'ACTIVE' },
      take: limit,
      orderBy: { startAt: 'desc' }
    });
    
    res.json(formatSuccess(promos));
  } catch (error) {
    next(error);
  }
};
