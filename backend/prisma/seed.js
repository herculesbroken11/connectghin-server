const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const defaults = [
    { key: 'free_swipe_daily_limit', valueJson: 50 },
    { key: 'premium_direct_message_enabled', valueJson: true },
    { key: 'trial_days', valueJson: 7 },
    { key: 'support_email', valueJson: 'support@connectghin.app' },
    { key: 'maintenance_mode', valueJson: false },
  ];
  for (const item of defaults) {
    await prisma.appSettings.upsert({
      where: { key: item.key },
      update: { valueJson: item.valueJson },
      create: item,
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
