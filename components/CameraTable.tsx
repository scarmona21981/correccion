import React from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { useView } from '../context/ViewContext';
import { DataTable, DataTableColumn } from './common/DataTable';
import { FixtureSummaryCard } from './chambers/FixtureSummaryCard';
import { buildDatedExcelFileName, exportSingleSheetToExcel } from '../utils/excelExport';

interface CameraRow {
    id: string;
    chamberId: string;
    ct: number;
    h: number;
    cre: number;
    crs: number;
    qin: number;
    uehP: number;
    uehA: number;
    pLocal: number | null;
    pAcum: number | undefined;
    type: string;
    dimension: string;
}

const fmt = (value: number | undefined | null, decimals = 2) => {
    if (value === undefined || value === null || !Number.isFinite(value)) return '—';
    return value.toFixed(decimals);
};

export const CameraTable: React.FC = () => {
    const { chambers, settings } = useProject();
    const { setSelectedIds, setEditingObjectId } = useView();

    const isPublico = settings.projectType === 'Público';

    const rows: CameraRow[] = chambers.map(chamber => ({
        id: chamber.userDefinedId || chamber.id,
        chamberId: chamber.id,
        ct: Number(chamber.CT.value),
        h: Number(chamber.H.value),
        cre: Number(chamber.Cre.value),
        crs: Number(chamber.CRS.value),
        qin: Number(chamber.Qin.value),
        uehP: Number(chamber.uehPropias.value),
        uehA: Number(chamber.uehAcumuladas.value),
        pLocal: chamber.populationLocal != null ? Number(chamber.populationLocal) : null,
        pAcum: chamber.P_acum,
        type: chamber.chamberType,
        dimension: chamber.chamberDimension || '—'
    }));

    // Columnas base
    const baseColumns: DataTableColumn<CameraRow>[] = [
        { key: 'id', header: 'ID', width: 92 },
        { key: 'ct', header: 'CT (m)', width: 90, align: 'right', format: (v) => fmt(v as number), exportValue: (r) => fmt(r.ct) },
        { key: 'h', header: 'Prof. (m)', width: 90, align: 'right', format: (v) => fmt(v as number), exportValue: (r) => fmt(r.h) },
        { key: 'cre', header: 'Cre (m)', width: 90, align: 'right', format: (v) => fmt(v as number), exportValue: (r) => fmt(r.cre) },
        { key: 'crs', header: 'CRS (m)', width: 90, align: 'right', format: (v) => fmt(v as number), exportValue: (r) => fmt(r.crs) },
    ];

    // Columnas condicionales por tipo de proyecto
    const projectColumns: DataTableColumn<CameraRow>[] = isPublico
        ? [
            {
                key: 'pLocal',
                header: 'P_local (hab)',
                width: 110,
                align: 'right',
                format: (v) => v != null ? String(Math.round(Number(v))) : '—',
                exportValue: (r) => r.pLocal != null ? String(Math.round(Number(r.pLocal))) : '—'
            },
            {
                key: 'pAcum',
                header: 'P_acum (hab)',
                width: 110,
                align: 'right',
                format: (v) => v != null ? String(Math.round(Number(v))) : '—',
                exportValue: (r) => r.pAcum != null ? String(Math.round(Number(r.pAcum))) : '—'
            },
        ]
        : [
            { key: 'qin', header: 'Qin (m3/s)', width: 110, align: 'right', format: (v) => fmt(v as number, 4), exportValue: (r) => fmt(r.qin, 4) },
            { key: 'uehP', header: 'UEH P.', width: 80, align: 'right', format: (v) => fmt(v as number, 1), exportValue: (r) => fmt(r.uehP, 1) },
            { key: 'uehA', header: 'UEH A.', width: 80, align: 'right', format: (v) => fmt(v as number, 1), exportValue: (r) => fmt(r.uehA, 1) },
        ];

    const tailColumns: DataTableColumn<CameraRow>[] = [
        { key: 'type', header: 'Tipo', width: 100 },
        { key: 'dimension', header: 'Dimensiones', width: 120 }
    ];

    const columns = [...baseColumns, ...projectColumns, ...tailColumns];

    const handleExportExcel = React.useCallback(() => {
        if (rows.length === 0) return;

        exportSingleSheetToExcel({
            fileName: buildDatedExcelFileName('camaras_resumen'),
            sheetName: 'Cámaras',
            title: 'Resumen de Cámaras',
            subtitle: isPublico
                ? 'Proyecto Público - columnas de población'
                : 'Proyecto no Público - columnas de caudal y UEH',
            columns,
            rows
        });
    }, [columns, isPublico, rows]);

    return (
        <div style={{ padding: '4px' }}>
            <DataTable
                title="Resumen de Cámaras"
                columns={columns}
                rows={rows}
                rowKey={(row) => row.chamberId}
                density="compact"
                maxHeight="400px"
                onRowClick={(row) => {
                    setSelectedIds(new Set([row.chamberId]));
                    setEditingObjectId({ id: row.chamberId, type: 'chamber' });
                }}
                emptyState="No hay cámaras en el proyecto."
                headerActions={
                    <button
                        onClick={handleExportExcel}
                        disabled={rows.length === 0}
                        title="Exportar Excel"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            border: '1px solid rgba(16, 185, 129, 0.35)',
                            background: rows.length === 0 ? 'rgba(100, 116, 139, 0.08)' : 'rgba(16, 185, 129, 0.12)',
                            color: rows.length === 0 ? '#64748b' : '#059669',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            padding: '6px 10px',
                            cursor: rows.length === 0 ? 'not-allowed' : 'pointer',
                            opacity: rows.length === 0 ? 0.5 : 1
                        }}
                    >
                        <FileSpreadsheet size={14} />
                        <span>Exportar Excel</span>
                    </button>
                }
            />

            <FixtureSummaryCard />
        </div>
    );
};
