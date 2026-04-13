import React, { ReactNode, useState, useCallback } from 'react';

export type CellStatus = 'default' | 'success' | 'warning' | 'error' | 'info';
export type ColumnType = 'text' | 'number' | 'status' | 'input' | 'actions';
export type TableVariant = 'results' | 'verification' | 'editable' | 'compact';
export type TableDensity = 'sm' | 'md' | 'lg';
export type TableSize = 'sm' | 'md' | 'lg';
export type ScrollMode = 'auto' | 'container' | 'fixed';

export interface Column<T = any> {
    key: string;
    header: string;
    width?: number | string;
    minWidth?: number | string;
    maxWidth?: number | string;
    align?: 'left' | 'center' | 'right';
    type?: ColumnType;
    format?: (value: any, row: T) => ReactNode;
    exportValue?: (row: T) => string | number | boolean | null | undefined;
    className?: string;
    tooltip?: (row: T) => string;
    isNumeric?: boolean;
    showUnit?: boolean;
    unit?: string;
    group?: string;
    status?: (value: any, row: T) => CellStatus;
    sticky?: 'left' | 'right';
    editable?: boolean;
    editProps?: {
        type?: 'text' | 'number' | 'select';
        options?: { value: string; label: string }[];
        validate?: (value: any, row: T) => string | null;
    };
    onEdit?: (value: any, row: T, key: string) => void;
}

export interface ColumnGroup {
    label: string;
    colspan: number;
    align?: 'left' | 'center' | 'right';
}

export interface TableProps<T = any> {
    variant?: TableVariant;
    density?: TableDensity;
    size?: TableSize;
    stickyHeader?: boolean;
    zebra?: boolean;
    maxHeight?: number | string;
    scrollMode?: ScrollMode;
    title?: string;
    subtitle?: string;
    columns: Column<T>[];
    columnGroups?: ColumnGroup[];
    rows: T[];
    rowKey: (row: T) => string;
    emptyState?: ReactNode;
    onRowClick?: (row: T) => void;
    selectedRowKey?: string | null;
    footer?: ReactNode;
    headerActions?: ReactNode;
    rowExpanded?: (row: T) => ReactNode;
    isRowExpanded?: (row: T) => boolean;
    rowClassName?: (row: T) => string;
    onSelectionChange?: (selectedKeys: string[]) => void;
    selectable?: boolean;
    selectableKey?: string;
}

const toCssSize = (value: number | string | undefined): string | undefined => {
    if (value === undefined || value === null) return undefined;
    return typeof value === 'number' ? `${value}px` : value;
};

const splitHeaderLabelAndUnit = (header: string): { label: string; unit?: string } => {
    const normalized = String(header || '').trim();
    const match = normalized.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (!match) return { label: normalized };

    const label = match[1].trim();
    const unitCandidate = match[2].trim();
    const isOnlyNumericToken = /^[0-9.\s]+$/.test(unitCandidate);
    const hasEngineeringUnitSignal = /[A-Za-z/%‰°≤≥\-]/.test(unitCandidate);

    if (!label || !unitCandidate || isOnlyNumericToken || !hasEngineeringUnitSignal) {
        return { label: normalized };
    }
    return { label, unit: unitCandidate };
};

export const isNumericColumn = <T,>(col: Column<T>): boolean => {
    return col.isNumeric === true || col.align === 'right' || col.type === 'number';
};

export const getColumnAlignment = <T,>(col: Column<T>): 'left' | 'right' | 'center' => {
    if (col.align) return col.align;
    if (isNumericColumn(col)) return 'right';
    return 'left';
};

const calculateStickyOffsets = <T,>(columns: Column<T>[]) => {
    let leftOffset = 0;
    const leftOffsets: number[] = [];
    const rightOffsets: number[] = [];

    for (let i = 0; i < columns.length; i++) {
        const col = columns[i];
        const colWidth = typeof col.width === 'number' ? col.width : 80;

        if (col.sticky === 'left') {
            leftOffsets.push(leftOffset);
            leftOffset += colWidth;
        } else {
            leftOffsets.push(0);
        }
        rightOffsets.push(0);
    }

    return { leftOffsets, rightOffsets };
};

const DENSITY_MAP = {
    sm: { th: '4px 8px', td: '4px 8px', fontTh: '9px', fontTd: '11px' },
    md: { th: '8px 12px', td: '8px 12px', fontTh: '10px', fontTd: '12px' },
    lg: { th: '12px 16px', td: '12px 16px', fontTh: '11px', fontTd: '13px' }
};

const VARIANT_MAP = {
    results: {
        rowHeight: '44px',
        headerWeight: '600',
        cellWeight: '400',
        zebraOpacity: '0.4',
        hoverBg: 'var(--accent-soft)'
    },
    verification: {
        rowHeight: '40px',
        headerWeight: '600',
        cellWeight: '400',
        zebraOpacity: '0.3',
        hoverBg: 'var(--success-soft)'
    },
    editable: {
        rowHeight: '42px',
        headerWeight: '600',
        cellWeight: '400',
        zebraOpacity: '0.25',
        hoverBg: 'var(--info-soft)'
    },
    compact: {
        rowHeight: '32px',
        headerWeight: '500',
        cellWeight: '400',
        zebraOpacity: '0.2',
        hoverBg: 'var(--hover-bg)'
    }
};

export function Table<T extends Record<string, any>>({
    variant = 'results',
    density = 'md',
    size = 'md',
    stickyHeader = true,
    zebra = true,
    maxHeight,
    scrollMode = 'auto',
    title,
    subtitle,
    columns,
    columnGroups,
    rows,
    rowKey,
    emptyState = 'No hay datos disponibles',
    onRowClick,
    selectedRowKey,
    footer,
    headerActions,
    rowExpanded,
    isRowExpanded,
    rowClassName
}: TableProps<T>) {
    const tableMinWidth = columns.reduce<number | null>((acc, col) => {
        if (acc === null) return null;
        if (typeof col.width === 'number') return acc + col.width;
        return null;
    }, 0);

    const { leftOffsets } = calculateStickyOffsets(columns);
    const densityStyles = DENSITY_MAP[density];
    const variantStyles = VARIANT_MAP[variant];

    const tableClasses = [
        'table-pro',
        `table-pro--variant-${variant}`,
        `table-pro--density-${density}`,
        zebra ? 'table-pro--zebra' : '',
        stickyHeader ? 'table-pro--sticky-header' : ''
    ].filter(Boolean).join(' ');

    const scrollContainerStyle: React.CSSProperties = {
        maxHeight: maxHeight !== undefined ? toCssSize(maxHeight) : undefined,
        overflow: scrollMode === 'fixed' ? 'auto' : undefined
    };

    return (
        <div className="table-pro__container">
            {(title || subtitle || headerActions) && (
                <div className="table-pro__header">
                    <div className="table-pro__header-content">
                        {title && <h3 className="table-pro__title">{title}</h3>}
                        {subtitle && <span className="table-pro__subtitle">{subtitle}</span>}
                    </div>
                    {headerActions && <div className="table-pro__actions">{headerActions}</div>}
                </div>
            )}

            <div className="table-pro__scroll" style={scrollContainerStyle}>
                <table
                    className={tableClasses}
                    style={tableMinWidth !== null ? { minWidth: `${tableMinWidth}px` } : undefined}
                >
                    <colgroup>
                        {columns.map((col) => (
                            <col
                                key={col.key}
                                style={{
                                    width: toCssSize(col.width),
                                    minWidth: toCssSize(col.minWidth),
                                    maxWidth: toCssSize(col.maxWidth)
                                }}
                            />
                        ))}
                    </colgroup>
                    <thead className={stickyHeader ? 'table-pro__thead--sticky' : ''}>
                        {columnGroups && columnGroups.length > 0 && (
                            <tr className="table-pro__group-row">
                                {columnGroups.map((group, groupIdx) => {
                                    const groupColumns = columns.filter(col => col.group === group.label);
                                    return (
                                        <th
                                            key={`group-${groupIdx}`}
                                            colSpan={group.colspan}
                                            className="table-pro__group-header"
                                            style={{ textAlign: group.align || 'left' }}
                                        >
                                            {group.label}
                                        </th>
                                    );
                                })}
                            </tr>
                        )}
                        <tr>
                            {columns.map((col, colIdx) => {
                                const isStickyLeft = col.key === columns[0]?.key;
                                const isNumericCol = isNumericColumn(col);
                                const alignment = getColumnAlignment(col);
                                const headerParts = splitHeaderLabelAndUnit(col.header);
                                const hasUnit = col.showUnit && col.unit;

                                const style: React.CSSProperties = {
                                    textAlign: alignment,
                                    padding: densityStyles.th,
                                    fontSize: densityStyles.fontTh
                                };

                                if (col.width !== undefined) {
                                    style.width = toCssSize(col.width);
                                    style.minWidth = toCssSize(col.minWidth);
                                    style.maxWidth = toCssSize(col.maxWidth);
                                }

                                if (isStickyLeft) {
                                    style.position = 'sticky';
                                    style.left = 0;
                                    style.zIndex = 30;
                                }

                                const cellClasses = [
                                    isStickyLeft ? 'table-pro__sticky-left' : '',
                                    isNumericCol ? 'table-pro__cell--numeric' : '',
                                    alignment === 'center' ? 'table-pro__cell--center' : '',
                                    alignment === 'right' ? 'table-pro__cell--right' : '',
                                    hasUnit ? 'table-pro__cell--has-unit' : '',
                                    col.className || ''
                                ].filter(Boolean).join(' ');

                                return (
                                    <th key={col.key} className={cellClasses} style={style}>
                                        {hasUnit ? (
                                            <div className="table-pro__header-unit">
                                                <span>{col.header}</span>
                                                <span className="table-pro__unit-label">({col.unit})</span>
                                            </div>
                                        ) : (
                                            <>
                                                <span>{headerParts.label}</span>
                                                {headerParts.unit && (
                                                    <span className="table-pro__unit-label">({headerParts.unit})</span>
                                                )}
                                            </>
                                        )}
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length} className="table-pro__empty">
                                    {emptyState}
                                </td>
                            </tr>
                        ) : (
                            rows.map((row) => {
                                const id = rowKey(row);
                                const isSelected = selectedRowKey === id;
                                const expanded = isRowExpanded ? isRowExpanded(row) : false;

                                return (
                                    <React.Fragment key={id}>
                                        <tr
                                            className={[
                                                isSelected ? 'table-pro__row--selected' : '',
                                                rowClassName ? rowClassName(row) : ''
                                            ].filter(Boolean).join(' ')}
                                            onClick={() => onRowClick?.(row)}
                                            style={{ cursor: onRowClick ? 'pointer' : 'default' }}
                                        >
                                            {columns.map((col, colIdx) => {
                                                const value = row[col.key];
                                                const content = col.format ? col.format(value, row) : (value ?? '—');
                                                const tooltip = col.tooltip?.(row);

                                                const isStickyLeft = col.key === columns[0]?.key;
                                                const isNumericCol = isNumericColumn(col);
                                                const alignment = getColumnAlignment(col);
                                                const status = col.status?.(value, row);

                                                const style: React.CSSProperties = {
                                                    textAlign: alignment,
                                                    padding: densityStyles.td,
                                                    fontSize: densityStyles.fontTd
                                                };

                                                if (isStickyLeft) {
                                                    style.position = 'sticky';
                                                    style.left = 0;
                                                    style.zIndex = 10;
                                                }

                                                const cellClasses = [
                                                    isStickyLeft ? 'table-pro__sticky-left' : '',
                                                    isNumericCol ? 'table-pro__cell--numeric' : '',
                                                    alignment === 'center' ? 'table-pro__cell--center' : '',
                                                    alignment === 'right' ? 'table-pro__cell--right' : '',
                                                    status ? `table-pro__cell--status-${status}` : '',
                                                    col.className || ''
                                                ].filter(Boolean).join(' ');

                                                return (
                                                    <td
                                                        key={col.key}
                                                        className={cellClasses}
                                                        style={style}
                                                        title={tooltip}
                                                    >
                                                        {content}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                        {expanded && rowExpanded && (
                                            <tr className="table-pro__row--expanded">
                                                <td colSpan={columns.length}>
                                                    {rowExpanded(row)}
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
            {footer && <div className="table-pro__footer">{footer}</div>}
        </div>
    );
}

export default Table;