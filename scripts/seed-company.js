const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.company.upsert({
    where: { id: 'BMS' },
    update: {},
    create: {
      id: 'BMS',
      name: 'Bojar Logistic',
      isMain: true,
      status: 'ACTIVE'
    }
  });
  console.log('Company BMS seeded.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
