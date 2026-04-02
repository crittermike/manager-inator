#!/bin/bash
# Test a fresh install of the production app.
# Backs up current settings, wipes the store, builds a DMG, and opens it.

set -e

APP_DATA="$HOME/Library/Application Support/Manager-inator"
BACKUP="$HOME/Library/Application Support/Manager-inator-backup"

echo "📦 Backing up settings..."
if [ -d "$APP_DATA" ]; then
  rm -rf "$BACKUP"
  cp -r "$APP_DATA" "$BACKUP"
  echo "   Saved to: $BACKUP"
else
  echo "   No existing settings to back up"
fi

echo "🗑️  Wiping settings store..."
rm -rf "$APP_DATA"

echo "🔨 Building app (this takes ~2 min)..."
npm run dist 2>&1 | tail -5

echo "🔐 Removing quarantine..."
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  DMG=$(ls -t dist/*-arm64.dmg 2>/dev/null | head -1)
else
  DMG=$(ls -t dist/*.dmg 2>/dev/null | grep -v arm64 | head -1)
fi
if [ -z "$DMG" ]; then
  DMG=$(ls -t dist/*.dmg 2>/dev/null | head -1)
fi
if [ -z "$DMG" ]; then
  echo "❌ No DMG found in dist/"
  exit 1
fi

echo "📂 Mounting $DMG..."
MOUNT_DIR=$(hdiutil attach "$DMG" -nobrowse | grep "/Volumes" | sed 's/.*\/Volumes/\/Volumes/')
APP_PATH=$(find "$MOUNT_DIR" -name "*.app" -maxdepth 1 2>/dev/null | head -1)

if [ -z "$APP_PATH" ]; then
  echo "❌ No .app found in DMG"
  hdiutil detach "$MOUNT_DIR" -quiet
  exit 1
fi

echo "📋 Copying to /Applications..."
rm -rf "/Applications/Manager-inator.app"
cp -R "$APP_PATH" "/Applications/Manager-inator.app"
hdiutil detach "$MOUNT_DIR" -quiet

xattr -cr "/Applications/Manager-inator.app"

echo "🚀 Opening app..."
open "/Applications/Manager-inator.app"

echo ""
echo "✅ Fresh install running. When done, run: npm run test:restore"
