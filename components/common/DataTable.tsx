import React, { ReactNode } from 'react';
import Table from './Table';

export type CellStatus = 'default' | 'success' | 'warning' | 'error' | 'info';

export interface DataTableColumn<T = any> {
    key: string;
    header: string;
    headerLabel?: string;
    headerUnit?: string;
    align?: 'left' | 'center' | 'right';
    width?: number | string;
    minWidth?: number | string;
    maxWidth?: number | string;
    sticky?: 'left' | 'right';
    type?: 'text' | 'number' | 'status' | 'input' | 'actions';
    format?: (value: any, row: T) => ReactNode;
    exportValue?: (row: T) => string | number | boolean | null | undefined;
    className?: string;
    tooltip?: (row: T) => string;
    isNumeric?: boolean;
    showUnit?: boolean;
    unit?: string;
    group?: string;
    status?: (value: any, row: T) => CellStatus;
    editable?: boolean;
    editProps?: {
        type?: 'text' | 'number' | 'select';
        options?: { value: string; label: string }[];
        validate?: (value: any, row: T) => string | null;
    };
    onEdit?: (value: any, row: T, key: string) => void;
}

export interface DataTableColumnGroup {
    label: string;
    colspan: number;
    align?: 'left' | 'center' | 'right';
}

interface DataTableProps<T = any> {
    title?: string;
    subtitle?: string;
    columns: DataTableColumn<T>[];
    columnGroups?: DataTableColumnGroup[];
    rows: T[];
    rowKey: (row: T) => string;
    density?: 'compact' | 'normal' | 'comfortable';
    variant?: 'default' | 'clean' | 'professional';
    emptyState?: ReactNode;
    onRowClick?: (row: T) => void;
    selectedRowKey?: string | null;
    footer?: ReactNode;
    wrap?: boolean;
    maxHeight?: string | number;
    headerActions?: ReactNode;
    rowExpanded?: (row: T) => ReactNode;
    isRowExpanded?: (row: T) => boolean;
    rowClassName?: (row: T) => string;
    enableZebra?: boolean;
    enableHover?: boolean;
    stickyHeader?: boolean;
}

const densityMap: Record<string, 'sm' | 'md' | 'lg'> = {
    compact: 'sm',
    normal: 'md',
    comfortable: 'lg'
};

const variantMap: Record<string, 'results' | 'verification' | 'compact' | 'editable'> = {
    default: 'results',
    clean: 'verification',
    professional: 'results'
};

export function DataTable<T extends Record<string, any>>({
    title,
    subtitle,
    columns,
    columnGroups,
    rows,
    rowKey,
    density = 'normal',
    variant = 'professional',
    emptyState = 'No hay datos disponibles',
    onRowClick,
    selectedRowKey,
    footer,
    maxHeight,
    headerActions,
    rowExpanded,
    isRowExpanded,
    rowClassName,
    enableZebra = true,
    enableHover = true,
    stickyHeader = true
}: DataTableProps<T>) {
    const mappedDensity = densityMap[density] || 'md';
    const mappedVariant = variantMap[variant] || 'results';

    return (
        <Table
            variant={mappedVariant}
            density={mappedDensity}
            stickyHeader={stickyHeader}
            zebra={enableZebra}
            maxHeight={maxHeight}
            title={title}
            subtitle={subtitle}
            columns={columns}
            columnGroups={columnGroups}
            rows={rows}
            rowKey={rowKey}
            emptyState={emptyState}
            onRowClick={onRowClick}
            selectedRowKey={selectedRowKey}
            footer={footer}
            headerActions={headerActions}
            rowExpanded={rowExpanded}
            isRowExpanded={isRowExpanded}
            rowClassName={rowClassName}
        />
    );
}

export default DataTable;