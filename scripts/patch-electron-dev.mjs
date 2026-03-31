#!/usr/bin/env node
/**
 * Patches the local Electron binary for dev mode so macOS shows
 * "Manager-inator" in the dock instead of "Electron", and uses
 * the app icon instead of the default Electron icon.
 *
 * Run once after `npm install` or whenever the Electron binary updates.
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const plistPath = join(root, 'node_modules/electron/dist/Electron.app/Contents/Info.plist')
const iconsDir = join(root, 'node_modules/electron/dist/Electron.app/Contents/Resources')
const appIcon = join(root, 'resources/icon.icns')

if (!existsSync(plistPath)) {
  console.log('Electron binary not found — skipping dev patch.')
  process.exit(0)
}

// Patch Info.plist
let plist = readFileSync(plistPath, 'utf8')

const replacements = [
  [/<key>CFBundleDisplayName<\/key>\s*<string>[^<]*<\/string>/,
   '<key>CFBundleDisplayName</key>\n\t<string>Manager-inator</string>'],
  [/<key>CFBundleName<\/key>\s*<string>[^<]*<\/string>/,
   '<key>CFBundleName</key>\n\t<string>Manager-inator</string>'],
  [/<key>CFBundleIconFile<\/key>\s*<string>[^<]*<\/string>/,
   '<key>CFBundleIconFile</key>\n\t<string>app.icns</string>'],
]

let changed = false
for (const [pattern, replacement] of replacements) {
  const before = plist
  plist = plist.replace(pattern, replacement)
  if (plist !== before) changed = true
}

if (changed) {
  writeFileSync(plistPath, plist, 'utf8')
  console.log('✓ Patched Electron Info.plist (name → Manager-inator)')
}

// Copy app icon
if (existsSync(appIcon)) {
  const dest = join(iconsDir, 'app.icns')
  copyFileSync(appIcon, dest)
  console.log('✓ Copied app icon to Electron.app')
}

console.log('Dev patch complete. Run `npm run dev` to see changes.')
