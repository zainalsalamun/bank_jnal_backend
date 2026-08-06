import { Request, Response, NextFunction } from 'express';
import { db } from '../config/db';
import { formatSuccess } from '../utils/response';
import { AuthRequest } from '../middleware/authMiddleware';

export const getShortcuts = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const shortcuts = await db.userShortcut.findMany({
      where: { userId: req.user!.id },
      orderBy: { position: 'asc' }
    });
    res.json(formatSuccess(shortcuts));
  } catch (error) {
    next(error);
  }
};

export const updateShortcuts = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { shortcuts } = req.body;
    
    await db.userShortcut.deleteMany({ where: { userId: req.user!.id } });
    
    const newShortcuts = shortcuts.map((s: any, idx: number) => ({
      userId: req.user!.id,
      code: s.code,
      position: idx + 1
    }));

    await db.userShortcut.createMany({ data: newShortcuts });

    res.json(formatSuccess({ message: 'Shortcuts updated' }));
  } catch (error) {
    next(error);
  }
};
