import { UserStatus, Role, PocketType, MerchantStatus, MerchantRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import { db as prisma } from '../src/config/db';

export async function seedMerchant() {
  console.log('Seeding Merchant demo data...');

  const password = await bcrypt.hash('password-demo', 10);
  const pin = await bcrypt.hash('123456', 10);

  // 1. Create / Update Merchant Owner (Budi Santoso)
  const ownerUser = await prisma.user.upsert({
    where: { phone: '081298765432' },
    update: {},
    create: {
      fullName: 'Budi Santoso (Owner Kopi J-NAL)',
      email: 'budi.merchant@jnal.bank',
      phone: '081298765432',
      passwordHash: password,
      pinHash: pin,
      status: UserStatus.ACTIVE,
      role: Role.CUSTOMER,
      isVerified: true,
    },
  });

  // 2. Create Settlement Pocket for Merchant Owner
  const merchantPocket = await prisma.pocket.upsert({
    where: { accountNumber: '998877665544' },
    update: {},
    create: {
      userId: ownerUser.id,
      name: 'Kantong Usaha Kopi',
      accountNumber: '998877665544',
      type: PocketType.MAIN,
      balance: 15250000.00,
      isPrimary: true,
    },
  });

  // 3. Create Merchant Profile
  const merchant = await prisma.merchant.upsert({
    where: { id: 'mrc-kopi-jnal-01' },
    update: {
      status: MerchantStatus.ACTIVE,
      pocketId: merchantPocket.id,
    },
    create: {
      id: 'mrc-kopi-jnal-01',
      userId: ownerUser.id,
      pocketId: merchantPocket.id,
      name: 'Kopi J-NAL Nusantara',
      brandName: 'Kopi J-NAL',
      category: 'Kuliner & F&B',
      description: 'Spesialis kopi susu kekinian dan pastry segar',
      city: 'Jakarta Selatan',
      address: 'Jl. Tebet Raya No. 45',
      phone: '081298765432',
      email: 'kopijnal@gmail.com',
      status: MerchantStatus.ACTIVE,
    },
  });

  // 4. Create Main Outlet
  const outlet = await prisma.merchantOutlet.upsert({
    where: { qrisCode: 'QRIS-JNAL-KOPI-01' },
    update: {},
    create: {
      merchantId: merchant.id,
      name: 'Kopi J-NAL - Outlet Tebet',
      address: 'Jl. Tebet Raya No. 45, Jakarta Selatan',
      city: 'Jakarta Selatan',
      qrisCode: 'QRIS-JNAL-KOPI-01',
      isActive: true,
    },
  });

  // Register static QR into global QRIS table for compatibility
  await prisma.qrisMerchant.upsert({
    where: { merchantId: 'QRIS-JNAL-KOPI-01' },
    update: {},
    create: {
      merchantId: 'QRIS-JNAL-KOPI-01',
      merchantName: 'Kopi J-NAL - Outlet Tebet',
      city: 'Jakarta Selatan',
      isActive: true,
    },
  });

  // 5. Create Cashier Staff Profile
  await prisma.merchantStaff.upsert({
    where: { id: 'staff-cashier-01' },
    update: {},
    create: {
      id: 'staff-cashier-01',
      merchantId: merchant.id,
      outletId: outlet.id,
      fullName: 'Siti Kasir',
      phone: '081211112222',
      pinHash: pin,
      role: MerchantRole.CASHIER,
      isActive: true,
    },
  });

  // 6. Create Sample Products
  const productsData = [
    { name: 'Kopi Susu Gula Aren', category: 'Minuman', price: 18000, isAvailable: true },
    { name: 'Espresso Single Origin', category: 'Minuman', price: 22000, isAvailable: true },
    { name: 'Matcha Cream Latte', category: 'Minuman', price: 24000, isAvailable: true },
    { name: 'Butter Croissant', category: 'Pastry', price: 25000, isAvailable: true },
    { name: 'Pain Au Chocolat', category: 'Pastry', price: 28000, isAvailable: true },
    { name: 'Paket Ngopi Hemat (Kopi + Croissant)', category: 'Paket Hemat', price: 38000, isAvailable: true },
  ];

  for (const p of productsData) {
    const existing = await prisma.merchantProduct.findFirst({
      where: { merchantId: merchant.id, name: p.name }
    });
    if (!existing) {
      await prisma.merchantProduct.create({
        data: {
          merchantId: merchant.id,
          name: p.name,
          category: p.category,
          price: p.price,
          isAvailable: p.isAvailable,
        },
      });
    }
  }

  // 7. Create Sample Completed Transaction / Orders for initial reports
  const sampleOrder = await prisma.merchantOrder.upsert({
    where: { orderNumber: 'POS-DEMO-001' },
    update: {},
    create: {
      orderNumber: 'POS-DEMO-001',
      merchantId: merchant.id,
      outletId: outlet.id,
      totalAmount: 38000,
      finalAmount: 38000,
      status: 'SUCCESS',
      paymentMethod: 'QRIS_DYNAMIC',
      transactionRef: 'QRS-DEMO-REF-01',
      customerName: 'Zainal Salamun',
      paidAt: new Date(),
    },
  });

  console.log('Merchant demo seed completed successfully!');
  console.log('--------------------------------------------------');
  console.log('Login Merchant: Phone = 081298765432, PIN = 123456');
  console.log('Login Kasir   : Phone = 081211112222, PIN = 123456');
  console.log('Login Nasabah : Phone = 081234567890, PIN = 123456');
  console.log('--------------------------------------------------');
}

if (process.argv[1]?.includes('seed_merchant')) {
  seedMerchant()
    .catch((e) => {
      console.error('Seed error:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
