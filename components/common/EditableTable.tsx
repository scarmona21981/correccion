import React, { ReactNode, useState, useCallback } from 'react';
import { Column, ColumnGroup } from './Table';

interface TableProps {
    variant?: 'results' | 'verification' | 'editable' | 'compact';
    density?: 'sm' | 'md' | 'lg';
    size?: 'sm' | 'md' | 'lg';
    stickyHeader?: boolean;
    zebra?: boolean;
    maxHeight?: number | string;
    scrollMode?: 'auto' | 'container' | 'fixed';
    title?: string;
    subtitle?: string;
    columns: Column<any>[];
    columnGroups?: ColumnGroup[];
    rows: any[];
    rowKey: (row: any) => string;
    emptyState?: ReactNode;
    selectedRowKey?: string | null;
    footer?: ReactNode;
    headerActions?: ReactNode;
    rowExpanded?: (row: any) => ReactNode;
    isRowExpanded?: (row: any) => boolean;
    rowClassName?: (row: any) => string;
    onRowClick?: (row: any) => void;
}

interface EditableRow {
    [key: string]: any;
    _isDirty?: boolean;
    _errors?: Record<string, string | null>;
}

interface EditableTableProps {
    variant?: 'results' | 'verification' | 'editable' | 'compact';
    density?: 'sm' | 'md' | 'lg';
    size?: 'sm' | 'md' | 'lg';
    stickyHeader?: boolean;
    zebra?: boolean;
    maxHeight?: number | string;
    scrollMode?: 'auto' | 'container' | 'fixed';
    title?: string;
    subtitle?: string;
    columns: Column<any>[];
    columnGroups?: ColumnGroup[];
    rows: EditableRow[];
    rowKey: (row: EditableRow) => string;
    emptyState?: ReactNode;
    selectedRowKey?: string | null;
    footer?: ReactNode;
    headerActions?: ReactNode;
    rowExpanded?: (row: EditableRow) => ReactNode;
    isRowExpanded?: (row: EditableRow) => boolean;
    rowClassName?: (row: EditableRow) => string;
    onRowClick?: (row: EditableRow) => void;
    onSave?: (row: EditableRow) => void;
    onCancel?: (row: EditableRow) => void;
    onDelete?: (row: EditableRow) => void;
    canEdit?: (row: EditableRow) => boolean;
    canDelete?: (row: EditableRow) => boolean;
    editMode?: 'click' | 'manual';
    validationFn?: (row: EditableRow) => Record<string, string | null>;
}

let TableComponent: React.FC<TableProps>;

try {
    TableComponent = require('./Table').default || require('./Table');
} catch (e) {
    TableComponent = () => {
        return React.createElement('div', { className: 'table-pro' }, 'Table not loaded');
    };
}

export function EditableTable({
    rows,
    rowKey,
    columns,
    columnGroups,
    onSave,
    onCancel,
    onDelete,
    canEdit,
    canDelete,
    editMode = 'click',
    validationFn,
    ...tableProps
}: EditableTableProps) {
    const [editingRowKey, setEditingRowKey] = useState<string | null>(null);
    const [editedRow, setEditedRow] = useState<EditableRow | null>(null);
    const [dirtyRows, setDirtyRows] = useState<Set<string>>(new Set());

    const isEditing = useCallback((key: string) => editingRowKey === key, [editingRowKey]);

    const startEdit = useCallback((row: EditableRow) => {
        if (canEdit && !canEdit(row)) return;
        
        const key = rowKey(row);
        setEditingRowKey(key);
        setEditedRow({ ...row });
    }, [canEdit, rowKey]);

    const cancelEdit = useCallback((row: EditableRow) => {
        const key = rowKey(row);
        setEditingRowKey(null);
        setEditedRow(null);
        onCancel?.(row);
    }, [rowKey, onCancel]);

    const saveEdit = useCallback((row: EditableRow) => {
        if (!editedRow) return;

        const key = rowKey(row);
        
        if (validationFn) {
            const errors = validationFn(editedRow);
            if (Object.values(errors).some(e => e !== null)) {
                setEditedRow(prev => prev ? { ...prev, _errors: errors } : null);
                return;
            }
        }

        onSave?.(editedRow);
        setDirtyRows(prev => {
            const next = new Set(prev);
            next.delete(key);
            return next;
        });
        setEditingRowKey(null);
        setEditedRow(null);
    }, [editedRow, onSave, rowKey, validationFn]);

    const handleCellChange = useCallback((col: Column<any>, value: any, currentRow: EditableRow) => {
        if (!editedRow) return;

        const newRow: EditableRow = { ...editedRow, [col.key]: value, _isDirty: true };
        
        if (validationFn && col.editProps?.validate) {
            const error = col.editProps.validate(value, newRow);
            newRow._errors = { ...(newRow._errors || {}), [col.key]: error };
        }

        setEditedRow(newRow);
        
        const key = rowKey(currentRow);
        setDirtyRows(prev => new Set(prev).add(key));
    }, [editedRow, validationFn, rowKey]);

    const renderEditableCell = (col: Column<any>, row: EditableRow, value: any) => {
        const key = rowKey(row);
        const isEditingThisRow = isEditing(key);
        const displayValue = isEditingThisRow && editedRow ? editedRow[col.key] : value;
        const error = (editedRow as EditableRow)?._errors?.[col.key];

        if (!isEditingThisRow) {
            return col.format ? col.format(value, row) : (value ?? '—');
        }

        const colType = col.type as string || '';
        if ((colType === 'select' || col.editProps?.type === 'select') && col.editProps?.options) {
            return React.createElement('select', {
                value: displayValue ?? '',
                onChange: (e: React.ChangeEvent<HTMLSelectElement>) => handleCellChange(col, e.target.value, row),
                className: `table-pro__input ${error ? 'table-pro__input--error' : ''}`
            },
                React.createElement('option', { value: '' }, 'Seleccionar...'),
                ...col.editProps.options.map(opt => 
                    React.createElement('option', { key: opt.value, value: opt.value }, opt.label)
                )
            );
        }

        const inputType = col.editProps?.type || (col.isNumeric ? 'number' : 'text');

        return React.createElement('input', {
            type: inputType,
            value: displayValue ?? '',
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                const val = inputType === 'number' ? parseFloat(e.target.value) || 0 : e.target.value;
                handleCellChange(col, val, row);
            },
            className: `table-pro__input ${error ? 'table-pro__input--error' : ''}`,
            autoFocus: col.key === columns[0]?.key
        });
    };

    const renderActionsColumn = (row: EditableRow) => {
        const key = rowKey(row);
        const isEditingThisRow = isEditing(key);
        const canEditRow = canEdit ? canEdit(row) : true;
        const canDeleteRow = canDelete ? canDelete(row) : true;

        if (isEditingThisRow) {
            return React.createElement('div', { className: 'table-pro__actions-cell' },
                React.createElement('button', {
                    key: 'save',
                    className: 'table-pro__btn table-pro__btn--save',
                    onClick: (e: React.MouseEvent) => { e.stopPropagation(); saveEdit(row); },
                    title: 'Guardar'
                }, '✓'),
                React.createElement('button', {
                    key: 'cancel',
                    className: 'table-pro__btn table-pro__btn--cancel',
                    onClick: (e: React.MouseEvent) => { e.stopPropagation(); cancelEdit(row); },
                    title: 'Cancelar'
                }, '✕')
            );
        }

        return React.createElement('div', { className: 'table-pro__actions-cell' },
            canEditRow && React.createElement('button', {
                key: 'edit',
                className: 'table-pro__btn table-pro__btn--edit',
                onClick: (e: React.MouseEvent) => { e.stopPropagation(); startEdit(row); },
                title: 'Editar'
            }, '✎'),
            canDeleteRow && onDelete && React.createElement('button', {
                key: 'delete',
                className: 'table-pro__btn table-pro__btn--delete',
                onClick: (e: React.MouseEvent) => { e.stopPropagation(); onDelete(row); },
                title: 'Eliminar'
            }, '🗑')
        );
    };

    const columnsWithActions: Column<any>[] = [
        ...columns,
        {
            key: '_actions',
            header: 'Acciones',
            width: 100,
            align: 'center',
            type: 'actions'
        }
    ];

    const enhancedColumns = columnsWithActions.map(col => {
        if (col.key === '_actions') {
            return {
                ...col,
                format: (_: any, row: EditableRow) => renderActionsColumn(row)
            };
        }
        if (col.editable) {
            return {
                ...col,
                format: (value: any, row: EditableRow) => renderEditableCell(col, row, value)
            };
        }
        return col;
    });

    const handleRowClick = editMode === 'click' 
        ? (row: any) => startEdit(row)
        : tableProps.onRowClick;

    return React.createElement(TableComponent, {
        ...tableProps,
        columns: enhancedColumns,
        columnGroups,
        rows,
        rowKey,
        onRowClick: handleRowClick,
        variant: 'editable'
    });
}

export default EditableTable;