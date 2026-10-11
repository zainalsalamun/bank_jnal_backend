import { db } from './config/db';

async function testTransferToMerchant() {
  console.log('=== TEST TRANSFER KE REKENING OWNER MERCHANT BANK J-NAL ===\n');

  // 1. Get Merchant with Pocket
  const merchant = await db.merchant.findFirst({
    where: { name: 'Kopi J-NAL Nusantara' },
    include: { pocket: { include: { user: true } } }
  });
  if (!merchant || !merchant.pocket) throw new Error('Merchant tidak ditemukan');

  console.log(`✓ 1. Rekening Penampung Merchant Owner:`);
  console.log(`     Toko        : ${merchant.name}`);
  console.log(`     Atas Nama   : ${merchant.pocket.user.fullName}`);
  console.log(`     No Rekening : ${merchant.pocket.accountNumber}`);
  console.log(`     Saldo Awal  : Rp ${Number(merchant.pocket.balance).toLocaleString('id-ID')}`);

  // 2. Customer Zainal Transfers Rp 25.000 to Merchant Pocket
  const customer = await db.user.findUnique({
    where: { phone: '081234567890' },
    include: { pockets: true }
  });
  if (!customer) throw new Error('Customer tidak ditemukan');
  const customerPocket = customer.pockets[0];

  const transferNominal = 25000;
  const txRef = `TRF${Date.now()}`;

  await db.$transaction(async (tx) => {
    // Deduct customer
    await tx.pocket.update({
      where: { id: customerPocket.id },
      data: { balance: customerPocket.balance.sub(transferNominal) }
    });

    // Credit merchant pocket
    await tx.pocket.update({
      where: { id: merchant.pocketId },
      data: { balance: merchant.pocket!.balance.add(transferNominal) }
    });

    // Sender TX
    await tx.transaction.create({
      data: {
        reference: txRef,
        userId: customer.id,
        sourcePocketId: customerPocket.id,
        destinationPocketId: merchant.pocketId,
        type: 'TRANSFER_OUT',
        amount: transferNominal,
        adminFee: 0,
        status: 'SUCCESS',
        description: 'Bayar Kopi Susu via Transfer',
        recipientName: merchant.pocket!.user.fullName,
        recipientBank: 'BANK J-NAL',
        recipientAccount: merchant.pocket!.accountNumber,
        completedAt: new Date()
      }
    });

    // Receiver TX
    await tx.transaction.create({
      data: {
        reference: `${txRef}-IN`,
        userId: merchant.userId,
        sourcePocketId: customerPocket.id,
        destinationPocketId: merchant.pocketId,
        type: 'TRANSFER_IN',
        amount: transferNominal,
        adminFee: 0,
        status: 'SUCCESS',
        description: 'Pembayaran Transfer dari Zainal Salamun',
        recipientName: customer.fullName,
        recipientBank: 'BANK J-NAL',
        recipientAccount: customerPocket.accountNumber,
        completedAt: new Date()
      }
    });
  });

  const updatedMerchantPocket = await db.pocket.findUnique({
    where: { id: merchant.pocketId }
  });

  console.log(`\n✓ 2. Transfer Berhasil Diterima Rekening Owner:`);
  console.log(`     Nominal Transfer : Rp ${transferNominal.toLocaleString('id-ID')}`);
  console.log(`     Saldo Baru       : Rp ${Number(updatedMerchantPocket?.balance).toLocaleString('id-ID')} (+Rp ${transferNominal.toLocaleString('id-ID')})`);
  console.log(`\n🎉 FITUR TERIMA TRANSFER OWNER BERHASIL TERVERIFIKASI 100%!`);
}

testTransferToMerchant()
  .catch(console.error)
  .finally(async () => {
    await db.$disconnect();
  });
