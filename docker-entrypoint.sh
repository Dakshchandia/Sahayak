#!/bin/sh
set -e

echo "=== SAHAYAK startup ==="
echo "Waiting for database..."

# Wait for DB to accept connections
until npx drizzle-kit migrate --config drizzle.config.ts 2>&1; do
  echo "Migration failed — retrying in 3s..."
  sleep 3
done

echo "Running seed..."
npx tsx scripts/seed.ts || echo "Seed already applied or skipped."

echo "Starting application..."
exec node_modules/.bin/next start -p 3000
