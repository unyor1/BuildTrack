import { supabase } from "./supabase"

// Pictures dropped onto a sheet (site snaps, vendor specs, logos). They are shrunk in the browser first, so a 12 MB phone photo
// becomes a ~300 KB WebP, then stored in the private `blueprints` bucket inside the project folder.
export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif"
const SOURCE_TYPES = IMAGE_ACCEPT.split(",")
export const MAX_IMAGE_SOURCE_BYTES = 20 * 1024 * 1024
const MAX_SIDE = 2000

export function validateImageFile(file: File | null | undefined): string {
  if (!file) return "Choose a picture."
  if (!SOURCE_TYPES.includes(file.type)) {
    return file.type === "image/svg+xml" ? "SVG pictures are not supported. Export it as PNG first." : "Use a PNG, JPEG, WebP, GIF, BMP or AVIF picture."
  }
  if (file.size === 0) return "That file is empty."
  if (file.size > MAX_IMAGE_SOURCE_BYTES) return `That picture is ${(file.size / 1048576).toFixed(1)} MB. The limit is 20 MB.`
  return ""
}

export type PreparedImage = { blob: Blob; width: number; height: number; ext: "webp" | "jpg" | "png" }

export async function prepareImage(file: File): Promise<PreparedImage> {
  const problem = validateImageFile(file)
  if (problem) throw new Error(problem)
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error("That picture could not be read. It may be damaged.")
  }
  const ratio = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * ratio))
  const height = Math.max(1, Math.round(bitmap.height * ratio))
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Your browser cannot prepare the picture.")
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.86))
  if (!blob) throw new Error("Could not prepare the picture.")
  const ext = blob.type === "image/webp" ? "webp" : blob.type === "image/jpeg" ? "jpg" : "png"
  return { blob, width, height, ext }
}

// Returns the storage path. The database re-checks that it sits inside the project folder.
export async function uploadSheetImage(projectId: string, blueprintId: string, image: PreparedImage): Promise<string> {
  const random = crypto.randomUUID().slice(0, 8)
  const path = `${projectId}/${blueprintId}/img-${Date.now()}-${random}.${image.ext}`
  const { error } = await supabase.storage.from("blueprints").upload(path, image.blob, { contentType: image.blob.type, upsert: false })
  if (error) throw new Error(/row-level security|not allowed|403/i.test(error.message) ? "You are not allowed to add pictures to this project." : error.message)
  return path
}

export const imageFilesFrom = (list: FileList | File[] | DataTransferItemList | null | undefined): File[] => {
  if (!list) return []
  const files: File[] = []
  for (const entry of Array.from(list as ArrayLike<File | DataTransferItem>)) {
    const file = entry instanceof File ? entry : entry.kind === "file" ? entry.getAsFile() : null
    if (file && file.type.startsWith("image/")) files.push(file)
  }
  return files
}
