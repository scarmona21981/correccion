import React from 'react';
import { Pipe, ProjectSettings, Chamber, useProject } from '../context/ProjectContext';
import { PipeVerificationResult } from '../hydraulics/types';
import { getEffectivePipe } from '../utils/getEffectivePipe';
import { useView } from '../context/ViewContext';
import { DataTable } from './common/DataTable';
import { StatusBadge, StatusType } from './common/StatusBadge';
import { resolveHydraulicDiMm } from '../utils/diameterMapper';

interface Results {
    flows: Record<string, number>;
    velocities: Record<string, number>;
    verifications?: Record<string, PipeVerificationResult>;
}

interface ResultsViewProps {
    results: Results;
    pipes: Pipe[];
    settings: ProjectSettings;
    onClose?: () => void;
}

type SortKey = 'status' | 'q' | 'dn' | 'slope';

interface RowModel {
    id: string;
    pipeId: string;
    role: string;
    status: StatusType;
    statusLabel: string;
    qLs?: number;
    dn: number;
    dint: number;
    slope: number;
    norm: string;
    obs: string;
}

const compliantStatuses = new Set(['APTO_UEH', 'APTO_HIDRAULICO', 'APTO_UEH_MANNING', 'CONFORME_NCH1105']);

const statusOrder: Record<StatusType, number> = {
    'NO APTO': 0,
    NO_APTO: 0,
    INCOMPLETO: 0,
    "SIN CAUDAL": 0,
    CONDICIONAL: 1,
    'APTO CON OBSERVACIÓN': 2,
    'APTO CON ADVERTENCIA': 2,
    INFO: 3,
    APTO: 4,
    'FUERA ALCANCE': 5,
    REVISAR: 0
};

const toStatus = (verification?: PipeVerificationResult): { status: StatusType; label: string } => {
    if (!verification) return { status: 'INFO', label: 'NO_EVALUADO' };
    if (verification.status === 'NO_CONFORME') return { status: 'NO APTO', label: verification.status };
    if (compliantStatuses.has(verification.status)) return { status: 'APTO', label: verification.status };
    return { status: 'CONDICIONAL', label: verification.status };
};

export const ResultsView: React.FC<ResultsViewProps> = ({ results, pipes }) => {
    const { selectedIds, setSelectedIds, setEditingObjectId } = useView();
    const { chambers } = useProject();
    const [statusFilter, setStatusFilter] = React.useState<'ALL' | StatusType>('ALL');
    const [searchId, setSearchId] = React.useState('');
    const [sortBy, setSortBy] = React.useState<SortKey>('status');

    const rows = React.useMemo<RowModel[]>(() => {
        return pipes.map(pipe => {
            const verification = results.verifications?.[pipe.id];
            const qDesignFromPipe = pipe.hydraulics?.Q_design_Lps;
            const flowLs = qDesignFromPipe !== undefined
                ? qDesignFromPipe
                : (results.flows?.[pipe.id] !== undefined ? results.flows[pipe.id] * 1000 : undefined);
            const slope = (pipe.isSlopeManual && pipe.manualSlope) ? Number(pipe.manualSlope.value) : Number(pipe.slope.value);
            const role = getEffectivePipe(pipe).role.replace(/_/g, ' ');
            const statusMeta = toStatus(verification);

            // Obtener nombres de cámaras inicial y final
            const startChamber = chambers.find(c => c.id === pipe.startNodeId);
            const endChamber = chambers.find(c => c.id === pipe.endNodeId);

            return {
                id: pipe.userDefinedId || pipe.id,
                pipeId: pipe.id,
                desde: startChamber?.userDefinedId || startChamber?.id || '—',
                hasta: endChamber?.userDefinedId || endChamber?.id || '—',
                role,
                status: statusMeta.status,
                statusLabel: statusMeta.label,
                qLs: flowLs,
                dn: Number(pipe.diameter.value),
                dint: resolveHydraulicDiMm(pipe, Number(pipe.diameter.value)),
                slope,
                norm: verification?.normativeReference || '—',
                obs: verification?.observations?.join(' | ') || '—'
            };
        });
    }, [pipes, results.flows, results.verifications, chambers]);

    const filteredRows = React.useMemo(() => {
        const normalizedSearch = searchId.trim().toLowerCase();
        return rows
            .filter(row => statusFilter === 'ALL' || row.status === statusFilter)
            .filter(row => !normalizedSearch || row.id.toLowerCase().includes(normalizedSearch))
            .sort((a, b) => {
                if (sortBy === 'status') return statusOrder[a.status] - statusOrder[b.status];
                if (sortBy === 'q') return (b.qLs || 0) - (a.qLs || 0);
                if (sortBy === 'dn') return b.dn - a.dn;
                return b.slope - a.slope;
            });
    }, [rows, statusFilter, searchId, sortBy]);

    const selectedRowId = React.useMemo(() => {
        const selected = filteredRows.find(row => selectedIds.has(row.pipeId) || selectedIds.has(row.id));
        return selected?.pipeId || null;
    }, [filteredRows, selectedIds]);

    return (
        <div style={{ padding: '4px', display: 'flex', flexDirection: 'column', height: '100%', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '8px', padding: '0 8px' }}>
                <select
                    style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)' }}
                    value={statusFilter}
                    onChange={event => setStatusFilter(event.target.value as 'ALL' | StatusType)}
                >
                    <option value="ALL">Estado: Todos</option>
                    <option value="APTO">APTO</option>
                    <option value="NO APTO">NO APTO</option>
                    <option value="CONDICIONAL">CONDICIONAL</option>
                    <option value="INFO">INFO</option>
                </select>
                <input
                    style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', flex: 1 }}
                    value={searchId}
                    onChange={event => setSearchId(event.target.value)}
                    placeholder="Buscar por ID (T1, C3...)"
                />
                <select
                    style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)' }}
                    value={sortBy}
                    onChange={event => setSortBy(event.target.value as SortKey)}
                >
                    <option value="status">Ordenar: Estado</option>
                    <option value="q">Ordenar: Q</option>
                    <option value="dn">Ordenar: DN</option>
                    <option value="slope">Ordenar: Pendiente</option>
                </select>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
                <DataTable
                    title="Resultados por Tramo"
                    columns={[
                        { key: 'id', header: 'ID_TRAMO', width: 90, sticky: 'left' },
                        { key: 'desde', header: 'C_INICIAL', width: 100, sticky: 'left' },
                        { key: 'hasta', header: 'C_FINAL', width: 100, sticky: 'left' },
                        {
                            key: 'status',
                            header: 'Estado',
                            width: 120,
                            align: 'center',
                            format: (v: any) => <StatusBadge status={v} />
                        },
                        { key: 'role', header: 'Rol', width: 150 },
                        { key: 'qLs', header: 'Q dis. (L/s)', width: 100, align: 'right', format: (v: any) => v !== undefined ? v.toFixed(3) : '—' },
                        { key: 'dn', header: 'DN', width: 60, align: 'right' },
                        { key: 'dint', header: 'DINT', width: 70, align: 'right', format: (v: any) => Number.isFinite(v) ? v.toFixed(1) : '—' },
                        { key: 'slope', header: 'Pend (%)', width: 80, align: 'right', format: (v: any) => v.toFixed(2) },
                        { key: 'norm', header: 'Norma', width: 150 },
                        { key: 'obs', header: 'Observaciones', width: 200 }
                    ]}
                    rows={filteredRows}
                    rowKey={(row) => row.pipeId}
                    selectedRowKey={selectedRowId}
                    density="compact"
                    maxHeight="100%"
                    emptyState="No hay tramos para mostrar resultados."
                    onRowClick={(row) => {
                        setSelectedIds(new Set([row.pipeId]));
                        setEditingObjectId({ id: row.pipeId, type: 'pipe' });
                    }}
                />
            </div>
        </div>
    );
};
