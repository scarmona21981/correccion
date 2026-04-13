import React from 'react';
import { useProject } from '../context/ProjectContext';
import { useView } from '../context/ViewContext';
import { RolNormativo, Tramo, analizarTramos, NormCheck } from '../hydraulics/test';
import { getEffectivePipe } from '../utils/getEffectivePipe';
import { DataTable } from './common/DataTable';
import { StatusBadge, StatusType } from './common/StatusBadge';
import { GravRecommendationsCard } from '../modules/gravedad/ui/GravRecommendationsCard';
import { CapacityRangeCard } from '../modules/gravedad/ui/CapacityRangeCard';
import { computeMinConditionForSegments } from '../domain/gravity/minConditionEngine';
import { SegmentInput, SegmentMinHydraulicResult, GravityRole } from '../domain/gravity/types';
import { mapTopologyRoleToGravityRole } from '../domain/gravity/mapTopologyRoleToGravityRole';
import { getManningN } from '../hydraulics/uehTables';
import { resolveInitialCondition } from '../hydraulics/nch1105SegmentUtils';
import { useGravitySimulation } from '../application/hooks';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface FilaUnificada {
    id: string;
    pipeId: string;
    rol: RolNormativo;
    dn: number;
    pendiente: number;
    qDiseno: number;
    metodo: string;
    resultado: string;
    status: StatusType;
    estado: StatusType;
    norma: string;
    /** Solo para NCh1105 (COLECTOR_EXTERIOR): condición máxima e mínima */
    condMax?: CondicionNCh1105;
    condMin?: CondicionNCh1105;
    /** Razón principal de no cumplimiento (solo NCh1105) */
    reason1105?: string;
    traceability?: {
        method: string;
        norma: string;
        anexo?: string;
        articulo?: string;
        formula: string;
    };
    hasInconsistency?: boolean;
    inconsistencyMessage?: string;
    checks: NormCheck[];
    topologyRole?: string;
    debug?: string;
}

interface CondicionNCh1105 {
    /** true = APTO, false = NO APTO */
    apto: boolean;
    /** IDs de checks que componen esta condición */
    checkIds: string[];
    /** Checks fallidos */
    failedChecks: NormCheck[];
    /** Resumen legible */
    summary: string;
}

interface NormRow extends FilaUnificada {
    checks: NormCheck[];
}

// ─── IDs de checks por condición (NCh1105) ───────────────────────────────────

/** Condición Máxima NCh1105: capacidad hidráulica */
const MAX_CHECK_IDS = new Set(['CAPACIDAD', 'H_D', 'VELOCIDAD_MAX']);
/** Condición Mínima NCh1105: h/D, pendiente, DN (sin check de V) */
const MIN_CHECK_IDS = new Set(['DN_MIN', 'PENDIENTE_MIN', 'H_D_MIN', 'QCAP_MIN']);

// --- MAPPING HELPERS (replicado de NCh1105VerificationTables.tsx) ---
// Mapping helper now imported from domain/gravity

function buildCondMinFromTabla17(min?: SegmentMinHydraulicResult): CondicionNCh1105 | undefined {
    if (!min) return undefined;

    const failed: NormCheck[] = [];

    if (!min.checks.I) failed.push({ id: 'PENDIENTE_MIN', titulo: 'Pendiente mínima', estado: 'FAIL', requerido: `≥ ${min.limits.I_min_permille}‰`, actual: `${min.I_eval_permille.toFixed(1)}‰` } as any);
    if (!min.checks.DN) failed.push({ id: 'DN_MIN', titulo: 'DN mínimo', estado: 'FAIL', requerido: `≥ ${min.limits.DN_min_mm} mm`, actual: `${min.DN_mm} mm` } as any);
    if (!min.checks.Qcap) failed.push({ id: 'QCAP_MIN', titulo: 'Capacidad hidráulica', estado: 'FAIL', requerido: 'Qcap ≥ Qmin', actual: `Qcap=${min.Qcap_Ls.toFixed(3)} L/s` } as any);
    if (!min.checks.hD) failed.push({ id: 'H_D_MIN', titulo: 'h/D mínimo', estado: 'FAIL', requerido: `≥ ${min.limits.h_over_D_min.toFixed(2)}`, actual: `h/D=${min.h_over_D.toFixed(3)}` } as any);
    // V_REF: indicador referencial NO normativo (NCh1105 6.8 aplica solo a h=D)
    // No registra FAIL, solo INFO cuando no cumple la referencia de 0.40 m/s
    if (!min.checks.Vref) failed.push({ id: 'VELOCIDAD_REF', titulo: 'V referencial (arrastre)', estado: 'INFO', requerido: `≥ ${min.limits.V_ref_lim_ms?.toFixed(2) ?? '0.40'} m/s (ref.)`, actual: `V=${min.V_ms.toFixed(3)} m/s` } as any);

    const apto = min.status === 'APTO';
    return {
        apto,
        checkIds: ['PENDIENTE_MIN', 'DN_MIN', 'QCAP_MIN', 'H_D_MIN'],
        failedChecks: failed,
        summary: apto ? 'Cumple condición mínima (Tabla 17)' : failed.filter(f => f.estado === 'FAIL').map(f => `${f.titulo}: ${f.actual} (req: ${f.requerido})`).join(' | ')
    };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toStatus = (ok: boolean, hasData: boolean): StatusType => {
    if (!hasData) return 'INFO';
    return ok ? 'APTO' : 'NO APTO';
};

const getMetodoQ = (methodQ?: string): string => {
    if (methodQ === 'TABLA') return 'TABLA';
    if (methodQ === 'HARMON') return 'HARMON';
    if (methodQ === 'INTERPOLACION') return 'INTERPOLACION';
    if (methodQ === 'CAUDAL_DIRECTO') return 'DIRECTO';
    return 'UEH';
};

const getTopologyRoleLabel = (pipe: any): string => {
    const eff = getEffectivePipe(pipe);
    if (eff.role === 'INTERIOR_RAMAL') return 'RAMAL_INTERIOR';
    if (eff.role === 'DESCARGA_HORIZ') return 'RAMAL_CONEXION';
    return eff.role;
};

/**
 * Extrae condición máxima y mínima desde los NormChecks de un colector NCh1105.
 */
function extractConditions1105(checks: NormCheck[]): {
    condMax: CondicionNCh1105;
    condMin: CondicionNCh1105;
} {
    const maxChecks = checks.filter(c => MAX_CHECK_IDS.has(c.id));
    const minChecks = checks.filter(c => MIN_CHECK_IDS.has(c.id));

    const maxFailed = maxChecks.filter(c => c.estado === 'FAIL');
    const minFailed = minChecks.filter(c => c.estado === 'FAIL');

    const maxApto = maxFailed.length === 0 && maxChecks.some(c => c.estado === 'PASS');
    const minApto = minFailed.length === 0 && minChecks.some(c => c.estado === 'PASS');

    const maxSummary = maxApto
        ? 'Cumple capacidad hidráulica'
        : maxFailed.map(c => `${c.titulo}: ${c.actual} (req: ${c.requerido})`).join(' | ');

    const minSummary = minApto
        ? 'Cumple autolavado y dimensiones'
        : minFailed.map(c => `${c.titulo}: ${c.actual} (req: ${c.requerido})`).join(' | ');

    return {
        condMax: {
            apto: maxApto,
            checkIds: maxChecks.map(c => c.id),
            failedChecks: maxFailed,
            summary: maxSummary
        },
        condMin: {
            apto: minApto,
            checkIds: minChecks.map(c => c.id),
            failedChecks: minFailed,
            summary: minSummary
        }
    };
}

/**
 * Genera el texto "POR QUÉ" según las condiciones de NCh1105.
 * Prioridad: Máx + Mín > solo Máx > solo Mín > sin fallo.
 */
function getReason1105(condMax: CondicionNCh1105, condMin: CondicionNCh1105): string {
    if (condMax.apto && condMin.apto) return '—';

    const maxReasons: string[] = [];
    const minReasons: string[] = [];

    for (const c of condMax.failedChecks) {
        if (c.id === 'H_D') maxReasons.push(`h/D = ${c.actual.replace('h/D = ', '')} > ${c.requerido}`);
        else if (c.id === 'CAPACIDAD') maxReasons.push(`Capacidad insuficiente: ${c.actual}`);
        else if (c.id === 'VELOCIDAD_MAX') maxReasons.push(`V_máx: ${c.actual} > ${c.requerido}`);
        else maxReasons.push(`${c.titulo}: ${c.actual}`);
    }

    for (const c of condMin.failedChecks) {
        if (c.id === 'H_D_MIN') minReasons.push(`No cumple h/D mínimo: ${c.actual} < ${c.requerido}`);
        else if (c.id === 'VELOCIDAD_MIN') minReasons.push(`No hay autolavado: ${c.actual} < ${c.requerido}`);
        else if (c.id === 'PENDIENTE_MIN') minReasons.push(`Pendiente insuf.: ${c.actual} < ${c.requerido}`);
        else if (c.id === 'DN_MIN') minReasons.push(`DN < mínimo: ${c.actual} (req. ${c.requerido})`);
        else if (c.id === 'QCAP_MIN') minReasons.push(`Capacidad insuficiente: ${c.actual}`);
        else minReasons.push(`${c.titulo}: ${c.actual}`);
    }

    const allReasons = [...maxReasons, ...minReasons];
    if (allReasons.length === 0) return '—';
    return allReasons.join(' · ');
}

// ─── Mini-badge inline ─────────────────────────────────────────────────────────

const MiniCondBadge: React.FC<{ cond?: CondicionNCh1105; label: string }> = ({ cond, label }) => {
    if (!cond) {
        return <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>—</span>;
    }
    const color = cond.apto ? '#10b981' : '#ef4444';
    const bg = cond.apto ? 'rgba(16,185,129,0.10)' : 'rgba(239,68,68,0.10)';
    const border = cond.apto ? '#10b98133' : '#ef444433';

    return (
        <span
            title={cond.summary}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: '3px',
                padding: '2px 7px', borderRadius: '999px',
                background: bg, color, fontWeight: 700, fontSize: '10px',
                border: `1px solid ${border}`, cursor: 'help',
                whiteSpace: 'nowrap'
            }}
        >
            {cond.apto ? '✓' : '✗'} {label}
        </span>
    );
};

// ─── POR QUÉ cell ─────────────────────────────────────────────────────────────

const ReasonCell: React.FC<{ reason?: string }> = ({ reason }) => {
    if (!reason || reason === '—') {
        return <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>—</span>;
    }
    return (
        <span
            title={reason}
            style={{
                fontSize: '10px',
                color: '#f59e0b',
                maxWidth: '220px',
                display: 'inline-block',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                cursor: 'help'
            }}
        >
            ⚠ {reason}
        </span>
    );
};

// ─── Componente principal ─────────────────────────────────────────────────────

export const RolNormativoTableView: React.FC = () => {
    const { pipes, chambers, settings } = useProject();
    const { selectedIds, setSelectedIds, setEditingObjectId, verification1105 } = useView();
    const [expandedRows, setExpandedRows] = React.useState<Set<string>>(new Set());
    
    const { results: results16 } = useGravitySimulation({
        chambers,
        pipes,
        settings
    });

    const rows = React.useMemo<NormRow[]>(() => {
        if (!results16) return [];
        
        try {
            const chamberById = new Map(chambers.map(chamber => [chamber.id, chamber]));
            const pipeByDisplayId = new Map(pipes.map(pipe => [String(pipe.userDefinedId || pipe.id || ''), pipe]));

            const tramos: Tramo[] = pipes.map((pipe: any) => {
                const eff = getEffectivePipe(pipe);
                const role: RolNormativo = eff.role === 'INTERIOR_RAMAL'
                    ? RolNormativo.INTERIOR_RAMAL
                    : (eff.role === 'DESCARGA_HORIZ' ? RolNormativo.DESCARGA_HORIZ : RolNormativo.COLECTOR_EXTERIOR);
                const startNodeId = String(pipe.startNodeId || '');
                const startChamber = startNodeId ? chamberById.get(startNodeId) : undefined;
                const fixtures = Array.isArray(startChamber?.fixtureLoads)
                    ? startChamber.fixtureLoads
                        .map((entry: any) => ({
                            fixtureKey: String(entry.fixtureKey || '').trim(),
                            usageClass: (Number(entry.usageClass) as 1 | 2 | 3 | 4) || 1,
                            quantity: Number(entry.quantity) || 0
                        }))
                        .filter((entry: any) => entry.fixtureKey && entry.quantity > 0)
                    : [];

                return {
                    id: String(pipe.userDefinedId || pipe.id || ''),
                    idNodoInicio: startNodeId,
                    idNodoFin: String(pipe.endNodeId || ''),
                    rol: role,
                    longitud_m: Number(pipe.length?.value || pipe.length || 0),
                    dn_mm: Number(pipe.diameter?.value || pipe.diameter || 0),
                    pendiente_porcentaje: pipe.isSlopeManual && pipe.manualSlope
                        ? Number(pipe.manualSlope.value)
                        : Number(pipe.slope?.value || pipe.slope || 0),
                    material: String(pipe.material?.value || pipe.material || 'PVC'),
                    n_manning: pipe.manningOrigin === 'Manual'
                        ? Number(pipe.manningManual?.value || 0.013)
                        : (pipe.manningOrigin === 'Material'
                            ? getManningN(String(pipe.material?.value || pipe.material || 'PVC'))
                            : (settings.manning.value || 0.013)),
                    artefactos: fixtures,
                    qDiseno_Ls: Number(
                        pipe.hydraulics?.Q_design_Lps
                        ?? pipe.Q_design_Lps
                        ?? (role === 'COLECTOR_EXTERIOR'
                            ? (Number(pipe.qContinuous?.value || 0) || Number(pipe.qwwTransportado?.value || 0))
                            : Number(pipe.qwwTransportado?.value || 0))
                    ),
                    uehAcumuladas: Number(pipe.uehTransportadas?.value || 0),
                    qMin_Ls: verification1105?.table17_min.find(r => r.segmentId === pipe.id)?.qmin_lps || 0,
                    verificationMethod: (pipe.verificationMethod as any) || 'A3_TABLA'
                };
            });

            const result = analizarTramos(tramos);

            const interiorRows: NormRow[] = result.tablaInterior.map(row => {
                const sourcePipe = pipeByDisplayId.get(row.idTramo);
                const hasData = row.uehAcumuladas > 0;
                const ok = row.cumpleGlobal === 'Cumple';
                return {
                    id: row.idTramo,
                    pipeId: String(sourcePipe?.id || row.idTramo),
                    rol: RolNormativo.INTERIOR_RAMAL,
                    dn: row.dnProyectado,
                    pendiente: row.pendienteProyectada,
                    qDiseno: 0,
                    metodo: 'UEH',
                    resultado: hasData ? (ok ? 'Verificación OK' : 'No cumple') : 'Sin artefactos',
                    status: toStatus(ok, hasData),
                    estado: toStatus(ok, hasData),
                    norma: 'NCh3371 Anexo A',
                    checks: row.checks,
                    topologyRole: sourcePipe ? getTopologyRoleLabel(sourcePipe) : undefined,
                    debug: sourcePipe ? getEffectivePipe(sourcePipe).source : undefined
                };
            });

            const dischargeRows: NormRow[] = result.tablaDescarga.map(row => {
                const sourcePipe = pipeByDisplayId.get(row.idTramo);
                const hasData = row.qDiseno_Ls > 0 || (row.uehAcumuladas || 0) > 0;
                const ok = row.cumpleGlobal === 'Cumple';
                return {
                    id: row.idTramo,
                    pipeId: String(sourcePipe?.id || row.idTramo),
                    rol: RolNormativo.DESCARGA_HORIZ,
                    dn: row.dn,
                    pendiente: row.pendiente,
                    qDiseno: row.qDiseno_Ls,
                    metodo: getMetodoQ(sourcePipe?.hydraulics?.methodQ),
                    resultado: hasData ? (ok ? 'Verificación OK' : 'No cumple') : 'Sin datos',
                    status: toStatus(ok, hasData),
                    estado: toStatus(ok, hasData),
                    norma: row.verificationMethod === 'B25_MANNING' ? 'NCh3371 B.2.5' : 'NCh3371 Tabla A.3',
                    checks: row.checks,
                    topologyRole: sourcePipe ? getTopologyRoleLabel(sourcePipe) : undefined,
                    debug: sourcePipe ? getEffectivePipe(sourcePipe).source : undefined
                };
            });

            // --- TABLA 17: Condición Mínima (Truth Source) ---
            const pipes1105 = pipes.filter(p => {
                return getEffectivePipe(p).regime === 'NCH1105';
            });

            const Qmd_Ls_bySegment: Record<string, number> = {};
            const bsce_Ls_bySegment: Record<string, number> = {};
            const tabla16BySegmentId = new Map(results16.tabla16Calculo.map(row => [row.segmentId, row]));
            const tabla16ByTramoId = new Map(results16.tabla16Calculo.map(row => [row.id_tramo, row]));
            const networkEdges = pipes.map(p2 => ({ id: p2.id, endNodeId: p2.endNodeId }));

            const segmentsInput: SegmentInput[] = pipes1105.map(p => {
                const up = chambers.find(c => c.id === p.startNodeId);
                const dw = chambers.find(c => c.id === p.endNodeId);
                const topologyRole = getTopologyRoleLabel(p);
                const role = mapTopologyRoleToGravityRole(topologyRole);
                const isInitial = resolveInitialCondition({
                    id: p.id,
                    startNodeId: p.startNodeId,
                    gravityRole_manual: p.gravityRole_manual,
                    gravityRole_auto: p.gravityRole_auto,
                    role
                }, networkEdges);
                const slope_pct = p.isSlopeManual && p.manualSlope ? Number(p.manualSlope.value) : Number(p.slope?.value || 0);

                const keyId = p.userDefinedId || p.id;
                const calcRow = tabla16BySegmentId.get(p.id) || tabla16ByTramoId.get(keyId);
                Qmd_Ls_bySegment[keyId] = calcRow?.q_md_as ?? 0;
                bsce_Ls_bySegment[keyId] = calcRow?.q_bsce_ref ?? 0;

                return {
                    id: keyId,
                    cIni: up?.userDefinedId || '?',
                    cFin: dw?.userDefinedId || '?',
                    role,
                    L_m: Number(p.length?.value || 0),
                    DN_mm: Number(p.diameter?.value || 200),
                    slope_permille: slope_pct * 10,
                    material: String(p.material?.value || 'PVC'),
                    isInitial,
                    sdr: p.sdr?.value ? String(p.sdr.value) : undefined,
                    // Pasar P_edge para que el motor use fallback si Qmd_Ls_bySegment = 0
                    P_edge: Number(p.P_edge ?? 0),
                    D_Lphd: settings.D_L_per_hab_day || 150,
                    R: settings.R_recovery || 0.8,
                    C: settings.C_capacity || 1.0,
                };
            });

            const minResults = computeMinConditionForSegments(segmentsInput, {
                Qmd_Ls_bySegment,
                bsce_Ls_bySegment,
                isPublico: settings.projectType === 'Público',
                dnMin_mm: settings.projectType === 'Público' ? 200 : 175
            });

            const minById = new Map<string, SegmentMinHydraulicResult>();
            minResults.forEach(r => minById.set(r.id, r));

            const collectorRows: NormRow[] = result.tablaColector.map(row => {
                const sourcePipe = pipeByDisplayId.get(row.idTramo);
                const hasData = row.qAcumulado_Ls > 0;

                // --- CONSUMIR MOTOR REAL (No recalcular locally derived) ---
                const verificacionMotor = sourcePipe?.verificacion1105;

                // Determinar condMax y condMin finales
                let condMax = extractConditions1105(row.checks).condMax;
                let condMinOriginal = extractConditions1105(row.checks).condMin;

                // Overwrite condMin with Truth Source (Tabla 17)
                const minResult = minById.get(row.idTramo);
                const condMinTabla17 = buildCondMinFromTabla17(minResult);
                const condMin = condMinTabla17 ?? condMinOriginal;

                if (verificacionMotor) {
                    condMax = {
                        ...condMax,
                        apto: verificacionMotor.max.apto,
                        summary: verificacionMotor.max.motivo
                    };
                    // solo actualizamos condMin si no venía de Tabla 17 (aunque Tabla 17 es preferida)
                }

                const estadoApto = condMax.apto && condMin.apto && hasData;
                const reason1105 = hasData ? getReason1105(condMax, condMin) : 'Sin caudal';

                const resultado1105 = !hasData
                    ? 'Sin caudal'
                    : estadoApto
                        ? 'Verificación OK'
                        : 'No cumple NCh1105';

                return {
                    id: row.idTramo,
                    pipeId: String(sourcePipe?.id || row.idTramo),
                    rol: RolNormativo.COLECTOR_EXTERIOR,
                    dn: row.dn,
                    pendiente: row.pendiente,
                    qDiseno: row.qAcumulado_Ls,
                    metodo: getMetodoQ(sourcePipe?.hydraulics?.methodQ),
                    resultado: resultado1105,
                    status: toStatus(estadoApto, hasData),
                    estado: toStatus(estadoApto, hasData),
                    norma: 'NCh1105',
                    condMax: hasData ? condMax : undefined,
                    condMin: hasData ? condMin : undefined,
                    reason1105,
                    checks: row.checks,
                    topologyRole: sourcePipe ? getTopologyRoleLabel(sourcePipe) : undefined,
                    debug: sourcePipe ? getEffectivePipe(sourcePipe).source : undefined
                };
            });

            return [...interiorRows, ...dischargeRows, ...collectorRows];
        } catch {
            return [];
        }
    }, [chambers, pipes, settings, verification1105, results16]);

    const selectedRowId = React.useMemo(() => {
        const selected = rows.find(row => selectedIds.has(row.pipeId) || selectedIds.has(row.id));
        return selected?.pipeId || null;
    }, [rows, selectedIds]);

    return (
        <div style={{ padding: '4px' }}>
            <DataTable
                title="Evaluación Normativa (NCh1105 / NCh3371)"
                subtitle="Resumen de cumplimiento estructural e hidráulico por tramo. Para NCh1105: se muestran Condición Máxima (capacidad) y Condición Mínima (autolavado/dimensiones) por separado."
                columns={[
                    { key: 'id', header: 'ID_TRAMO', width: 90, sticky: 'left' },
                    {
                        key: 'topologyRole',
                        header: 'Clasificación',
                        width: 110,
                        format: (v) => (
                            <span style={{
                                fontSize: '0.65rem',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontWeight: 700,
                                background: v === 'NACIENTE' ? 'var(--role-naciente-bg)' :
                                    v === 'LATERAL' ? 'var(--role-lateral-bg)' :
                                        v === 'COLECTOR' ? 'var(--role-colector-bg)' :
                                            'var(--role-neutral-bg)',
                                color: v === 'NACIENTE' ? 'var(--role-naciente)' :
                                    v === 'LATERAL' ? 'var(--role-lateral)' :
                                        v === 'COLECTOR' ? 'var(--role-colector)' :
                                            'var(--role-neutral)',
                                border: `1px solid ${v === 'NACIENTE' ? 'var(--role-naciente)' :
                                    v === 'LATERAL' ? 'var(--role-lateral)' :
                                        v === 'COLECTOR' ? 'var(--role-colector)' :
                                            'var(--role-neutral)'}`
                            }}>
                                {v || '—'}
                            </span>
                        )
                    },
                    { key: 'debug', header: 'DEBUG', width: 80 },
                    { key: 'dn', header: 'DN', width: 70, align: 'right' },
                    { key: 'pendiente', header: 'Pend (%)', width: 85, align: 'right', format: (v) => v.toFixed(2) },
                    { key: 'qDiseno', header: 'Q (L/s)', width: 90, align: 'right', format: (v) => v > 0 ? v.toFixed(3) : '—' },
                    { key: 'norma', header: 'Norma', width: 120 },
                    { key: 'estado', header: 'Estado', width: 110, align: 'center', format: (v) => <StatusBadge status={v} /> },
                    // ── Columnas NCh1105 ───────────────────────────────────────
                    {
                        key: 'condMax',
                        header: 'COND. MÁX (1105)',
                        width: 130,
                        align: 'center',
                        tooltip: () => 'Condición Máxima NCh1105: capacidad hidráulica (h/D ≤ 0.70, Q_cap ≥ Q_dis, V ≤ 3 m/s)',
                        format: (_v, row) => (
                            <MiniCondBadge
                                cond={(row as NormRow).condMax}
                                label={row.norma === 'NCh1105' ? 'MÁX' : ''}
                            />
                        )
                    },
                    {
                        key: 'condMin',
                        header: 'COND. MÍN (1105)',
                        width: 130,
                        align: 'center',
                        tooltip: () => 'Condición Mínima NCh1105 (Art. 6.7, 6.9, 8.1): h/D≥0.30, pendiente mínima y DN mínimo. V≥0.60 m/s (6.8) aplica solo a h=D, no en Qmín.',
                        format: (_v, row) => (
                            <MiniCondBadge
                                cond={(row as NormRow).condMin}
                                label={row.norma === 'NCh1105' ? 'MÍN' : ''}
                            />
                        )
                    },
                    {
                        key: 'reason1105',
                        header: 'POR QUÉ',
                        width: 240,
                        tooltip: () => 'Motivo principal de no cumplimiento (solo NCh1105)',
                        format: (_v, row) => <ReasonCell reason={(row as NormRow).reason1105} />
                    },
                    { key: 'resultado', header: 'Resultado', width: 200 }
                ]}
                rows={rows}
                rowKey={(row) => row.pipeId}
                selectedRowKey={selectedRowId}
                density="compact"
                maxHeight="500px"
                onRowClick={(row) => {
                    setSelectedIds(new Set([row.pipeId]));
                    setEditingObjectId({ id: row.pipeId, type: 'pipe' });
                    setExpandedRows(prev => {
                        const next = new Set(prev);
                        if (next.has(row.pipeId)) next.delete(row.pipeId);
                        else next.add(row.pipeId);
                        return next;
                    });
                }}
                isRowExpanded={(row) => expandedRows.has(row.pipeId)}
                rowExpanded={(row) => (
                    <div style={{ padding: '10px', background: 'var(--surface-elevated)', borderRadius: '4px' }}>
                        {/* Para NCh1105: mostrar secciones Máx y Mín separadas */}
                        {row.norma === 'NCh1105' && (row as NormRow).condMax ? (
                            <div style={{ display: 'flex', gap: '12px', flexDirection: 'column' }}>
                                {/* Cond. Máxima */}
                                <ConditionSection
                                    title="Condición Máxima — Capacidad hidráulica"
                                    color="#3b82f6"
                                    checks={row.checks.filter(c => MAX_CHECK_IDS.has(c.id))}
                                />
                                {/* Cond. Mínima */}
                                <ConditionSection
                                    title="Condición Mínima — Autolavado y dimensiones"
                                    color="#10b981"
                                    checks={row.checks.filter(c => MIN_CHECK_IDS.has(c.id))}
                                />
                            </div>
                        ) : (
                            /* Para NCh3371: tabla plana de checks */
                            <DataTable
                                columns={[
                                    {
                                        key: 'estado',
                                        header: 'Estado',
                                        width: 100,
                                        align: 'center',
                                        format: (v) => <StatusBadge status={v === 'PASS' ? 'APTO' : v === 'FAIL' ? 'NO APTO' : 'INFO'} />
                                    },
                                    { key: 'titulo', header: 'Verificación', width: 180 },
                                    { key: 'requerido', header: 'Requerido', width: 140 },
                                    { key: 'actual', header: 'Actual', width: 140 },
                                    { key: 'norma', header: 'Norma', width: 140 },
                                    { key: 'evidencia', header: 'Evidencia', width: 140 }
                                ]}
                                rows={row.checks}
                                rowKey={(check) => `${row.id}-${check.id}`}
                                density="compact"
                                emptyState="Sin checks normativos para este tramo."
                            />
                        )}
                    </div>
                )}
                emptyState="No hay datos para evaluación normativa."
            />
            <GravRecommendationsCard rows={rows} />
            <CapacityRangeCard />
        </div>
    );
};

// ─── Sub-componente para sección Cond.Máx / Cond.Mín ─────────────────────────

const ConditionSection: React.FC<{
    title: string;
    color: string;
    checks: NormCheck[];
}> = ({ title, color, checks }) => {
    const allPass = checks.every(c => c.estado === 'PASS' || c.estado === 'INFO');
    return (
        <div style={{
            border: `1px solid ${allPass ? color + '33' : '#ef444433'}`,
            borderRadius: '6px',
            overflow: 'hidden'
        }}>
            <div style={{
                padding: '6px 12px',
                background: allPass ? `${color}12` : 'rgba(239,68,68,0.08)',
                display: 'flex', alignItems: 'center', gap: '8px',
                borderBottom: '1px solid var(--border)'
            }}>
                <span style={{
                    fontSize: '11px', fontWeight: 800, letterSpacing: '0.04em',
                    color: allPass ? color : '#ef4444'
                }}>
                    {allPass ? '✓ ' : '✗ '}{title}
                </span>
            </div>
            <DataTable
                columns={[
                    {
                        key: 'estado',
                        header: 'Estado',
                        width: 90,
                        align: 'center',
                        format: (v) => <StatusBadge status={v === 'PASS' ? 'APTO' : v === 'FAIL' ? 'NO APTO' : 'INFO'} />
                    },
                    { key: 'titulo', header: 'Verificación', width: 200 },
                    { key: 'requerido', header: 'Requerido', width: 160 },
                    { key: 'actual', header: 'Actual', width: 160 },
                    { key: 'norma', header: 'Norma', width: 160 },
                    { key: 'evidencia', header: 'Evidencia', width: 180 }
                ]}
                rows={checks}
                rowKey={(c) => c.id}
                density="compact"
                emptyState="—"
            />
        </div>
    );
};
