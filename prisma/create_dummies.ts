import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const db = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10);
  const pinHash = await bcrypt.hash('123456', 10);

  const users = [
    { name: 'Siti Aminah', phone: '085511112222', account: '085511112222' },
    { name: 'Ahmad Faisal', phone: '087733334444', account: '087733334444' },
    { name: 'Rina Kartika', phone: '081155556666', account: '081155556666' }
  ];

  for (const u of users) {
    const existing = await db.user.findUnique({ where: { phone: u.phone } });
    if (!existing) {
      await db.user.create({
        data: {
          fullName: u.name,
          phone: u.phone,
          email: `${u.name.toLowerCase().replace(' ', '')}@jnal.bank`,
          passwordHash,
          pinHash,
          status: 'ACTIVE',
          role: 'CUSTOMER',
          isVerified: true,
          pockets: {
            create: {
              name: `Kantong Utama ${u.name.split(' ')[0]}`,
              accountNumber: `JNAL-${u.account}`,
              type: 'MAIN',
              balance: 1000000.00,
              isPrimary: true,
            }
          }
        }
      });
      console.log(`Created: ${u.name} - JNAL-${u.account}`);
    }
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
