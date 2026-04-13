import * as XLSX from 'xlsx';
import type { DataTableColumn } from '../components/common/DataTable';

export type ExcelCellValue = string | number | null;

interface ExportTableOptions<T> {
    columns: DataTableColumn<T>[];
    rows: T[];
    includeColumn?: (column: DataTableColumn<T>) => boolean;
    emptyValue?: string;
}

interface ExportSheetConfig<T> extends ExportTableOptions<T> {
    sheetName: string;
    title: string;
    subtitle?: string;
}

interface ExportMultiSheetConfig {
    fileName: string;
    sheets: ExportSheetConfig<any>[];
}

const DEFAULT_EMPTY_VALUE = '—';
const HEADER_ROW_INDEX = 3;
const MIN_COLUMN_WIDTH = 10;
const MAX_COLUMN_WIDTH = 60;
const INVALID_SHEET_NAME_CHARS = /[:\\/?*\[\]]/g;

const normalizeHeader = (header: string, fallback: string) => {
    const value = String(header || '').replace(/\s+/g, ' ').trim();
    return value || fallback;
};

const sanitizeExcelValue = (value: unknown): unknown => {
    if (value === null || value === undefined) return null;

    if (Array.isArray(value)) {
        return value.map((entry) => sanitizeExcelValue(entry));
    }

    if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        if ('value' in record) return sanitizeExcelValue(record.value);
        if ('val' in record) return sanitizeExcelValue(record.val);
        if ('result' in record) return sanitizeExcelValue(record.result);

        try {
            return JSON.stringify(record);
        } catch {
            return String(record);
        }
    }

    return value;
};

const toExcelCellValue = (value: unknown, emptyValue: string): ExcelCellValue => {
    const sanitized = sanitizeExcelValue(value);
    if (sanitized === null || sanitized === undefined) return emptyValue;

    if (typeof sanitized === 'number') {
        return Number.isFinite(sanitized) ? sanitized : emptyValue;
    }

    if (typeof sanitized === 'boolean') {
        return sanitized ? 'SI' : 'NO';
    }

    if (sanitized instanceof Date) {
        return sanitized.toISOString();
    }

    if (Array.isArray(sanitized)) {
        const text = sanitized
            .map((entry) => (entry === null || entry === undefined ? '' : String(entry).trim()))
            .filter(Boolean)
            .join(', ');
        return text || emptyValue;
    }

    const text = String(sanitized).trim();
    return text || emptyValue;
};

const readColumnValue = <T,>(column: DataTableColumn<T>, row: T): unknown => {
    if (column.exportValue) {
        return column.exportValue(row);
    }
    return (row as Record<string, unknown>)[column.key];
};

const getExportColumns = <T,>(
    columns: DataTableColumn<T>[],
    includeColumn?: (column: DataTableColumn<T>) => boolean
) => {
    const include = includeColumn ?? ((column: DataTableColumn<T>) => String(column.header || '').trim().length > 0);
    return columns.filter(include);
};

const getColumnWidths = (headers: string[], dataRows: ExcelCellValue[][]) => {
    return headers.map((header, columnIndex) => {
        const maxDataLength = dataRows.reduce((maxLen, row) => {
            const cell = row[columnIndex];
            const len = cell === undefined || cell === null ? 0 : String(cell).length;
            return Math.max(maxLen, len);
        }, 0);

        const width = Math.max(header.length, maxDataLength) + 2;
        return { wch: Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, width)) };
    });
};

const sanitizeSheetName = (sheetName: string) => {
    const cleaned = sheetName.replace(INVALID_SHEET_NAME_CHARS, ' ').replace(/\s+/g, ' ').trim();
    const normalized = cleaned || 'Hoja';
    return normalized.slice(0, 31);
};

const ensureUniqueSheetName = (sheetName: string, usedNames: Set<string>) => {
    const baseName = sanitizeSheetName(sheetName);
    if (!usedNames.has(baseName)) {
        usedNames.add(baseName);
        return baseName;
    }

    let idx = 2;
    while (true) {
        const suffix = ` (${idx})`;
        const maxBaseLength = 31 - suffix.length;
        const candidate = `${baseName.slice(0, Math.max(1, maxBaseLength))}${suffix}`;
        if (!usedNames.has(candidate)) {
            usedNames.add(candidate);
            return candidate;
        }
        idx += 1;
    }
};

const buildSheet = <T,>(config: ExportSheetConfig<T>): XLSX.WorkSheet => {
    const emptyValue = config.emptyValue ?? DEFAULT_EMPTY_VALUE;
    const exportColumns = getExportColumns(config.columns, config.includeColumn);
    const headers = exportColumns.map((column, idx) => normalizeHeader(column.header, `Columna ${idx + 1}`));
    const dataRows = config.rows.map((row) =>
        exportColumns.map((column) => toExcelCellValue(readColumnValue(column, row), emptyValue))
    );

    const aoa: ExcelCellValue[][] = [
        [config.title],
        [config.subtitle ?? ''],
        [''],
        headers,
        ...dataRows
    ];

    const sheet = XLSX.utils.aoa_to_sheet(aoa);

    if (headers.length > 0) {
        const lastCol = headers.length - 1;
        sheet['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } }
        ];
        sheet['!cols'] = getColumnWidths(headers, dataRows);
        (sheet as XLSX.WorkSheet & { '!freeze'?: unknown })['!freeze'] = {
            xSplit: 0,
            ySplit: HEADER_ROW_INDEX + 1,
            topLeftCell: `A${HEADER_ROW_INDEX + 2}`,
            activePane: 'bottomLeft',
            state: 'frozen'
        };
    }

    return sheet;
};

export const columnsAndRowsToExportRecords = <T,>(
    options: ExportTableOptions<T>
): Array<Record<string, ExcelCellValue>> => {
    const emptyValue = options.emptyValue ?? DEFAULT_EMPTY_VALUE;
    const exportColumns = getExportColumns(options.columns, options.includeColumn);
    const headers = exportColumns.map((column, idx) => normalizeHeader(column.header, `Columna ${idx + 1}`));

    return options.rows.map((row) => {
        const outputRow: Record<string, ExcelCellValue> = {};
        exportColumns.forEach((column, idx) => {
            outputRow[headers[idx]] = toExcelCellValue(readColumnValue(column, row), emptyValue);
        });
        return outputRow;
    });
};

export const exportSingleSheetToExcel = <T,>(
    config: ExportSheetConfig<T> & { fileName: string }
) => {
    exportMultiSheetToExcel({
        fileName: config.fileName,
        sheets: [config]
    });
};

export const exportMultiSheetToExcel = (config: ExportMultiSheetConfig) => {
    const workbook = XLSX.utils.book_new();
    const usedNames = new Set<string>();

    config.sheets.forEach((sheetConfig) => {
        const sheet = buildSheet(sheetConfig);
        const uniqueName = ensureUniqueSheetName(sheetConfig.sheetName, usedNames);
        XLSX.utils.book_append_sheet(workbook, sheet, uniqueName);
    });

    XLSX.writeFile(workbook, config.fileName);
};

export const getISODateForFileName = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const buildDatedExcelFileName = (prefix: string, date = new Date()) => {
    return `${prefix}_${getISODateForFileName(date)}.xlsx`;
};
