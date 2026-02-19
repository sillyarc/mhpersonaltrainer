'use client';

interface Column<T> {
  key: keyof T | string;
  label: string;
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
}

export default function DataTable<T extends { id?: string }>({
  columns,
  rows,
  emptyMessage = 'Sem dados ainda.',
  onRowClick,
  rowClassName,
}: DataTableProps<T>) {
  if (!rows.length) {
    return <p className="subtle">{emptyMessage}</p>;
  }

  return (
    <div className="data-table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={String(column.key)} className="data-table-header">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const extraClass = rowClassName ? rowClassName(row) : '';
            return (
              <tr
                key={row.id ?? `row-${index}`}
                className={`data-table-row${onRowClick ? ' is-clickable' : ''}${
                  extraClass ? ` ${extraClass}` : ''
                }`}
              onClick={() => onRowClick?.(row)}
              onKeyDown={(event) => {
                if (!onRowClick) return;
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onRowClick(row);
                }
              }}
              role={onRowClick ? 'button' : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              >
                {columns.map((column) => (
                  <td key={String(column.key)} className="data-table-cell">
                    {column.render ? column.render(row) : String((row as any)[column.key] ?? '-')}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
