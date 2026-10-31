/** Responsive card columns: 1 on phones, then 2 / 3 / 4 (fewer next to a map). */
export type GridColumns = 2 | 3 | 4;

const COLUMNS: Record<GridColumns, string> = {
  2: "grid grid-cols-1 gap-x-5 gap-y-6 sm:grid-cols-2",
  3: "grid grid-cols-1 gap-x-5 gap-y-6 sm:grid-cols-2 xl:grid-cols-3",
  4: "grid grid-cols-1 gap-x-5 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
};

export function gridColumnsClass(columns: GridColumns): string {
  return COLUMNS[columns];
}
