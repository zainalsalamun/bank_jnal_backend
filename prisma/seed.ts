import { UserStatus, Role, PocketType, CardType, CardStatus, PromoStatus, NotificationType } from '@prisma/client';
import bcrypt from 'bcrypt';
import { db as prisma } from '../src/config/db';
import { seedMerchant } from './seed_merchant';

async function main() {
  console.log('Starting seed...');

  // 1. Create Admin
  const adminPassword = await bcrypt.hash('admin-demo', 10);
  await prisma.user.upsert({
    where: { email: 'admin@jnal.bank' },
    update: {},
    create: {
      fullName: 'Super Admin',
      email: 'admin@jnal.bank',
      phone: '000000000000',
      passwordHash: adminPassword,
      status: UserStatus.ACTIVE,
      role: Role.SUPER_ADMIN,
      isVerified: true,
    },
  });

  // 2. Create Customer (Zainal Salamun)
  const userPassword = await bcrypt.hash('password-demo', 10);
  const userPin = await bcrypt.hash('123456', 10);
  
  const customer = await prisma.user.upsert({
    where: { phone: '081234567890' },
    update: {},
    create: {
      fullName: 'Zainal Salamun',
      email: 'zainal@example.com',
      phone: '081234567890',
      passwordHash: userPassword,
      pinHash: userPin,
      status: UserStatus.ACTIVE,
      role: Role.CUSTOMER,
      isVerified: true,
    },
  });

  // 3. Create Main Pocket
  const mainPocket = await prisma.pocket.upsert({
    where: { accountNumber: '123456789010' },
    update: {},
    create: {
      userId: customer.id,
      name: 'Kantong Utama',
      accountNumber: '123456789010',
      type: PocketType.MAIN,
      balance: 25500000.00,
      isPrimary: true,
    },
  });

  // 4. Create Card
  await prisma.card.create({
    data: {
      userId: customer.id,
      pocketId: mainPocket.id,
      cardType: CardType.DIGITAL,
      cardName: 'Kartu Digital J-NAL',
      maskedNumber: '•••• 9010',
      expiryMonth: 8,
      expiryYear: 2031,
      dailyLimit: 10000000.00,
      status: CardStatus.ACTIVE,
    }
  });

  // 5. Create Qris Merchant
  await prisma.qrisMerchant.upsert({
    where: { merchantId: 'mrc_01' },
    update: {},
    create: {
      merchantId: 'mrc_01',
      merchantName: 'Coffee Shop',
      city: 'Jakarta',
    }
  });

  // 6. Create Shortcuts
  await prisma.userShortcut.createMany({
    data: [
      { userId: customer.id, code: 'MAIN_POCKET', position: 1 },
      { userId: customer.id, code: 'INVESTMENT', position: 2 },
    ]
  });

  // 7. Create Promo
  await prisma.promotion.create({
    data: {
      title: 'Bonus transaksi pertamamu',
      description: 'Nikmati cashback hingga Rp 50.000.',
      status: PromoStatus.ACTIVE,
      startAt: new Date(),
      endAt: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
    }
  });

  // 8. Seed Merchant & POS Data
  await seedMerchant();

  console.log('Seed completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
