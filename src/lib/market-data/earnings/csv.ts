/**
 * RFC4180-ish CSV parser for Alpha Vantage EARNINGS_CALENDAR.
 * Handles quoted fields, escaped quotes, blank fields, and CR/LF.
 * Malformed rows are returned with whatever fields could be read.
 */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const input = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]!;
    const next = input[index + 1];

    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n") {
      row.push(field);
      field = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    if (char === "\r") {
      continue;
    }
    field += char;
  }

  row.push(field);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

export function csvRowsToObjects(rows: string[][]): Array<Record<string, string>> {
  if (rows.length === 0) return [];
  const headers = (rows[0] ?? []).map((header) => header.trim());
  const objects: Array<Record<string, string>> = [];
  for (const row of rows.slice(1)) {
    const record: Record<string, string> = {};
    for (let index = 0; index < headers.length; index += 1) {
      const key = headers[index];
      if (!key) continue;
      record[key] = row[index] ?? "";
    }
    objects.push(record);
  }
  return objects;
}
