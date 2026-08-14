import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  const saved = await db.savedAccount.findMany();
  console.log(JSON.stringify(saved, null, 2));
}

main().finally(() => db.$disconnect());
