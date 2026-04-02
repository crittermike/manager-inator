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

echo "♻️  Restoring settings from backup..."
rm -rf "$APP_DATA"
mv "$BACKUP" "$APP_DATA"

echo "✅ Settings restored. Restart the app to pick them up."
