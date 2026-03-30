#!/usr/bin/env node
/**
 * Generate a simple app icon PNG using pure Node.js (no dependencies).
 * Creates a 1024x1024 purple gradient icon with "M" letter.
 * Then uses macOS iconutil to create .icns file.
 */
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import { execSync } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { deflateSync } from 'zlib'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

const SIZE = 1024

// Generate pixel data - purple gradient background with rounded corners
function generatePixels(size) {
  const pixels = Buffer.alloc(size * size * 4)
  const center = size / 2
  const cornerRadius = size * 0.22 // rounded rect corners

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4

      // Check if inside rounded rect
      const inRoundedRect = isInsideRoundedRect(x, y, 0, 0, size, size, cornerRadius)

      if (!inRoundedRect) {
        // Transparent
        pixels[offset] = 0
        pixels[offset + 1] = 0
        pixels[offset + 2] = 0
        pixels[offset + 3] = 0
        continue
      }

      // Purple gradient: top-left lighter, bottom-right darker
      const gradientT = (x + y) / (size * 2)
      const r = Math.round(lerp(160, 88, gradientT))  // from lighter to darker purple
      const g = Math.round(lerp(100, 28, gradientT))
      const b = Math.round(lerp(255, 200, gradientT))

      pixels[offset] = r
      pixels[offset + 1] = g
      pixels[offset + 2] = b
      pixels[offset + 3] = 255
    }
  }

  // Draw "M" letter
  drawM(pixels, size)

  return pixels
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function isInsideRoundedRect(px, py, rx, ry, rw, rh, radius) {
  // Inset by 1px for anti-aliasing edge
  const margin = 2
  const x1 = rx + margin, y1 = ry + margin
  const x2 = rx + rw - margin, y2 = ry + rh - margin
  const r = radius

  if (px < x1 || px >= x2 || py < y1 || py >= y2) return false

  // Check corners
  if (px < x1 + r && py < y1 + r) {
    return Math.hypot(px - (x1 + r), py - (y1 + r)) <= r
  }
  if (px >= x2 - r && py < y1 + r) {
    return Math.hypot(px - (x2 - r), py - (y1 + r)) <= r
  }
  if (px < x1 + r && py >= y2 - r) {
    return Math.hypot(px - (x1 + r), py - (y2 - r)) <= r
  }
  if (px >= x2 - r && py >= y2 - r) {
    return Math.hypot(px - (x2 - r), py - (y2 - r)) <= r
  }

  return true
}

function drawM(pixels, size) {
  // Draw a bold "M" in the center
  const scale = size / 1024
  const strokeWidth = Math.round(70 * scale)
  const left = Math.round(240 * scale)
  const right = Math.round(784 * scale)
  const top = Math.round(250 * scale)
  const bottom = Math.round(774 * scale)
  const midX = Math.round(512 * scale)
  const midY = Math.round(550 * scale)

  // Draw with white, semi-transparent for depth
  const color = { r: 255, g: 255, b: 255, a: 240 }

  // Left vertical stroke
  fillRect(pixels, size, left, top, left + strokeWidth, bottom, color)

  // Right vertical stroke
  fillRect(pixels, size, right - strokeWidth, top, right, bottom, color)

  // Left diagonal (top-left to center)
  drawThickLine(pixels, size, left + strokeWidth / 2, top, midX, midY, strokeWidth, color)

  // Right diagonal (top-right to center)
  drawThickLine(pixels, size, right - strokeWidth / 2, top, midX, midY, strokeWidth, color)
}

function fillRect(pixels, size, x1, y1, x2, y2, color) {
  for (let y = Math.max(0, Math.floor(y1)); y < Math.min(size, Math.ceil(y2)); y++) {
    for (let x = Math.max(0, Math.floor(x1)); x < Math.min(size, Math.ceil(x2)); x++) {
      const offset = (y * size + x) * 4
      if (pixels[offset + 3] === 0) continue // skip transparent
      blendPixel(pixels, offset, color)
    }
  }
}

function drawThickLine(pixels, size, x1, y1, x2, y2, thickness, color) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy)
  const steps = Math.ceil(len)

  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const cx = x1 + dx * t
    const cy = y1 + dy * t

    // Draw a filled circle at each point
    const r = thickness / 2
    for (let oy = -r; oy <= r; oy++) {
      for (let ox = -r; ox <= r; ox++) {
        if (ox * ox + oy * oy <= r * r) {
          const px = Math.round(cx + ox)
          const py = Math.round(cy + oy)
          if (px >= 0 && px < size && py >= 0 && py < size) {
            const offset = (py * size + px) * 4
            if (pixels[offset + 3] === 0) continue
            blendPixel(pixels, offset, color)
          }
        }
      }
    }
  }
}

function blendPixel(pixels, offset, color) {
  const alpha = color.a / 255
  pixels[offset] = Math.round(pixels[offset] * (1 - alpha) + color.r * alpha)
  pixels[offset + 1] = Math.round(pixels[offset + 1] * (1 - alpha) + color.g * alpha)
  pixels[offset + 2] = Math.round(pixels[offset + 2] * (1 - alpha) + color.b * alpha)
  pixels[offset + 3] = Math.max(pixels[offset + 3], color.a)
}

// Create PNG from raw RGBA pixels
function createPNG(pixels, width, height) {
  // PNG file structure
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  // IHDR chunk
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  // IDAT chunk - filter each row with filter byte 0 (None)
  const rawData = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0 // filter byte: None
    pixels.copy(rawData, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4)
  }

  const compressed = deflateSync(rawData, { level: 6 })

  const chunks = [
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0))
  ]

  return Buffer.concat([signature, ...chunks])
}

function makeChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)

  const typeBuffer = Buffer.from(type)
  const crcData = Buffer.concat([typeBuffer, data])

  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(crcData), 0)

  return Buffer.concat([length, typeBuffer, data, crc])
}

// CRC32 implementation
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ crcTable[(c ^ buf[i]) & 0xff]
  }
  return (c ^ 0xffffffff) >>> 0
}

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[n] = c
  }
  return table
})()

// Generate and save
console.log('Generating 1024x1024 icon...')
const pixels = generatePixels(SIZE)
const png = createPNG(pixels, SIZE, SIZE)

const iconPath = join(rootDir, 'resources', 'icon.png')
writeFileSync(iconPath, png)
console.log(`Saved ${iconPath} (${png.length} bytes)`)

// Create .icns using macOS iconutil
if (process.platform === 'darwin') {
  console.log('Creating .icns from PNG...')
  const iconsetDir = join(rootDir, 'resources', 'icon.iconset')

  try {
    mkdirSync(iconsetDir, { recursive: true })

    // Generate all required sizes
    const sizes = [16, 32, 64, 128, 256, 512, 1024]
    for (const s of sizes) {
      const name = s === 1024 ? 'icon_512x512@2x.png' : s === 512 ? 'icon_512x512.png' :
                   s === 64 ? 'icon_32x32@2x.png' :
                   `icon_${s}x${s}.png`
      execSync(`sips -z ${s} ${s} "${iconPath}" --out "${join(iconsetDir, name)}"`, { stdio: 'pipe' })

      // Also create @2x versions
      if (s <= 256 && s !== 64) {
        const name2x = `icon_${s}x${s}@2x.png`
        const s2x = s * 2
        execSync(`sips -z ${s2x} ${s2x} "${iconPath}" --out "${join(iconsetDir, name2x)}"`, { stdio: 'pipe' })
      }
    }

    const icnsPath = join(rootDir, 'resources', 'icon.icns')
    execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`, { stdio: 'pipe' })
    console.log(`Saved ${icnsPath}`)

    // Clean up iconset directory
    rmSync(iconsetDir, { recursive: true, force: true })
  } catch (err) {
    console.error('Failed to create .icns:', err.message)
  }
}

console.log('Done!')
