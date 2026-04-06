const fs = require('fs');
const { execSync } = require('child_process');

const shouldSkip =
  process.env.VERCEL === '1' ||
  process.env.CI === 'true' ||
  process.env.HUSKY === '0' ||
  !fs.existsSync('.git');

if (shouldSkip) {
  console.log('[prepare] Skipping husky hook setup in this environment.');
  process.exit(0);
}

execSync('husky', { stdio: 'inherit' });
