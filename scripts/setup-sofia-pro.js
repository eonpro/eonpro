import { logger } from '../src/lib/logger';

#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const fontsDir = path.join(process.cwd(), 'public', 'fonts');
const layoutPath = path.join(process.cwd(), 'src', 'app', 'layout.tsx');

// Check if Sofia Pro font files exist
const requiredFonts = [
  'SofiaPro-Light.woff2',
  'SofiaPro-Regular.woff2',
  'SofiaPro-Medium.woff2',
  'SofiaPro-SemiBold.woff2',
  'SofiaPro-Bold.woff2',
];

function checkFonts() {
  const missingFonts = [];
  
  requiredFonts.forEach(font => {
    const fontPath = path.join(fontsDir, font);
    if (!fs.existsSync(fontPath)) {
      missingFonts.push(font);
    }
  });
  
  return missingFonts;
}

function switchToSofiaPro() {
  let layoutContent = fs.readFileSync(layoutPath, 'utf-8');
  
  // Switch import to use actual Sofia Pro
  layoutContent = layoutContent.replace(
    /import { outfitFont as sofiaPro } from "\.\/fonts-fallback";/,
    'import { sofiaPro } from "./fonts";'
  );
  
  // Remove the comment line
  layoutContent = layoutContent.replace(
    /\/\/ import { sofiaPro } from "\.\/fonts"; \/\/ Uncomment when Sofia Pro files are added\n/,
    ''
  );
  
  fs.writeFileSync(layoutPath, layoutContent);
  logger.info('✅ Switched to Sofia Pro font!');
}

function switchToFallback() {
  let layoutContent = fs.readFileSync(layoutPath, 'utf-8');
  
  // Switch import to use fallback
  layoutContent = layoutContent.replace(
    /import { sofiaPro } from "\.\/fonts";/,
    'import { outfitFont as sofiaPro } from "./fonts-fallback";\n// import { sofiaPro } from "./fonts"; // Uncomment when Sofia Pro files are added'
  );
  
  fs.writeFileSync(layoutPath, layoutContent);
  logger.info('✅ Switched to fallback font (Outfit)');
}

// Main execution
const missingFonts = checkFonts();

if (missingFonts.length === 0) {
  logger.info('✅ All Sofia Pro font files found!');
  switchToSofiaPro();
  logger.info('\n🎉 Sofia Pro is now active as your platform font!');
} else {
  logger.info('⚠️  Missing Sofia Pro font files:');
  missingFonts.forEach(font => logger.info(`   - ${font}`));
  logger.info('\n📝 Instructions:');
  logger.info('1. Purchase Sofia Pro from MyFonts, Adobe Fonts, or Font Spring');
  logger.info('2. Add the .woff2 files to public/fonts/');
  logger.info('3. Run this script again: npm run setup-fonts');
  logger.info('\n🔄 Using Outfit font as fallback for now...');
  switchToFallback();
}

logger.info('\n📖 For more details, see: public/fonts/README.md');
