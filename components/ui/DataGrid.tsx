import React from 'react';

export type DataGridStatus = 'APTO' | 'NO APTO' | 'CONDICIONAL' | 'INFO' | 'FUERA ALCANCE' | 'APTO CON OBSERVACIÓN' | 'APTO CON ADVERTENCIA';

export interface DataGridColumn<T> {
    id: string;
    header: string;
    render: (row: T) => React.ReactNode;
    width?: number | string;
    align?: 'left' | 'center' | 'right';
    ellipsis?: boolean;
    tooltip?: (row: T) => string | undefined;
    sticky?: boolean;
    stickyLeft?: number | string;
    stickyRight?: number | string;
}

interface DataGridProps<T> {
    columns: DataGridColumn<T>[];
    rows: T[];
    getRowId: (row: T) => string;
    emptyMessage?: string;
    selectedRowId?: string | null;
    onRowClick?: (row: T) => void;
    rowExpanded?: (row: T) => React.ReactNode;
    isRowExpanded?: (row: T) => boolean;
}

const STATUS_CLASS: Record<DataGridStatus, string> = {
    APTO: 'data-grid-badge-apto',
    'NO APTO': 'data-grid-badge-no-apto',
    CONDICIONAL: 'data-grid-badge-condicional',
    INFO: 'data-grid-badge-info',
    'FUERA ALCANCE': 'data-grid-badge-info',
    'APTO CON OBSERVACIÓN': 'data-grid-badge-condicional',
    'APTO CON ADVERTENCIA': 'data-grid-badge-condicional'
};

export const DataGridStatusBadge: React.FC<{ status: DataGridStatus }> = ({ status }) => {
    return <span className={`data-grid-badge ${STATUS_CLASS[status]}`}>{status}</span>;
};

export function DataGrid<T>({
    columns,
    rows,
    getRowId,
    emptyMessage = 'Sin datos para mostrar.',
    selectedRowId,
    onRowClick,
    rowExpanded,
    isRowExpanded
}: DataGridProps<T>) {
    return (
        <div className="data-grid-shell">
            <table className="data-grid-table">
                <thead>
                    <tr>
                        {columns.map(column => (
                            <th
                                key={column.id}
                                style={{
                                    width: column.width,
                                    position: column.sticky ? 'sticky' : undefined,
                                    left: (column.sticky && column.stickyLeft !== undefined && column.stickyLeft !== 'auto') ? column.stickyLeft : undefined,
                                    right: (column.sticky && column.stickyRight !== undefined) ? column.stickyRight : undefined,
                                    zIndex: column.sticky ? 3 : undefined,
                                    background: column.sticky ? 'var(--surface-elevated)' : undefined
                                }}
                                className={`data-grid-align-${column.align || 'left'} ${column.sticky ? 'is-sticky' : ''} ${column.stickyRight !== undefined ? 'is-sticky-right' : ''}`}
                            >
                                {column.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 && (
                        <tr>
                            <td className="data-grid-empty" colSpan={columns.length}>
                                {emptyMessage}
                            </td>
                        </tr>
                    )}
                    {rows.map(row => {
                        const rowId = getRowId(row);
                        const expanded = isRowExpanded ? isRowExpanded(row) : false;
                        return (
                            <React.Fragment key={rowId}>
                                <tr
                                    className={[
                                        selectedRowId === rowId ? 'is-selected' : '',
                                        onRowClick ? 'is-clickable' : ''
                                    ].filter(Boolean).join(' ')}
                                    onClick={() => onRowClick?.(row)}
                                >
                                    {columns.map(column => {
                                        const title = column.tooltip?.(row);
                                        return (
                                            <td
                                                key={`${rowId}-${column.id}`}
                                                className={[
                                                    `data-grid-align-${column.align || 'left'}`,
                                                    column.ellipsis ? 'data-grid-ellipsis' : '',
                                                    column.sticky ? 'is-sticky' : '',
                                                    (column.sticky && column.stickyLeft === 'auto') ? 'is-sticky-right' : ''
                                                ].join(' ')}
                                                style={{
                                                    position: column.sticky ? 'sticky' : undefined,
                                                    left: (column.sticky && column.stickyLeft !== undefined && column.stickyLeft !== 'auto') ? column.stickyLeft : undefined,
                                                    right: (column.sticky && column.stickyRight !== undefined) ? column.stickyRight : undefined,
                                                    zIndex: column.sticky ? 2 : undefined,
                                                    background: column.sticky ? 'var(--surface)' : undefined
                                                }}
                                                title={title}
                                            >
                                                {column.render(row)}
                                            </td>
                                        );
                                    })}
                                </tr>
                                {expanded && rowExpanded && (
                                    <tr className="is-expanded-row">
                                        <td colSpan={columns.length}>
                                            {rowExpanded(row)}
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
