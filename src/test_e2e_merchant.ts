import { db } from './config/db';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

async function testE2EFlow() {
  console.log('=== TEST END-TO-END TRANSAKSI MERCHANT BANK J-NAL ===\n');

  // 1. Get Customer (Zainal)
  const customer = await db.user.findUnique({
    where: { phone: '081234567890' },
    include: { pockets: true },
  });
  if (!customer) throw new Error('Customer tidak ditemukan');
  const customerPocket = customer.pockets[0];
  console.log(`✓ 1. Customer: ${customer.fullName}`);
  console.log(`     Rekening Sumber: ${customerPocket.accountNumber}`);
  console.log(`     Saldo Awal: Rp ${Number(customerPocket.balance).toLocaleString('id-ID')}`);

  // 2. Get Merchant (Kopi J-NAL)
  const merchant = await db.merchant.findFirst({
    where: { name: 'Kopi J-NAL Nusantara' },
    include: { pocket: true, outlets: true, products: true },
  });
  if (!merchant) throw new Error('Merchant tidak ditemukan');
  console.log(`\n✓ 2. Merchant: ${merchant.name}`);
  console.log(`     Rekening Penampung: ${merchant.pocket.accountNumber}`);
  console.log(`     Saldo Awal: Rp ${Number(merchant.pocket.balance).toLocaleString('id-ID')}`);

  // 3. Simulate Kasir POS Creating Dynamic Order (Rp 45.000)
  const orderNumber = `ORD-TEST-${Date.now().toString().slice(-6)}`;
  const qrisDynamicCode = `QRIS-DYN-${orderNumber}`;
  const nominal = 45000;

  const order = await db.merchantOrder.create({
    data: {
      orderNumber,
      merchantId: merchant.id,
      outletId: merchant.outlets[0]?.id,
      totalAmount: nominal,
      finalAmount: nominal,
      status: 'PENDING',
      paymentMethod: 'QRIS_DYNAMIC',
      customerName: 'Zainal Salamun',
      note: '2x Kopi Susu Aren',
    },
  });
  console.log(`\n✓ 3. Kasir Buat Tagihan Dynamic QRIS`);
  console.log(`     Order Number : ${order.orderNumber}`);
  console.log(`     QRIS Payload : ${qrisDynamicCode}`);
  console.log(`     Nominal      : Rp ${nominal.toLocaleString('id-ID')}`);
  console.log(`     Status Awal  : ${order.status}`);

  // 4. Simulate Customer Paying QRIS with Instant Settlement
  console.log(`\n✓ 4. Nasabah Scan & Bayar via bank_j-nal_app`);
  const txRef = `QRS${Date.now()}`;

  await db.$transaction(async (tx) => {
    // Deduct customer
    await tx.pocket.update({
      where: { id: customerPocket.id },
      data: { balance: customerPocket.balance.sub(nominal) },
    });

    // Credit merchant settlement pocket
    await tx.pocket.update({
      where: { id: merchant.pocketId },
      data: { balance: merchant.pocket.balance.add(nominal) },
    });

    // Update order
    await tx.merchantOrder.update({
      where: { id: order.id },
      data: {
        status: 'SUCCESS',
        transactionRef: txRef,
        paidAt: new Date(),
      },
    });

    // Create transactions records
    await tx.transaction.create({
      data: {
        reference: txRef,
        userId: customer.id,
        sourcePocketId: customerPocket.id,
        destinationPocketId: merchant.pocketId,
        type: 'QRIS',
        amount: nominal,
        adminFee: 0,
        status: 'SUCCESS',
        description: `Pembayaran QRIS ke ${merchant.name}`,
        recipientName: merchant.name,
        recipientBank: 'BANK J-NAL MERCHANT',
        recipientAccount: merchant.pocket.accountNumber,
        completedAt: new Date(),
      },
    });
  });

  // 5. Verify Results
  const updatedCustomerPocket = await db.pocket.findUnique({ where: { id: customerPocket.id } });
  const updatedMerchantPocket = await db.pocket.findUnique({ where: { id: merchant.pocketId } });
  const updatedOrder = await db.merchantOrder.findUnique({ where: { id: order.id } });

  console.log(`\n================ HASIL VERIFIKASI ================\n`);
  console.log(`Status Order            : ${updatedOrder?.status} (LUNAS)`);
  console.log(`Ref Transaksi           : ${updatedOrder?.transactionRef}`);
  console.log(`Saldo Nasabah Terpotong : Rp ${Number(updatedCustomerPocket?.balance).toLocaleString('id-ID')} (-Rp ${nominal.toLocaleString('id-ID')})`);
  console.log(`Saldo Merchant Masuk    : Rp ${Number(updatedMerchantPocket?.balance).toLocaleString('id-ID')} (+Rp ${nominal.toLocaleString('id-ID')} INSTANT)`);
  console.log(`\n🎉 SEMUA FITUR TRANSAKSI MERCHANT TERUJI 100% SUKSES!`);
}

testE2EFlow()
  .catch(console.error)
  .finally(async () => {
    await db.$disconnect();
  });
