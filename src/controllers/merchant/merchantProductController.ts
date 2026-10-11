import { Request, Response, NextFunction } from 'express';
import { db } from '../../config/db';
import { formatSuccess, formatError } from '../../utils/response';
import { AppError } from '../../middleware/errorHandler';
import { AuthRequest } from '../../middleware/authMiddleware';
import { Prisma } from '@prisma/client';

export const getProducts = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const { category, search } = req.query;

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

    const products = await db.merchantProduct.findMany({
      where: {
        merchantId: merchant.id,
        ...(category && category !== 'All' ? { category: category as string } : {}),
        ...(search ? { name: { contains: search as string, mode: 'insensitive' } } : {})
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(formatSuccess(products));
  } catch (error) {
    next(error);
  }
};

export const createProduct = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const { name, category = 'General', price, description, imageUrl, sku, isAvailable = true } = req.body;

    if (!name || !price) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Nama produk dan harga wajib diisi'));
    }

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

    const product = await db.merchantProduct.create({
      data: {
        merchantId: merchant.id,
        name,
        category,
        price: new Prisma.Decimal(price),
        description,
        imageUrl,
        sku,
        isAvailable
      }
    });

    res.status(201).json(formatSuccess(product));
  } catch (error) {
    next(error);
  }
};

export const updateProduct = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { name, category, price, description, imageUrl, sku, isAvailable } = req.body;

    const product = await db.merchantProduct.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(category && { category }),
        ...(price && { price: new Prisma.Decimal(price) }),
        ...(description !== undefined && { description }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(sku !== undefined && { sku }),
        ...(isAvailable !== undefined && { isAvailable })
      }
    });

    res.json(formatSuccess(product));
  } catch (error) {
    next(error);
  }
};

export const deleteProduct = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    await db.merchantProduct.delete({
      where: { id }
    });

    res.json(formatSuccess(null, { message: 'Produk berhasil dihapus' }));
  } catch (error) {
    next(error);
  }
};
