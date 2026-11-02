const GAP = '  ';

function widths(headers: readonly string[], rows: readonly string[][]): number[] {
  return headers.map((head, col) =>
    Math.max(head.length, ...rows.map((row) => (row[col] ?? '').length)),
  );
}

function renderRow(cells: readonly string[], sizes: readonly number[]): string {
  return cells
    .map((cell, col) => cell.padEnd(sizes[col] ?? 0))
    .join(GAP)
    .trimEnd();
}

export function renderTable(headers: readonly string[], rows: readonly string[][]): string {
  const sizes = widths(headers, rows);
  const rule = sizes.map((size) => '-'.repeat(size)).join(GAP);
  return [renderRow(headers, sizes), rule, ...rows.map((row) => renderRow(row, sizes))].join('\n');
}
