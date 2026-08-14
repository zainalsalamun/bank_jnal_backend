import { db } from './src/config/db';
import bcrypt from 'bcrypt';

async function main() {
  const passwordHash = await bcrypt.hash('123456', 10);
  
  const user = await db.user.create({
    data: {
      fullName: 'Budi Santoso',
      email: 'budi@example.com',
      phone: '089876543210',
      passwordHash: passwordHash,
      role: 'CUSTOMER',
      pockets: {
        create: [
          {
            name: 'Kantong Utama Budi',
            balance: 5000000,
            isPrimary: true,
            accountNumber: 'JNAL-9876543210', // Unique account number
            type: 'MAIN'
          }
        ]
      }
    }
  });
  console.log('User created:', user);
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await db.$disconnect();
  });
