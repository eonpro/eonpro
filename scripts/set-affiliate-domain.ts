/**
 * Set affiliateCustomDomain in clinic settings JSON.
 * 
 * Usage: npx dotenv -e .env.production.local -- npx tsx scripts/set-affiliate-domain.ts
 * 
 * This sets clinic 8 (Overtime) settings.affiliateCustomDomain = "join.otmens.com"
 * so the proxy and clinic resolve can map that domain to the affiliate portal.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CLINIC_ID = 8;
const AFFILIATE_DOMAIN = 'join.otmens.com';

async function main() {
  const clinic = await prisma.clinic.findUnique({
    where: { id: CLINIC_ID },
    select: { id: true, name: true, settings: true },
  });

  if (!clinic) {
    console.error(`Clinic ${CLINIC_ID} not found`);
    process.exit(1);
  }

  const currentSettings = (clinic.settings as Record<string, unknown>) || {};
  const updatedSettings = { ...currentSettings, affiliateCustomDomain: AFFILIATE_DOMAIN };

  await prisma.clinic.update({
    where: { id: CLINIC_ID },
    data: { settings: updatedSettings },
  });

  console.log(`Set affiliateCustomDomain="${AFFILIATE_DOMAIN}" on clinic ${CLINIC_ID} (${clinic.name})`);
  console.log('Updated settings keys:', Object.keys(updatedSettings).join(', '));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
