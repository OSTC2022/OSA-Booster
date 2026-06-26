import sharp from 'sharp'
import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const source = path.join(root, 'public/onestep-mark-source.png')
const brandIcon = path.join(root, 'public/brand-pulse-icon.png')
const iconsDir = path.join(root, 'public/icons')
const imagesDir = path.join(root, 'public/images')
const appDir = path.join(root, 'app')

/** Home-screen / PWA icon canvas */
const APP_BG = '#070d18'

const symbolBuffer = await sharp(source).ensureAlpha().png().toBuffer()

await copyFile(source, brandIcon)
await mkdir(iconsDir, { recursive: true })
await mkdir(imagesDir, { recursive: true })
await mkdir(appDir, { recursive: true })

async function renderHomeIcon(size, logoScale = 0.92) {
  const logoSize = Math.round(size * logoScale)
  const logo = await sharp(symbolBuffer)
    .resize(logoSize, logoSize, { kernel: sharp.kernel.lanczos3 })
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
  { name: 'icon-32.png', size: 32, scale: 0.92 },
  { name: 'icon-180.png', size: 180, scale: 0.9 },
  { name: 'apple-icon.png', size: 180, scale: 0.9 },
  { name: 'icon-192.png', size: 192, scale: 0.9 },
  { name: 'icon-512.png', size: 512, scale: 0.9 },
  { name: 'icon-512-maskable.png', size: 512, scale: 0.76 },
]

for (const { name, size, scale } of homeIcons) {
  const buffer = await renderHomeIcon(size, scale)
  await sharp(buffer).toFile(path.join(iconsDir, name))
}

await copyFile(path.join(iconsDir, 'icon-512.png'), path.join(appDir, 'icon.png'))
await copyFile(path.join(iconsDir, 'apple-icon.png'), path.join(appDir, 'apple-icon.png'))

await sharp(await renderHomeIcon(32, 0.92)).toFile(path.join(root, 'public/favicon.ico'))
await copyFile(path.join(iconsDir, 'apple-icon.png'), path.join(root, 'public/apple-icon.png'))

const ogWidth = 1200
const ogHeight = 630
const ogLogoSize = 280
const ogLogo = await sharp(symbolBuffer)
  .resize(ogLogoSize, ogLogoSize, { kernel: sharp.kernel.lanczos3 })
  .png()
  .toBuffer()

const ogImage = await sharp({
  create: {
    width: ogWidth,
    height: ogHeight,
    channels: 4,
    background: APP_BG,
  },
})
  .composite([
    {
      input: ogLogo,
      left: Math.round((ogWidth - ogLogoSize) / 2),
      top: Math.round((ogHeight - ogLogoSize) / 2),
    },
  ])
  .png()
  .toBuffer()

await sharp(ogImage).toFile(path.join(imagesDir, 'og-image.png'))
await sharp(ogImage).toFile(path.join(appDir, 'opengraph-image.png'))

console.log('Generated OneStep mark icons and og-image from onestep-mark-source.png')
