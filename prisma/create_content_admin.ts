import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const db = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10);
  
  const existing = await db.user.findUnique({ where: { email: 'content@jnal.bank' } });
  
  if (!existing) {
    await db.user.create({
      data: {
        fullName: 'Admin Konten JNAL',
        email: 'content@jnal.bank',
        phone: '089999999999',
        passwordHash: passwordHash,
        role: 'CONTENT_ADMIN',
        status: 'ACTIVE',
        isVerified: true
      }
    });
    console.log('Created content admin user: content@jnal.bank');
  } else {
    console.log('Content admin already exists');
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
