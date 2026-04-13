import React from 'react';
import { useProject } from '../context/ProjectContext';
import { useView } from '../context/ViewContext';
import { executeHydraulicCalculation, HydraulicCalculationOutput, RolNormativo } from '../hydraulics/hydraulicCalculationEngine';
import { getEffectivePipe } from '../utils/getEffectivePipe';
import { DataTable } from './common/DataTable';
import { getManningN } from '../hydraulics/uehTables';
import { resolveHydraulicDiMm } from '../utils/diameterMapper';

interface CalculationRow {
    id: string;
    pipeId: string;
    role: string;
    chamberStart: string;
    chamberEnd: string;
    length: number;
    dn: number;
    dint: number;
    slope: number;
    method: string;
    demand: number;
    qDesign: number;
    qCap: number;
    velocity?: number;
    fill?: number;
    regime?: string;
    topologyRole?: string;
    debug?: string;
    hasFlow: boolean;
    manning: number;
    manningOrigin: string;
    calculation: HydraulicCalculationOutput;
}

const fmt = (value: number | undefined, decimals = 2): string => {
    if (value === undefined || !Number.isFinite(value)) return '—';
    return value.toFixed(decimals);
};

const methodLabel = (methodQ?: string): string => {
    if (methodQ === 'TABLA') return 'TABLA';
    if (methodQ === 'HARMON') return 'HARMON';
    if (methodQ === 'INTERPOLACION') return 'INTERPOLACIÓN';
    return 'UEH';
};

const toHydraulicRole = (role: string): RolNormativo => {
    if (role === 'LATERAL' || role === 'COLECTOR') return RolNormativo.COLECTOR_EXTERIOR;
    if (role === 'CAÑERIA') return RolNormativo.CAÑERIA;
    if (role === 'INTERIOR_RAMAL') return RolNormativo.INTERIOR_RAMAL;
    return RolNormativo.DESCARGA_HORIZ;
};

export const NewHydraulicCalculationTable: React.FC = () => {
    const { pipes, chambers, settings } = useProject();
    const { selectedIds, setSelectedIds, setEditingObjectId } = useView();

    const chamberById = React.useMemo(() => {
        const map = new Map<string, string>();
        chambers.forEach(chamber => map.set(chamber.id, chamber.userDefinedId || chamber.id));
        return map;
    }, [chambers]);

    const rows = React.useMemo<CalculationRow[]>(() => {
        try {
            return pipes.map(pipe => {
                const id = String(pipe.userDefinedId || pipe.id || '');
                const eff = getEffectivePipe(pipe);
                const role = toHydraulicRole(eff.role);
                const length = Number(pipe.length?.value || pipe.length || 0);
                const dn = Number(pipe.diameter?.value || pipe.diameter || 0);
                const slope = pipe.isSlopeManual && pipe.manualSlope ? Number(pipe.manualSlope.value) : Number(pipe.slope?.value || pipe.slope || 0);
                const material = String(pipe.material?.value || pipe.material || 'PVC');
                const ueh = Number(pipe.uehTransportadas?.value || 0);
                const collectorSizingMode = (pipe.hydraulics?.sourceMode || pipe.designOptions?.collectorSizingMode as any) || 'UEH_Qww';
                const qDesignEngine = Number(pipe.hydraulics?.Q_design_Lps ?? pipe.Q_design_Lps ?? 0);
                const populationTributaria = pipe.hydraulics?.inputs?.P_edge ?? pipe.P_tributaria;
                const dint = resolveHydraulicDiMm(pipe, dn);

                const effectiveManning = pipe.manningOrigin === 'Manual'
                    ? Number(pipe.manningManual?.value || 0.013)
                    : (pipe.manningOrigin === 'Material'
                        ? getManningN(String(pipe.material?.value || pipe.material || 'PVC'))
                        : (settings.manning.value || 0.013));

                const calculation = executeHydraulicCalculation({
                    id,
                    rol: role,
                    longitud_m: length,
                    dn_mm: dn,
                    pendiente_porcentaje: slope,
                    material,
                    n_manning: effectiveManning,
                    uehAcumuladas: ueh,
                    qDiseno_Ls: qDesignEngine,
                    populationTributaria,
                    populationTotal: settings.populationTotal,
                    verificationMethod: pipe.verificationMethod as 'A3_TABLA' | 'B25_MANNING',
                    collectorSizingMode,
                    designFlowMeta: {
                        method: (collectorSizingMode || 'UEH_Qww') as 'UEH_Qww' | 'POBLACION_NCH1105' | 'POBLACION_PONDERADA_UEH',
                        flowMethodNCh1105: pipe.hydraulics?.flowMethodNCh1105 || null
                    },
                    di_mm: dint,
                });

                const isCollector = eff.role === 'COLECTOR';

                return {
                    id,
                    pipeId: String(pipe.id || ''),
                    role: eff.role,
                    chamberStart: chamberById.get(pipe.startNodeId || '') || pipe.startNodeId || '—',
                    chamberEnd: chamberById.get(pipe.endNodeId || '') || pipe.endNodeId || '—',
                    length,
                    dn,
                    dint,
                    slope,
                    method: methodLabel(pipe.hydraulics?.methodQ),
                    demand: isCollector ? Number(pipe.hydraulics?.inputs?.P_edge || 0) : Number(calculation.flows.UEH || 0),
                    qDesign: Number(pipe.hydraulics?.Q_design_Lps ?? calculation.flows.Q_diseno_Ls ?? 0),
                    qCap: Number(calculation.hydraulicResults.qFullCapacity_Ls || 0),
                    velocity: calculation.hydraulicResults.velocidad_ms,
                    fill: calculation.hydraulicResults.alturaRelativa,
                    regime: calculation.hydraulicResults.regimen,
                    topologyRole: eff.role,
                    debug: eff.source,
                    hasFlow: calculation.hydraulicResults.hasFlow,
                    manning: effectiveManning,
                    manningOrigin: pipe.manningOrigin || 'Global',
                    calculation
                };
            });
        } catch {
            return [];
        }
    }, [chamberById, chambers, pipes, settings]);

    const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

    const selectedRowId = React.useMemo(() => {
        const selectedPipe = rows.find(row => selectedIds.has(row.pipeId) || selectedIds.has(row.id));
        return selectedPipe?.pipeId || null;
    }, [rows, selectedIds]);

    return (
        <div style={{ padding: '4px' }}>
            <DataTable
                title="Memoria de Cálculo Hidráulico"
                subtitle="Resultados detallados de capacidad, velocidad y altura de llenado."
                columns={[
                    { key: 'id', header: 'ID_TRAMO', width: 92, sticky: 'left' },
                    { key: 'chamberStart', header: 'C_INICIAL', width: 90, sticky: 'left' },
                    { key: 'chamberEnd', header: 'C_FINAL', width: 90, sticky: 'left' },
                    {
                        key: 'topologyRole',
                        header: 'Clasif.',
                        width: 100,
                        format: (v) => (
                            <span style={{
                                fontSize: '0.65rem',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontWeight: 700,
                                background: v === 'NACIENTE' ? 'var(--role-naciente-bg)' :
                                    v === 'LATERAL' ? 'var(--role-lateral-bg)' :
                                        v === 'COLECTOR' ? 'var(--role-colector-bg)' :
                                            v === 'CAÑERIA' ? 'var(--role-caneria-bg)' :
                                                'var(--role-neutral-bg)',
                                color: v === 'NACIENTE' ? 'var(--role-naciente)' :
                                    v === 'LATERAL' ? 'var(--role-lateral)' :
                                        v === 'COLECTOR' ? 'var(--role-colector)' :
                                            v === 'CAÑERIA' ? 'var(--role-caneria)' :
                                                'var(--role-neutral)',
                                border: `1px solid ${v === 'NACIENTE' ? 'var(--role-naciente)' :
                                    v === 'LATERAL' ? 'var(--role-lateral)' :
                                        v === 'COLECTOR' ? 'var(--role-colector)' :
                                            v === 'CAÑERIA' ? 'var(--role-caneria)' :
                                                'var(--role-neutral)'}`
                            }}>
                                {v || '—'}
                            </span>
                        )
                    },
                    { key: 'role', header: 'Rol', width: 150 },
                    { key: 'debug', header: 'DEBUG', width: 85 },
                    { key: 'length', header: 'L (m)', width: 80, align: 'right', format: (v) => fmt(v, 1) },
                    { key: 'dn', header: 'DN', width: 60, align: 'right' },
                    { key: 'dint', header: 'DINT', width: 60, align: 'right', format: (v) => fmt(v, 1) },
                    { key: 'slope', header: 'Pend (%)', width: 80, align: 'right', format: (v) => fmt(v, 2) },
                    { key: 'method', header: 'Método', width: 100, align: 'left' },
                    { key: 'manning', header: 'Manning (n)', width: 90, align: 'right', format: (v) => fmt(v, 3) },
                    {
                        key: 'manningOrigin',
                        header: 'Origen Manning',
                        width: 110,
                        format: (v) => (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                {v === 'Material' ? 'Automático' : v}
                            </span>
                        )
                    },
                    { key: 'qDesign', header: 'Caudal máx. horario (L/s)', width: 168, align: 'right', format: (v) => fmt(v, 3) },
                    { key: 'qCap', header: 'Q cap (L/s)', width: 100, align: 'right', format: (v) => fmt(v, 3) },
                    { key: 'velocity', header: 'V (m/s)', width: 80, align: 'right', format: (v, row) => row.hasFlow ? fmt(v, 2) : '—' },
                    { key: 'fill', header: 'h/D', width: 70, align: 'right', format: (v, row) => row.hasFlow ? fmt(v, 2) : '—' },
                    { key: 'regime', header: 'Régimen', width: 90, align: 'left' }
                ]}
                rows={rows}
                rowKey={(row) => row.pipeId}
                selectedRowKey={selectedRowId}
                density="compact"
                maxHeight="500px"
                onRowClick={(row) => {
                    setSelectedIds(new Set([row.pipeId]));
                    setEditingObjectId({ id: row.pipeId, type: 'pipe' });
                    setExpanded(prev => {
                        const next = new Set(prev);
                        if (next.has(row.pipeId)) next.delete(row.pipeId);
                        else next.add(row.pipeId);
                        return next;
                    });
                }}
                isRowExpanded={(row) => expanded.has(row.pipeId)}
                rowExpanded={(row) => (
                    <div style={{
                        padding: '12px',
                        background: 'var(--surface-elevated)',
                        borderRadius: '4px',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                        gap: '12px',
                        fontSize: '0.75rem'
                    }}>
                        <div>
                            <span style={{ color: 'var(--text-secondary)' }}>Caudal medio diario:</span>
                            <div style={{ fontWeight: 600 }}>{fmt(Number(pipes.find(p => p.id === row.pipeId)?.hydraulics?.inputs?.QmdAS_Lps), 3)} L/s</div>
                        </div>
                        <div>
                            <span style={{ color: 'var(--text-secondary)' }}>Caudal máximo horario:</span>
                            <div style={{ fontWeight: 600 }}>{fmt(Number(pipes.find(p => p.id === row.pipeId)?.hydraulics?.Q_design_Lps), 3)} L/s</div>
                        </div>
                        <div>
                            <span style={{ color: 'var(--text-secondary)' }}>V lleno:</span>
                            <div style={{ fontWeight: 600 }}>{fmt(row.calculation.hydraulicResults.vFull_m_s, 3)} m/s</div>
                        </div>
                        <div>
                            <span style={{ color: 'var(--text-secondary)' }}>Q capacidad:</span>
                            <div style={{ fontWeight: 600 }}>{fmt(row.calculation.hydraulicResults.qFullCapacity_Ls, 3)} L/s</div>
                        </div>
                    </div>
                )}
                emptyState="No hay tramos para cálculo por gravedad."
            />
        </div>
    );
};
