import { Response, NextFunction } from 'express';
import { db } from '../config/db';
import { formatSuccess } from '../utils/response';
import { AuthRequest } from '../middleware/authMiddleware';

export const getDashboard = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    const [user, primaryPocket, promotions, shortcuts, unreadCount] = await Promise.all([
      db.user.findUnique({ where: { id: userId }, select: { fullName: true } }),
      db.pocket.findFirst({ where: { userId, isPrimary: true } }),
      db.promotion.findMany({ where: { status: 'ACTIVE' }, take: 3 }),
      db.userShortcut.findMany({ where: { userId }, orderBy: { position: 'asc' } }),
      db.notification.count({ where: { userId, isRead: false } }),
    ]);

    res.json(formatSuccess({
      greeting: "Assalamu'alaikum",
      userName: user?.fullName,
      primaryPocket: primaryPocket ? {
        id: primaryPocket.id,
        name: primaryPocket.name,
        accountNumber: primaryPocket.accountNumber,
        balance: primaryPocket.balance,
        currency: "IDR"
      } : null,
      promotions: promotions.map(p => ({
        id: p.id,
        title: p.title,
        description: p.description,
        imageUrl: p.imageUrl
      })),
      shortcuts: shortcuts.map(s => ({
        code: s.code,
        label: s.code, // In real app, map code to label
        position: s.position
      })),
      unreadNotificationCount: unreadCount
    }));
  } catch (error) {
    next(error);
  }
};
