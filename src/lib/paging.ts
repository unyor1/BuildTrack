// Reading whole lists. Supabase returns at most 1,000 rows per request, so a plain select silently stops there on a big project.
// `fetchAll` asks page by page until a page comes back short, so totals, progress and registers always count every row.
// Pure (no imports), tested in `pnpm test:lib`.

export const PAGE_SIZE = 1000
export const ROW_CAP = 50000

type Page<T> = { data: T[] | null; error: unknown }

// `page(from, to)` runs the query with `.range(from, to)` (inclusive). The query needs a stable order for paging to be correct.
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<Page<T>>, pageSize = PAGE_SIZE, cap = ROW_CAP): Promise<{ data: T[]; error: boolean }> {
  const rows: T[] = []
  for (let from = 0; from < cap; from += pageSize) {
    const result = await page(from, Math.min(from + pageSize, cap) - 1)
    if (result.error) return { data: rows, error: true }
    const chunk = result.data ?? []
    rows.push(...chunk)
    if (chunk.length < pageSize) break
  }
  return { data: rows, error: false }
}
