// A small ZIP writer (no compression, "store" method) so a project backup can be one file that opens everywhere.
// Pure TypeScript, no dependencies: tested with `pnpm test:lib`.

export type ZipEntry = { name: string; data: Uint8Array; date?: Date }

const table = (() => {
  const result = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    result[n] = c >>> 0
  }
  return result
})()

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let index = 0; index < data.length; index += 1) crc = table[(crc ^ data[index]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

const dosTime = (date: Date) => ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xffff
const dosDate = (date: Date) => ((((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff)

export const textBytes = (text: string) => new TextEncoder().encode(text)

// File names inside the archive: forward slashes, no leading slash, no "..", and nothing the person's computer could treat as a path escape.
export function safeEntryName(name: string): string {
  return name
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .map((part) => part.replace(/[<>:"|?*\u0000-\u001f]/g, "_"))
    .join("/")
}

export function buildZip(entries: ZipEntry[]): Uint8Array {
  if (entries.length > 65000) throw new Error("Too many files for one archive.")
  const names = new Set<string>()
  const prepared = entries.map((entry) => {
    const name = safeEntryName(entry.name)
    if (!name) throw new Error("A file has no usable name.")
    if (names.has(name)) throw new Error(`Duplicate file name in the archive: ${name}`)
    names.add(name)
    if (entry.data.length > 0xfffffff0) throw new Error(`${name} is too large for this archive format.`)
    const date = entry.date ?? new Date()
    return { name: textBytes(name), data: entry.data, crc: crc32(entry.data), time: dosTime(date), day: dosDate(date) }
  })
  let size = 22
  for (const item of prepared) size += 30 + item.name.length + item.data.length + 46 + item.name.length
  if (size > 0xfffffff0) throw new Error("The archive would be larger than 4 GB. Export without files or per project.")

  const out = new Uint8Array(size)
  const view = new DataView(out.buffer)
  let offset = 0
  const offsets: number[] = []
  for (const item of prepared) {
    offsets.push(offset)
    view.setUint32(offset, 0x04034b50, true)
    view.setUint16(offset + 4, 20, true)
    view.setUint16(offset + 6, 0x0800, true) // UTF-8 names
    view.setUint16(offset + 8, 0, true) // stored
    view.setUint16(offset + 10, item.time, true)
    view.setUint16(offset + 12, item.day, true)
    view.setUint32(offset + 14, item.crc, true)
    view.setUint32(offset + 18, item.data.length, true)
    view.setUint32(offset + 22, item.data.length, true)
    view.setUint16(offset + 26, item.name.length, true)
    view.setUint16(offset + 28, 0, true)
    out.set(item.name, offset + 30)
    out.set(item.data, offset + 30 + item.name.length)
    offset += 30 + item.name.length + item.data.length
  }
  const centralStart = offset
  prepared.forEach((item, index) => {
    view.setUint32(offset, 0x02014b50, true)
    view.setUint16(offset + 4, 20, true)
    view.setUint16(offset + 6, 20, true)
    view.setUint16(offset + 8, 0x0800, true)
    view.setUint16(offset + 10, 0, true)
    view.setUint16(offset + 12, item.time, true)
    view.setUint16(offset + 14, item.day, true)
    view.setUint32(offset + 16, item.crc, true)
    view.setUint32(offset + 20, item.data.length, true)
    view.setUint32(offset + 24, item.data.length, true)
    view.setUint16(offset + 28, item.name.length, true)
    view.setUint32(offset + 42, offsets[index], true)
    out.set(item.name, offset + 46)
    offset += 46 + item.name.length
  })
  view.setUint32(offset, 0x06054b50, true)
  view.setUint16(offset + 8, prepared.length, true)
  view.setUint16(offset + 10, prepared.length, true)
  view.setUint32(offset + 12, offset - centralStart, true)
  view.setUint32(offset + 16, centralStart, true)
  return out
}
