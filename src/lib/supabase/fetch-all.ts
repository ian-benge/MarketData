/** PostgREST/Supabase clients cap a single select at 1,000 rows by default. */
export const SUPABASE_PAGE_SIZE = 1000;
const MAX_ROWS = 100_000;

export async function fetchAllRows<T>(
  loadPage: (from: number, to: number) => Promise<T[]>,
  pageSize = SUPABASE_PAGE_SIZE,
): Promise<T[]> {
  const size = Math.max(1, pageSize);
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += size) {
    const page = await loadPage(from, from + size - 1);
    rows.push(...page);
    if (page.length < size) break;
  }
  return rows;
}
