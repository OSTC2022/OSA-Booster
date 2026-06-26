import sharp from 'sharp'
import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const source = path.join(root, 'public/brand-pulse-source.png')
const iconsDir = path.join(root, 'public/icons')
const imagesDir = path.join(root, 'public/images')
const appDir = path.join(root, 'app')
const uiIcon = path.join(root, 'public/brand-pulse-icon.png')

/** UI 에셋 — 레티나 대응 고해상도 */
const EXPORT_SIZE = 1024
const SOURCE_UPSCALE = 2048

/** Home-screen / PWA icon canvas — matches app theme */
const APP_BG = '#070d18'
const NEON = { r: 170, g: 255, b: 0 }

function lum(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function isNeonStroke(r, g, b) {
  const greenness = g - Math.max(r, b)
  return greenness > 18 && g > 50
}

async function loadUpscaledSourceRaw() {
  const upscaled = await sharp(source)
    .resize(SOURCE_UPSCALE, SOURCE_UPSCALE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .sharpen({ sigma: 0.65, m1: 1.1, m2: 0.45 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  return upscaled
}

async function buildTransparentSymbolBuffer() {
  const { data, info } = await loadUpscaledSourceRaw()
  const w = info.width
  const h = info.height

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]

      if (isNeonStroke(r, g, b)) {
        const strength = Math.min(1, (g - Math.max(r, b)) / 70)
        data[i] = NEON.r
        data[i + 1] = NEON.g
        data[i + 2] = NEON.b
        data[i + 3] = Math.round(255 * Math.max(0.55, strength))
        continue
      }

      if (lum(r, g, b) < 48) {
        data[i + 3] = 0
        continue
      }

      data[i + 3] = 0
    }
  }

  return sharp(data, {
    raw: { width: w, height: h, channels: 4 },
  }).png()
}

/** Trim → square canvas (비율 유지) */
async function buildBalancedSquareSymbol() {
  const trimmed = await buildTransparentSymbolBuffer().then((img) =>
    img.trim({ threshold: 2 }).png().toBuffer(),
  )

  const { width = 1, height = 1 } = await sharp(trimmed).metadata()
  const side = Math.max(width, height)
  const pad = Math.round(side * 0.1)
  const canvas = side + pad * 2

  return sharp(trimmed)
    .extend({
      top: Math.floor((canvas - height) / 2),
      bottom: Math.ceil((canvas - height) / 2),
      left: Math.floor((canvas - width) / 2),
      right: Math.ceil((canvas - width) / 2),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .resize(EXPORT_SIZE, EXPORT_SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .sharpen({ sigma: 0.35, m1: 0.8, m2: 0.3 })
    .png({ compressionLevel: 6, adaptiveFiltering: true })
    .toBuffer()
}

await mkdir(iconsDir, { recursive: true })
await mkdir(imagesDir, { recursive: true })

const symbolBuffer = await buildBalancedSquareSymbol()
await sharp(symbolBuffer).toFile(uiIcon)

console.log(`Wrote ${EXPORT_SIZE}px brand-pulse-icon.png`)

async function renderHomeIcon(size, logoScale) {
  const logoSize = Math.round(size * logoScale)
  const logo = await sharp(symbolBuffer)
    .resize(logoSize, logoSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer()

  const top = Math.round((size - logoSize) / 2)
  const left = Math.round((size - logoSize) / 2)

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: APP_BG,
    },
  })
    .composite([{ input: logo, left, top }])
    .png()
    .toBuffer()
}

const homeIcons = [
  { name: 'icon-32.png', size: 32, scale: 0.84 },
  { name: 'icon-180.png', size: 180, scale: 0.82 },
  { name: 'apple-icon.png', size: 180, scale: 0.82 },
  { name: 'icon-192.png', size: 192, scale: 0.82 },
  { name: 'icon-512.png', size: 512, scale: 0.82 },
  { name: 'icon-512-maskable.png', size: 512, scale: 0.7 },
]

for (const { name, size, scale } of homeIcons) {
  const buffer = await renderHomeIcon(size, scale)
  await sharp(buffer).toFile(path.join(iconsDir, name))
}

await copyFile(path.join(iconsDir, 'icon-512.png'), path.join(appDir, 'icon.png'))
await copyFile(path.join(iconsDir, 'apple-icon.png'), path.join(appDir, 'apple-icon.png'))
await sharp(await renderHomeIcon(32, 0.84)).toFile(path.join(root, 'public/favicon.ico'))

const ogSize = 320
const ogLogo = await sharp(symbolBuffer)
  .resize(ogSize, ogSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer()
const ogLeft = Math.round((1200 - ogSize) / 2)
const ogTop = Math.round((630 - ogSize) / 2)
const ogBuffer = await sharp({
  create: { width: 1200, height: 630, channels: 4, background: APP_BG },
})
  .composite([{ input: ogLogo, left: ogLeft, top: ogTop }])
  .png()
  .toBuffer()

await sharp(ogBuffer).toFile(path.join(imagesDir, 'og-image.png'))
await copyFile(path.join(imagesDir, 'og-image.png'), path.join(appDir, 'opengraph-image.png'))

console.log('Generated home-screen / PWA icons')
