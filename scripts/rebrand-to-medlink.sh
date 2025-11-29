#!/bin/bash

# Script to rebrand from Heyflow to MedLink

echo "Rebranding from Heyflow to MedLink..."

# Create new medlink directory structure
echo "Creating new MedLink directory structure..."
mkdir -p src/lib/medlink
mkdir -p src/app/api/webhooks/medlink-intake

# Copy files to new locations
echo "Copying files to new MedLink directories..."
cp -r src/lib/heyflow/* src/lib/medlink/ 2>/dev/null || true
cp -r src/app/api/webhooks/heyflow-intake/* src/app/api/webhooks/medlink-intake/ 2>/dev/null || true

# Update imports in all TypeScript/JavaScript files
echo "Updating imports..."
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) \
  -not -path "./node_modules/*" \
  -not -path "./.next/*" \
  -not -path "./coverage/*" \
  -exec sed -i '' 's|@/lib/heyflow|@/lib/medlink|g' {} \;

find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) \
  -not -path "./node_modules/*" \
  -not -path "./.next/*" \
  -not -path "./coverage/*" \
  -exec sed -i '' 's|/api/webhooks/heyflow-intake|/api/webhooks/medlink-intake|g' {} \;

# Update environment variable references
echo "Updating environment variables..."
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.md" \) \
  -not -path "./node_modules/*" \
  -not -path "./.next/*" \
  -not -path "./coverage/*" \
  -exec sed -i '' 's|HEYFLOW_WEBHOOK_SECRET|MEDLINK_WEBHOOK_SECRET|g' {} \;

# Update any remaining Heyflow references in comments and strings
echo "Updating remaining references..."
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.md" \) \
  -not -path "./node_modules/*" \
  -not -path "./.next/*" \
  -not -path "./coverage/*" \
  -not -path "./scripts/*" \
  -exec sed -i '' 's|Heyflow|MedLink|g' {} \;

find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.md" \) \
  -not -path "./node_modules/*" \
  -not -path "./.next/*" \
  -not -path "./coverage/*" \
  -not -path "./scripts/*" \
  -exec sed -i '' 's|heyflow|medlink|g' {} \;

echo "Creating .env.example with new variable names..."
if [ -f .env ]; then
  cp .env .env.backup
  sed 's|HEYFLOW_WEBHOOK_SECRET|MEDLINK_WEBHOOK_SECRET|g' .env > .env.tmp && mv .env.tmp .env
  echo "Updated .env file (backup saved as .env.backup)"
fi

if [ -f .env.example ]; then
  sed 's|HEYFLOW_WEBHOOK_SECRET|MEDLINK_WEBHOOK_SECRET|g' .env.example > .env.example.tmp && mv .env.example.tmp .env.example
  echo "Updated .env.example file"
fi

echo "Rebrand complete! Please note:"
echo "1. Update your .env file with the new MEDLINK_WEBHOOK_SECRET variable"
echo "2. Update your webhook URL in MedLink to point to /api/webhooks/medlink-intake"
echo "3. You can safely delete the old src/lib/heyflow and src/app/api/webhooks/heyflow-intake directories"
echo "4. Run 'npm run dev' to test the changes"
