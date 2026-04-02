#!/bin/bash
# Restore settings from backup after a fresh install test.

set -e

APP_DATA="$HOME/Library/Application Support/Manager-inator"
BACKUP="$HOME/Library/Application Support/Manager-inator-backup"

if [ ! -d "$BACKUP" ]; then
  echo "❌ No backup found at: $BACKUP"
  echo "   Run 'npm run test:fresh' first to create a backup."
  exit 1
fi

# Kill the production app if running
echo "🛑 Closing Manager-inator if running..."
osascript -e 'quit app "Manager-inator"' 2>/dev/null || true
sleep 1

echo "♻️  Restoring settings from backup..."
rm -rf "$APP_DATA"
mv "$BACKUP" "$APP_DATA"

echo "✅ Settings restored. Restart the app (npm run dev) to pick them up."
