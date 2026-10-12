// One-off helper: builds the app icons (PWA / home screen) from the company logo. Run: node scripts/make-pwa-icons.mjs
// Reads src/assets/valencia/logo-source.png (8-bit RGB) and writes public/icons/*.png. No dependencies (Node's zlib only).
import { inflateSync, deflateSync, crc32 } from "node:zlib"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"

const source = readFileSync(new URL("../src/assets/valencia/logo-source.png", import.meta.url))
if (source.readUInt32BE(0) !== 0x89504e47) throw new Error("Not a PNG file")

let width = 0
let height = 0
const idat = []
for (let offset = 8; offset < source.length; ) {
  const length = source.readUInt32BE(offset)
  const type = source.toString("ascii", offset + 4, offset + 8)
  const data = source.subarray(offset + 8, offset + 8 + length)
  if (type === "IHDR") {
    width = data.readUInt32BE(0)
    height = data.readUInt32BE(4)
    if (data[8] !== 8 || data[9] !== 2 || data[12] !== 0) throw new Error("Expected an 8-bit RGB PNG without interlacing")
  } else if (type === "IDAT") idat.push(data)
  offset += 12 + length
}

const raw = inflateSync(Buffer.concat(idat))
const stride = width * 3
const pixels = Buffer.alloc(stride * height)
for (let y = 0; y < height; y += 1) {
  const filter = raw[y * (stride + 1)]
  const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
  for (let x = 0; x < stride; x += 1) {
    const left = x >= 3 ? pixels[y * stride + x - 3] : 0
    const up = y > 0 ? pixels[(y - 1) * stride + x] : 0
    const upLeft = y > 0 && x >= 3 ? pixels[(y - 1) * stride + x - 3] : 0
    let value = row[x]
    if (filter === 1) value += left
    else if (filter === 2) value += up
    else if (filter === 3) value += (left + up) >> 1
    else if (filter === 4) {
      const p = left + up - upLeft
      const pa = Math.abs(p - left)
      const pb = Math.abs(p - up)
      const pc = Math.abs(p - upLeft)
      value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft
    }
    pixels[y * stride + x] = value & 255
  }
}
const background = [pixels[0], pixels[1], pixels[2]] // the logo's own background colour (top-left pixel)

// Area-average scaling of the logo into a square canvas with `padding` (fraction of the size) around it.
function render(size, padding) {
  const inner = Math.round(size * (1 - 2 * padding))
  const out = Buffer.alloc(size * size * 3)
  for (let i = 0; i < size * size; i += 1) out.set(background, i * 3)
  const start = Math.round((size - inner) / 2)
  const ratio = width / inner
  for (let y = 0; y < inner; y += 1) {
    for (let x = 0; x < inner; x += 1) {
      const x0 = Math.floor(x * ratio)
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * ratio))
      const y0 = Math.floor(y * ratio)
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * ratio))
      let r = 0
      let g = 0
      let b = 0
      let n = 0
      for (let yy = y0; yy < y1 && yy < height; yy += 1) {
        for (let xx = x0; xx < x1 && xx < width; xx += 1) {
          const at = yy * stride + xx * 3
          r += pixels[at]
          g += pixels[at + 1]
          b += pixels[at + 2]
          n += 1
        }
      }
      const to = ((start + y) * size + start + x) * 3
      out[to] = Math.round(r / n)
      out[to + 1] = Math.round(g / n)
      out[to + 2] = Math.round(b / n)
    }
  }
  return out
}

function chunk(type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, "ascii")
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0)
  return Buffer.concat([head, data, tail])
}

function png(size, rgb) {
  const rows = Buffer.alloc((size * 3 + 1) * size)
  for (let y = 0; y < size; y += 1) rgb.copy(rows, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows, { level: 9 })), chunk("IEND", Buffer.alloc(0))])
}

const directory = new URL("../public/icons/", import.meta.url)
mkdirSync(directory, { recursive: true })
const files = [
  ["icon-192.png", 192, 0.06],
  ["icon-512.png", 512, 0.06],
  ["icon-maskable-512.png", 512, 0.14], // Android crops maskable icons to a circle or a rounded square: keep the logo in the middle 72 %
  ["apple-touch-icon.png", 180, 0.08],
]
for (const [name, size, padding] of files) {
  writeFileSync(new URL(name, directory), png(size, render(size, padding)))
  console.log("wrote", name)
}
