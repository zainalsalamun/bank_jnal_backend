import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const db = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10);
  const pinHash = await bcrypt.hash('123456', 10);

  const user = await db.user.create({
    data: {
      fullName: 'Budi Santoso',
      phone: '081299998888',
      email: 'budi@jnal.bank',
      passwordHash,
      pinHash,
      status: 'ACTIVE',
      role: 'CUSTOMER',
      isVerified: true,
      pockets: {
        create: {
          name: 'Kantong Utama Budi',
          accountNumber: 'JNAL-081299998888',
          type: 'MAIN',
          balance: 500000.00,
          isPrimary: true,
        }
      }
    },
    include: {
      pockets: true
    }
  });

  console.log('Created dummy user:');
  console.log('Nama:', user.fullName);
  console.log('No Rekening:', user.pockets[0].accountNumber);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
