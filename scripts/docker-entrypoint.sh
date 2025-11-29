#!/bin/sh
set -e

echo "🚀 Starting EONPRO Application..."

# Run database migrations
echo "📊 Running database migrations..."
npx prisma migrate deploy

# Seed database if needed (only in staging)
if [ "$NODE_ENV" = "staging" ] && [ "$SEED_DATABASE" = "true" ]; then
  echo "🌱 Seeding database..."
  npx prisma db seed
fi

# Start the application
echo "✅ Starting Next.js server..."
exec npm start
