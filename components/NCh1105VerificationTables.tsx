import React from 'react';
import { InlineMath, BlockMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import { DataTable, DataTableColumn } from './common/DataTable';
import { StatusBadge, StatusType } from './common/StatusBadge';
import { useProject } from '../context/ProjectContext';
import {
    Tabla16CalculoMax,
    Tabla16VerificacionMax
} from '../hydraulics/nch1105Engine';
import { useGravitySimulation } from '../application/hooks';
import { computeMinConditionForSegments } from '../domain/gravity/minConditionEngine';
import { SegmentInput, SegmentMinHydraulicResult, GravityRole } from '../domain/gravity/types';
import { mapTopologyRoleToGravityRole } from '../domain/gravity/mapTopologyRoleToGravityRole';
import { getEffectivePipe } from '../utils/getEffectivePipe';
import { Calculator, CheckCircle2, AlertTriangle, XCircle, Info, FileText, X, ShieldCheck, Droplets, FileSpreadsheet } from 'lucide-react';
import { InverseCapacityPanel } from './InverseCapacityPanel';
import { buildDatedExcelFileName, exportMultiSheetToExcel } from '../utils/excelExport';
import { resolveInitialCondition } from '../hydraulics/nch1105SegmentUtils';
import { resolveHydraulicDiMm } from '../utils/diameterMapper';
import { getManningAndDiMm } from '../hydraulics/hydraulicCalculationEngine';

const fmt = (val: number | undefined, dec = 2) => {
    if (val === undefined || val === null || !Number.isFinite(val)) return '—';
    return val.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
};

const CheckIcon: React.FC<{ ok: boolean | null | undefined }> = ({ ok }) => {
    if (ok === null || ok === undefined) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
    return ok ? <CheckCircle2 size={16} color="var(--success)" /> : <XCircle size={16} color="var(--danger)" />;
};

const normalizeStatusText = (status: string | undefined | null) => {
    if (!status) return '—';
    const normalized = String(status).replace(/_/g, ' ').trim();
    if (!normalized) return '—';
    return normalized.toUpperCase();
};

const roundExport = (value: unknown, decimals: number): number | null => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const factor = 10 ** decimals;
    return Math.round(numeric * factor) / factor;
};

const normalizeTramoId = (value: unknown, fallback: string) => {
    const text = String(value ?? '').trim();
    if (!text || text === '?') return fallback;
    return text;
};

const mapRoleForExport = (role: unknown) => {
    const normalized = String(role ?? '').trim().toUpperCase();
    if (!normalized) return '—';
    if (normalized.includes('NACIENTE') || normalized.includes('LATERAL')) return 'lateral';
    if (normalized.includes('COLECTOR')) return 'colector';
    if (normalized.includes('INTERCEPTOR') || normalized.includes('EMISARIO')) return 'interceptor';
    return normalized.toLowerCase();
};

const mapManningOriginForExport = (origin: unknown) => {
    const normalized = String(origin ?? '').trim().toUpperCase();
    if (!normalized) return '—';
    if (normalized.startsWith('MATERIAL')) return 'material';
    if (normalized.startsWith('MANUAL')) return 'manual';
    if (normalized.startsWith('GLOBAL')) return 'global';
    return normalized.toLowerCase();
};

const mapQminMethodForExport = (basis: string | undefined) => {
    const normalized = String(basis ?? '').trim().toUpperCase();
    if (normalized === 'BSCE') return 'BSCE (Q máx. inst.)';
    if (normalized === 'QMD') return 'Qmd';
    if (normalized.startsWith('0_60_QMD')) return '0.60 Qmd';
    return normalized || '—';
};

interface DatosTramoExportRow {
    tramo: string;
    c_inicial: string;
    c_final: string;
    p_hab: number | null;
    hab_casa: number | null;
    bsce_ls: number | null;
    metodo: string;
    rol: string;
    dn_mm: number | null;
    dint_mm: number | null;
    material: string;
    manning: number | null;
    origen_manning: string;
    longitud_m: number | null;
    pendiente_permille: number | null;
}

interface CalculoQmaxExportRow {
    tramo: string;
    qmd_ls: number | null;
    m_harmon_1000: number | null;
    q_harmon_1000: number | null;
    t_interp: number | null;
    fp_qmax_qmd: number | null;
    m_harmon: number | null;
    qmax_ls: number | null;
    qcap_ls: number | null;
    q_over_qcap: number | null;
    hd: number | null;
    velocidad_ms: number | null;
}

interface VerificacionQmaxExportRow {
    tramo: string;
    hd: number | null;
    limite_hd: number | null;
    velocidad_ms: number | null;
    velocidad_max_norma_ms: number | null;
    estado: string;
}

interface CalculoQminExportRow {
    tramo: string;
    metodo_qmin: string;
    qmin_ls: number | null;
    qcap_ls: number | null;
    hd: number | null;
    velocidad_ms: number | null;
}

interface VerificacionQminExportRow {
    tramo: string;
    qmin_ls: number | null;
    dn_mm: number | null;
    pendiente_permille: number | null;
    pendiente_minima: number | null;
    cumple_pendiente: string;
    hd: number | null;
    vmin_ms: number | null;
    estado_velocidad: string;
    estado: string;
}

interface ResumenHidraulicoExportRow {
    tramo: string;
    rol: string;
    dn_mm: number | null;
    dint_mm: number | null;
    pendiente_permille: number | null;
    qmax_ls: number | null;
    v_qmax_ms: number | null;
    hd_qmax: number | null;
    qmin_ls: number | null;
    v_qmin_ms: number | null;
    hd_qmin: number | null;
    velocidad_max_norma_ms: number | null;
    estado: string;
}

// --- MAPPING HELPERS ---
// Mapping helper now imported from domain/gravity

// --- MODAL TRAZABILIDAD ---
interface TraceModalProps {
    result: SegmentMinHydraulicResult;
    onClose: () => void;
}

const TraceModal: React.FC<TraceModalProps> = ({ result, onClose }) => {
    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <div className="modal-header">
                    <h3>Trazabilidad de Cálculo: {result.id} ({result.tramoLabel})</h3>
                    <button onClick={onClose} className="btn-close"><X size={20} /></button>
                </div>
                <div className="modal-body">
                    <section className="trace-section">
                        <h4>Rol NCh1105 utilizado</h4>

                        {/* Fila: rolle efectivo + origen */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
                            <span style={{
                                padding: '3px 10px', borderRadius: '999px',
                                fontSize: '12px', fontWeight: 700,
                                background: result.role === 'NACIENTE' ? 'var(--role-naciente-bg)' :
                                    result.role === 'LATERAL' ? 'var(--role-lateral-bg)' :
                                        'var(--role-colector-bg)',
                                color: result.role === 'NACIENTE' ? 'var(--role-naciente)' :
                                    result.role === 'LATERAL' ? 'var(--role-lateral)' : 'var(--role-colector)',
                                border: '1px solid currentColor'
                            }}>
                                {result.role}
                            </span>
                            {result.role_isManual ? (
                                <span style={{
                                    padding: '2px 8px', borderRadius: '4px', fontSize: '11px',
                                    background: 'var(--warning-bg)', color: 'var(--warning)',
                                    border: '1px solid var(--warning-border)'
                                }}>
                                    ⚠ Manual
                                </span>
                            ) : (
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                    Automático por topología
                                </span>
                            )}
                        </div>

                        {/* Tabla de trazabilidad del rol */}
                        <div style={{
                            padding: '10px 12px',
                            background: 'var(--surface-alt)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border-soft)',
                            fontSize: '0.82rem',
                            lineHeight: 1.6
                        }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Auto:</span>
                                <strong style={{
                                    color: result.role_auto === 'NACIENTE' ? '#4ade80' :
                                        result.role_auto === 'COLECTOR' ? '#c084fc' : '#60a5fa'
                                }}>{result.role_auto ?? '—'}</strong>

                                <span style={{ color: 'var(--text-muted)' }}>Manual:</span>
                                <strong style={{ color: result.role_isManual ? '#f59e0b' : 'var(--text-muted)' }}>
                                    {result.role_isManual ? result.role : '—'}
                                </strong>

                                <span style={{ color: 'var(--text-muted)' }}>Rol efectivo usado:</span>
                                <strong style={{ color: 'var(--text-primary)' }}>{result.role}</strong>
                            </div>

                            {/* Impacto hidráulico */}
                            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-soft)' }}>
                                <div style={{ fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    Impacto hidráulico
                                </div>
                                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.82rem', lineHeight: 1.7 }}>
                                    <li>
                                        <strong>Qmín →</strong>{' '}
                                        {result.role === 'COLECTOR' || result.role === 'INTERCEPTOR' || result.role === 'EMISARIO'
                                            ? '0.60 · Qmd (Art. 6.6.2.3 NCh1105)'
                                            : 'BSCE (Art. 6.6.2.1 + Anexo A NCh1105)'
                                        }
                                    </li>
                                    <li>
                                        <strong>Qmáx →</strong>{' '}
                                        Caudal máximo horario — Harmon / Interpolación NCh1105 (Art. 6.5)
                                    </li>
                                </ul>
                            </div>
                        </div>

                        {/* Advertencia si el rol fue forzado manualmente */}
                        {result.role_isManual && (
                            <div style={{
                                marginTop: '8px', padding: '7px 10px',
                                background: 'var(--warning-bg)', borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--warning-border)',
                                fontSize: '11px', color: 'var(--warning)', fontStyle: 'italic'
                            }}>
                                El override manual puede alterar el criterio de Qmín (BSCE vs 0.60·Qmd) y/o Qmáx. Verifique que el rol asignado sea correcto para este tramo.
                            </div>
                        )}
                    </section>

                    <section className="trace-section">
                        <h4>Metodología y Base de Caudal</h4>
                        <p><strong>Base:</strong> {result.trace.basis === 'BSCE' ? 'BSCE (Art. 6.6.2.1 + Anexo A)' :
                            result.trace.basis === 'QMD' ? 'Caudal medio diario (Art. 6.6.2.2)' :
                                result.trace.basis === '0_60_QMD (fallback)' ? '0,60·Qmd (Fallback)' :
                                    '0,60·Qmd (Art. 6.6.2.3)'}</p>

                        <div className="math-box">
                            <BlockMath math={result.trace.formula} />
                        </div>
                    </section>

                    <section className="trace-section">
                        <h4>Valores Utilizados</h4>
                        <table className="trace-table">
                            <thead>
                                <tr>
                                    <th>Parámetro</th>
                                    <th>Valor</th>
                                    <th>Unidad</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr><td>Caudal Medio Diario (Qmd)</td><td>{fmt(result.trace.values.Qmd as number, 3)}</td><td>L/s</td></tr>
                                <tr><td>Caudal BSCE</td><td>{fmt(result.trace.values.BSCE as number, 3)}</td><td>L/s</td></tr>
                                <tr><td>Caudal verif. autolavado (Q BSCE / Qmd)</td><td>{fmt(result.Qmin_Ls, 3)}</td><td>L/s</td></tr>
                                <tr><td>Diámetro Interior (Dint)</td><td>{fmt(result.Dint_mm as number, 1)}</td><td>mm</td></tr>
                                <tr><td>Pendiente Evaluada (I)</td><td>{fmt(result.I_eval_permille as number, 1)}</td><td>‰</td></tr>
                                <tr><td>Coeficiente Manning (n)</td><td>{fmt(result.trace.values.n as number, 3)}</td><td>-</td></tr>
                            </tbody>
                        </table>
                    </section>

                    <section className="trace-section">
                        <h4>Referencias Normativas NCh1105:2019</h4>
                        <ul>
                            {result.trace.notes?.map((note, idx) => <li key={idx}>{note}</li>)}
                            <li><strong>6.7:</strong> Caudal mínimo: h/D ≥ 0.30</li>
                            <li><strong>6.8:</strong> V≥0.60 m/s aplica a tubo lleno (h=D). En condición mínima (Qmín), el cumplimiento se verifica por h/D≥0.30 (Art. 6.7).</li>
                            <li><strong>6.6.2:</strong> Definición de caudales mínimos por tipo de tramo</li>
                        </ul>
                    </section>
                </div>
                <div className="modal-footer">
                    <button onClick={onClose} className="btn-primary">Entendido</button>
                </div>
            </div>
            <style>{`
                .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 2000; backdrop-filter: blur(4px); }
                .modal-content { background: var(--surface); width: 600px; max-width: 90%; border-radius: var(--radius-lg); border: 1px solid var(--border); box-shadow: var(--shadow-xl); max-height: 85vh; display: flex; flex-direction: column; }
                .modal-header { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
                .modal-header h3 { margin: 0; font-size: 1.1rem; color: var(--accent); }
                .modal-body { padding: 20px; overflow-y: auto; color: var(--text-primary); }
                .modal-footer { padding: 16px 20px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; }
                .trace-section { margin-bottom: 24px; }
                .trace-section h4 { margin: 0 0 12px; font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-secondary); }
                .math-box { background: var(--surface-alt); padding: 16px; border-radius: var(--radius-md); border: 1px solid var(--border-soft); margin: 8px 0; }
                .trace-table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 0.9rem; }
                .trace-table th { text-align: left; padding: 8px; border-bottom: 2px solid var(--border); color: var(--text-secondary); }
                .trace-table td { padding: 8px; border-bottom: 1px solid var(--border-soft); }
                .btn-close { background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; transition: color 0.2s; }
                .btn-close:hover { color: var(--danger); }
                .btn-primary { background: var(--accent); color: white; border: none; padding: 8px 24px; border-radius: var(--radius-md); font-weight: 500; cursor: pointer; }
                .btn-primary:hover { filter: brightness(1.1); }
            `}</style>
        </div>
    );
};

export const NCh1105VerificationTables: React.FC = () => {
    const { chambers, pipes, settings, setPipes } = useProject();
    const [selectedMinResult, setSelectedMinResult] = React.useState<SegmentMinHydraulicResult | null>(null);

    /** Actualiza campos específicos de un pipe por su ID */
    const patchPipe = React.useCallback((pipeId: string, patch: Partial<typeof pipes[0]>) => {
        setPipes(prev => prev.map(p => p.id === pipeId ? { ...p, ...patch } : p));
    }, [setPipes]);

    const patchPipeHabPorCasa = React.useCallback((pipeId: string, habPorCasa: number | null) => {
        setPipes(prev => prev.map((p) => {
            if (p.id !== pipeId) return p;
            const currentInputs = p.hydraulics?.inputs ?? {};
            const nextInputs = habPorCasa !== null
                ? { ...currentInputs, habPorCasa }
                : Object.fromEntries(Object.entries(currentInputs).filter(([k]) => k !== 'habPorCasa'));
            const nextHydraulics = {
                ...(p.hydraulics ?? { Q_design_Lps: p.Q_design_Lps ?? 0, methodQ: 'CAUDAL_DIRECTO' as const }),
                inputs: nextInputs
            };
            return { ...p, hydraulics: nextHydraulics };
        }));
    }, [setPipes]);

    const resolveEditableHabPorCasa = React.useCallback((pipe: typeof pipes[0] | undefined, fallback?: number) => {
        const local = Number(pipe?.hydraulics?.inputs?.habPorCasa);
        if (Number.isFinite(local) && local > 0) return local;
        const global = Number(settings.nch1105?.habPorCasa);
        if (Number.isFinite(global) && global > 0) return global;
        const rowFallback = Number(fallback);
        if (Number.isFinite(rowFallback) && rowFallback > 0) return rowFallback;
        return 5;
    }, [settings.nch1105?.habPorCasa]);

    const isNCh1105Segment = React.useCallback((p: any) => {
        return getEffectivePipe(p).regime === 'NCH1105';
    }, []);

    const pipes1105 = React.useMemo(() => pipes.filter(isNCh1105Segment), [pipes, isNCh1105Segment]);
    const pipeBySegmentId = React.useMemo(() => {
        const map = new Map<string, typeof pipes[0]>();
        pipes.forEach((p) => map.set(p.id, p));
        return map;
    }, [pipes]);

    const { results: results16, hasResults: hasResults16 } = useGravitySimulation({
        chambers,
        pipes,
        settings
    });

    const results16Data = results16 ?? { tabla16Verificacion: [], tabla16Calculo: [] };

    // Tramos sin caudal detectados
    const sinCaudalRows = React.useMemo(() =>
        results16Data.tabla16Verificacion.filter((r: any) => r.sinCaudal),
        [results16Data]
    );

    const results17 = React.useMemo(() => {
        if (!pipes1105 || pipes1105.length === 0 || settings.projectType === 'Domiciliario') return [];

        const Qmd_Ls_bySegment: Record<string, number> = {};
        const bsce_Ls_bySegment: Record<string, number> = {};
        const tabla16BySegmentId = new Map(results16Data.tabla16Calculo.map((row: any) => [row.segmentId, row]));
        const tabla16ByTramoId = new Map(results16Data.tabla16Calculo.map((row: any) => [row.id_tramo, row]));
        const networkEdges = pipes.map(p => ({ id: p.id, endNodeId: p.endNodeId }));

        const segmentsInput: SegmentInput[] = pipes1105.map(p => {
            const up = chambers.find(c => c.id === p.startNodeId);
            const dw = chambers.find(c => c.id === p.endNodeId);
            
            // Usar lógica centralizada de rol efectivo
            const eff = getEffectivePipe(p);
            const role = mapTopologyRoleToGravityRole(eff.role);

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
            
            const dn_mm = Number(p.diameter?.value || 200);
            const material = String(p.material?.value || 'PVC');
            const sdr = p.sdr?.value ? String(p.sdr.value) : undefined;
            const { n: nDefault, di_mm: diTable } = getManningAndDiMm(material, dn_mm, sdr);
            const dint_mm = resolveHydraulicDiMm(p, diTable);
            
            const manningOrigin = p.manningOrigin || 'Global';
            const nResolvedRaw = manningOrigin === 'Manual'
                ? Number(p.manningManual?.value || 0.013)
                : (manningOrigin === 'Material'
                    ? nDefault
                    : (settings.manning.value || 0.013));
            
            const nResolved = Number.isFinite(nResolvedRaw) && nResolvedRaw > 0 ? nResolvedRaw : (nDefault || 0.013);
            const manningSource = manningOrigin === 'Material' ? `Material ${material}` : manningOrigin;

            return {
                id: keyId,
                cIni: up?.userDefinedId || '?',
                cFin: dw?.userDefinedId || '?',
                role,
                gravityRole_auto: p.gravityRole_auto as any,
                gravityRole_manual: p.gravityRole_manual as any,
                L_m: Number(p.length?.value || 0),
                DN_mm: dn_mm,
                Dint_mm: dint_mm,
                slope_permille: slope_pct * 10,
                material,
                isInitial,
                sdr,
                manning_n: nResolved,
                manning_origin: manningSource,
                P_edge: Number(p.P_edge ?? 0),
                D_Lphd: settings.D_L_per_hab_day || 150,
                R: settings.R_recovery || 0.8,
                C: settings.C_capacity || 1.0,
            };
        });

        return computeMinConditionForSegments(segmentsInput, {
            Qmd_Ls_bySegment,
            bsce_Ls_bySegment,
            isPublico: settings.projectType === 'Público',
            dnMin_mm: settings.projectType === 'Público' ? 200 : 175
        });

    }, [chambers, pipes, pipes1105, settings, results16]);

    // --- RENDERIZADO ---
    // --- TABLA 16: CÁLCULO (MÁX) ---
    const columns16Calc: DataTableColumn<Tabla16CalculoMax>[] = [
        { key: 'id_tramo', header: 'ID_TRAMO', width: 100, align: 'left', sticky: 'left' },
        { key: 'desde', header: 'C_INICIAL', width: 90, align: 'left', sticky: 'left' },
        { key: 'hasta', header: 'C_FINAL', width: 90, align: 'left', sticky: 'left' },
        { key: 'rol', header: 'ROL', width: 120, align: 'left' },
        { key: 'dn_mm', header: 'DN (mm)', width: 80, align: 'right' },
        {
            key: 'd_int_mm', header: 'Dint (mm)', width: 80, align: 'right',
            tooltip: (r) => r.d_int_mm === r.dn_mm ? 'Dint no definido; usando DN' : 'Diámetro interior hidráulico'
        },
        { key: 'l_m', header: 'L (m)', width: 80, align: 'right', format: v => fmt(v, 2) },
        {
            key: 'p_hab',
            header: 'P (hab)',
            width: 110,
            align: 'right',
            format: (_v, r) => {
                const pipe = pipeBySegmentId.get(r.segmentId);
                const value = Number(pipe?.P_edge ?? r.p_hab ?? 0);
                return (
                    <input
                        type="number"
                        min={0}
                        step={1}
                        value={Number.isFinite(value) ? value : 0}
                        onChange={(e) => {
                            const parsed = Number(e.target.value);
                            patchPipe(r.segmentId, { P_edge: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0 });
                        }}
                        style={{ width: '86px', textAlign: 'right', fontSize: '11px', padding: '2px 4px' }}
                        aria-label={`Población equivalente del tramo ${r.id_tramo}`}
                    />
                );
            },
            exportValue: r => roundExport(r.p_hab, 0)
        },
        {
            key: 'q_bsce_ref',
            header: 'BSCE (L/s)',
            width: 100,
            align: 'right',
            format: v => fmt(v as number, 3),
            exportValue: r => roundExport(r.q_bsce_ref, 3)
        },
        {
            key: 'hab_por_casa_usado',
            header: 'Hab/Casa',
            width: 110,
            align: 'right',
            format: (_v, r) => {
                const pipe = pipeBySegmentId.get(r.segmentId);
                const value = resolveEditableHabPorCasa(pipe, r.hab_por_casa_usado);
                return (
                    <input
                        type="number"
                        min={0.1}
                        step={0.1}
                        value={value}
                        onChange={(e) => {
                            const parsed = Number(e.target.value);
                            patchPipeHabPorCasa(r.segmentId, Number.isFinite(parsed) && parsed > 0 ? parsed : null);
                        }}
                        style={{ width: '86px', textAlign: 'right', fontSize: '11px', padding: '2px 4px' }}
                        aria-label={`Habitantes por vivienda del tramo ${r.id_tramo}`}
                    />
                );
            },
            exportValue: r => roundExport(r.hab_por_casa_usado, 2)
        },
        {
            key: 'metodo_qmax',
            header: 'MÉTODO',
            width: 130,
            align: 'left',
            tooltip: (r) => r.reason_method_qmax,
            format: v => <span style={{ fontWeight: 600 }}>{String(v ?? '—')}</span>
        },
        { key: 'q_md_as', header: 'QmdAS (L/s)', width: 100, align: 'right', format: v => fmt(v, 3) },
        {
            key: 'q_harmon_1000_interp',
            header: 'Q₁₀₀₀ interp. (L/s)',
            width: 110,
            align: 'right',
            format: (v, r) => r.metodo_qmax === 'INTERPOLACION' && v !== undefined ? fmt(v, 3) : '—'
        },
        {
            key: 't_interp',
            header: 't interp. (-)',
            width: 90,
            align: 'right',
            format: (v, r) => r.metodo_qmax === 'INTERPOLACION' && v !== undefined ? fmt(v, 4) : '—'
        },
        { key: 'q_max_h', header: 'Qmáx.h (L/s)', width: 100, align: 'right', format: v => fmt(v, 3) },
        { key: 'fp', header: 'Fp (Qmax/Qmd)', width: 70, align: 'right', format: v => fmt(v, 2) },
        {
            key: 'm_harmon',
            header: 'M Harmon',
            width: 90,
            align: 'right',
            format: (v, r) => {
                if (r.metodo_qmax === 'HARMON' && v !== undefined) return fmt(v, 3);
                if (r.metodo_qmax === 'INTERPOLACION') return '3,800 *';
                return '—';
            },
            tooltip: (r) => r.metodo_qmax === 'INTERPOLACION'
                ? 'M Harmon aplicado a P=1.000 hab como extremo superior de interpolación (Art. 6.6.1.1 caso 3)'
                : ''
        },
        { key: 'manning', header: 'Manning (n)', width: 90, align: 'right', format: v => fmt(v as number, 3) },
        {
            key: 'manning_origin',
            header: 'Origen Manning',
            width: 110,
            align: 'left',
            format: v => <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{v === 'Material' ? 'Automático' : v}</span>,
            exportValue: r => (r as any).manning_origin === 'Material' ? 'Automático' : (r as any).manning_origin
        },
        { key: 'q_cap', header: 'Qcap (L/s)', width: 100, align: 'right', format: v => fmt(v, 3) },
        { key: 'q_over_qcap', header: 'Q/Qcap (-)', width: 80, align: 'right', format: v => fmt(v, 2) },
        { key: 'h_over_d', header: 'h/D (-)', width: 80, align: 'right', format: v => fmt(v, 2) },
        { key: 'v_mps', header: 'V (m/s)', width: 80, align: 'right', format: v => fmt(v, 2) }
    ];

    // --- TABLA 16: VERIFICACIÓN (MÁX) ---
    const columns16Verif: DataTableColumn<Tabla16VerificacionMax>[] = [
        { key: 'id_tramo', header: 'ID_TRAMO', width: 100, align: 'left', sticky: 'left' },
        { key: 'desde', header: 'C_INICIAL', width: 90, align: 'left', sticky: 'left' },
        { key: 'hasta', header: 'C_FINAL', width: 90, align: 'left', sticky: 'left' },
        { key: 'dn_mm', header: 'DN (mm)', width: 80, align: 'right' },
        { key: 'd_int_mm', header: 'Dint (mm)', width: 80, align: 'right' },
        { key: 'l_m', header: 'L (m)', width: 80, align: 'right', format: v => fmt(v, 2) },
        { key: 'tipo_tramo', header: 'TIPO_TRAMO', width: 110, align: 'center', format: v => v === 'INICIAL' ? 'INICIAL' : 'NO INICIAL' },
        { key: 'i_min_rec_permil', header: 'I_MIN_REC (‰)', width: 95, align: 'right', format: v => typeof v === 'number' ? fmt(v, 0) : v },
        { key: 'i_crit_permil', header: 'I_CRIT (‰)', width: 90, align: 'right', format: v => typeof v === 'number' ? fmt(v, 0) : v },
        { key: 'i_eval_permil', header: 'I_EVAL (‰)', width: 90, align: 'right', format: v => fmt(v, 1) },
        {
            key: 'ok_pendiente',
            header: 'CHECK I',
            width: 70,
            align: 'center',
            format: (v, r) => <CheckIcon ok={(r.status === 'FUERA ALCANCE' || r.status === 'SIN CAUDAL') ? null : v} />,
            exportValue: r => (r.status === 'FUERA ALCANCE' || r.status === 'SIN CAUDAL') ? null : r.ok_pendiente
        },
        { key: 'hd_lim', header: 'h/D_LIM', width: 90, align: 'right', format: v => v.toFixed(2) },
        { key: 'hd_eval', header: 'h/D_EVAL', width: 90, align: 'right', format: v => v.toFixed(2) },
        { key: 'ok_hd', header: 'CHECK h/D', width: 85, align: 'center', format: v => <CheckIcon ok={v} />, exportValue: r => r.ok_hd },
        { key: 'v_lim', header: 'V_LIM', width: 90, align: 'right', format: v => v.toFixed(2) },
        { key: 'v_eval', header: 'V_EVAL', width: 90, align: 'right', format: v => v.toFixed(2) },
        { key: 'ok_v', header: 'CHECK V', width: 70, align: 'center', format: v => <CheckIcon ok={v} />, exportValue: r => r.ok_v },
        { key: 'ok_cap', header: 'CHECK QCAP', width: 90, align: 'center', format: v => <CheckIcon ok={v} />, exportValue: r => r.ok_cap },
        { key: 'l_acum_m', header: 'L_ACUM', width: 90, align: 'right', format: v => fmt(v, 1) },
        {
            key: 'dn_status', header: 'CHECK DN', width: 90, align: 'center',
            format: v => {
                if (v === 'APTO') return <CheckIcon ok={true} />;
                if (v === 'CONDICIONAL') return <AlertTriangle size={16} color="var(--warning)" />;
                return <CheckIcon ok={false} />;
            },
            exportValue: r => normalizeStatusText(r.dn_status)
        },
        {
            key: 'dn_reduction', header: 'CHECK RED.', width: 100, align: 'center',
            format: v => <CheckIcon ok={!v} />,
            exportValue: r => !r.dn_reduction
        },
        {
            key: 'status', header: 'ESTADO', width: 160, align: 'center',
            format: v => <StatusBadge status={v as StatusType} />,
            sticky: 'right',
            exportValue: r => normalizeStatusText(r.status)
        },
        {
            key: 'motivos_no_apto', header: 'MOTIVOS', width: 300, align: 'left',
            format: v => <span className="motivos-text">{(v as string[]).join(', ')}</span>,
            sticky: 'right',
            exportValue: r => r.motivos_no_apto.join(', ')
        }
    ];

    // mapa pipe_id -> pipe para selector de rol
    const pipeByKeyId = React.useMemo(() => {
        const m = new Map<string, typeof pipes[0]>();
        pipes.forEach(p => m.set(p.userDefinedId || p.id, p));
        return m;
    }, [pipes]);

    // --- TABLA 17: CÁLCULO (MIN) ---
    const columns17Calc: DataTableColumn<SegmentMinHydraulicResult>[] = [
        { key: 'id', header: 'ID_TRAMO', width: 110, align: 'left', sticky: 'left' },
        { key: 'tramoLabel', header: 'C_INI-C_FIN', width: 130, align: 'left' },
        {
            key: 'role',
            header: 'ROL',
            width: 140,
            align: 'left',
            format: (_v, r) => {
                const pipe = pipeByKeyId.get(r.id);
                if (!pipe) return '—';
                const eff = getEffectivePipe(pipe);
                
                return (
                    <span style={{ 
                        fontWeight: eff.source === 'manual' ? 700 : 400,
                        color: eff.source === 'manual' ? '#f59e0b' : 'inherit'
                    }}>
                        {eff.role}
                    </span>
                );
            },
            exportValue: r => r.role_isManual ? `${r.role} (Manual)` : r.role
        },
        { key: 'L_m', header: 'L (m)', width: 80, align: 'right', format: v => fmt(v as number, 2) },
        { key: 'DN_mm', header: 'DN (mm)', width: 80, align: 'right' },
        { key: 'Dint_mm', header: 'D_INT (mm)', width: 90, align: 'right', format: v => fmt(v as number, 1) },
        { key: 'I_eval_permille', header: 'I_EVAL (‰)', width: 90, align: 'right', format: v => fmt(v as number, 1) },
        { key: 'Qmin_Ls', header: 'Q VERIF. (L/s)', width: 100, align: 'right', format: v => fmt(v as number, 3) },
        { key: 'manning', header: 'Manning (n)', width: 90, align: 'right', format: v => fmt(v as number, 3) },
        {
            key: 'manning_origin',
            header: 'Origen Manning',
            width: 110,
            align: 'left',
            format: v => <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{v === 'Material' ? 'Automático' : v}</span>,
            exportValue: r => (r as any).manning_origin === 'Material' ? 'Automático' : (r as any).manning_origin
        },
        { key: 'Qcap_Ls', header: 'QCAP (L/s)', width: 100, align: 'right', format: v => fmt(v as number, 3) },
        { key: 'h_over_D', header: 'h/D (-)', width: 80, align: 'right', format: v => fmt(v as number, 2) },
        { key: 'V_ms', header: 'V (m/s)', width: 80, align: 'right', format: v => fmt(v as number, 2) },
        {
            key: 'id', header: 'TRACE', width: 70, align: 'center',
            format: (_, r) => <button className="btn-icon" onClick={() => setSelectedMinResult(r)} title="Ver Trazabilidad"><FileText size={16} /></button>
        }
    ];

    // --- TABLA 17: VERIFICACIÓN (MIN) ---
    const columns17Verif: DataTableColumn<SegmentMinHydraulicResult>[] = [
        { key: 'tramoLabel', header: 'Tramo', width: 100, align: 'left', sticky: 'left' },
        { key: 'Qmin_Ls', header: 'Q verif. (L/s)', width: 90, align: 'right', format: v => fmt(v as number, 3) },
        { key: 'DN_mm', header: 'DN (mm)', width: 80, align: 'right' },
        { key: 'I_eval_permille', header: 'Pendiente (‰)', width: 100, align: 'right', format: v => fmt(v as number, 1) },
        {
            key: 'limits', header: 'Pendiente mínima (‰)', width: 120, align: 'right',
            format: v => (v as any).I_min_permille.toFixed(0),
            exportValue: r => r.limits.I_min_permille
        },
        {
            key: 'checks', header: 'Cumple Pendiente', width: 125, align: 'center',
            format: v => (v as any).I ? <StatusBadge status="APTO" label="CUMPLE" /> : <StatusBadge status="NO_CUMPLE" label="NO CUMPLE" />,
            exportValue: r => r.checks.I ? 'CUMPLE' : 'NO CUMPLE'
        },
        { key: 'h_over_D', header: 'h/D', width: 70, align: 'right', format: v => fmt(v as number, 2) },
        {
            key: 'h_over_D', header: 'Check h/D ≥ 0.30', width: 110, align: 'center',
            format: (v) => {
                const ok = typeof v === 'number' && v >= 0.30;
                return <CheckIcon ok={ok} />;
            },
            exportValue: r => typeof r.h_over_D === 'number' ? r.h_over_D >= 0.30 : null
        },
        { key: 'V_ms', header: 'Vmin (m/s)', width: 100, align: 'right', format: v => fmt(v as number, 2) },
        {
            key: 'velocityStatus', header: 'Estado Velocidad', width: 125, align: 'center',
            format: v => <StatusBadge status={v as string} />,
            exportValue: r => r.velocityStatus
        },
        {
            key: 'status', header: 'Estado', width: 130, align: 'center', sticky: 'right',
            format: (v, r) => {
                const hdFail = typeof r.h_over_D === 'number' && r.h_over_D < 0.30;
                const effectiveStatus = hdFail ? 'NO_CUMPLE' : (v as string);
                return <StatusBadge status={effectiveStatus} />;
            },
            exportValue: r => {
                const hdFail = typeof r.h_over_D === 'number' && r.h_over_D < 0.30;
                return hdFail ? 'NO APTO' : normalizeStatusText(r.status);
            }
        }
    ];

    const canExport1105 = React.useMemo(() => {
        const hasVisibleModule = !!pipes && pipes.length > 0
            && settings.projectType !== 'Domiciliario'
            && !(settings.projectType === 'Mixto' && pipes1105.length === 0);

        return hasVisibleModule && (
            results16Data.tabla16Calculo.length > 0
            || results16Data.tabla16Verificacion.length > 0
            || results17.length > 0
        );
    }, [pipes, pipes1105.length, results16Data.tabla16Calculo.length, results16Data.tabla16Verificacion.length, results17.length, settings.projectType]);

    const exportSheets = React.useMemo(() => {
        if (!canExport1105) return [];

        const pipeBySegmentId = new Map(pipes1105.map((pipe) => [pipe.id, pipe]));
        const pipeByTramoId = new Map(pipes1105.map((pipe) => [pipe.userDefinedId || pipe.id, pipe]));

        const maxCalcByTramo = new Map<string, Tabla16CalculoMax>();
        const maxVerifByTramo = new Map<string, Tabla16VerificacionMax>();
        const minCalcByTramo = new Map<string, SegmentMinHydraulicResult>();

        const orderedTramos: string[] = [];
        const tramoSet = new Set<string>();
        const pushTramo = (tramoId: string) => {
            if (tramoSet.has(tramoId)) return;
            tramoSet.add(tramoId);
            orderedTramos.push(tramoId);
        };

        results16Data.tabla16Calculo.forEach((row: any) => {
            const tramoId = normalizeTramoId(row.id_tramo, row.segmentId);
            if (!maxCalcByTramo.has(tramoId)) {
                maxCalcByTramo.set(tramoId, row);
            }
            pushTramo(tramoId);
        });

        results16Data.tabla16Verificacion.forEach((row: any) => {
            const tramoId = normalizeTramoId(row.id_tramo, row.segmentId);
            if (!maxVerifByTramo.has(tramoId)) {
                maxVerifByTramo.set(tramoId, row);
            }
            pushTramo(tramoId);
        });

        results17.forEach((row) => {
            const tramoId = normalizeTramoId(row.id, row.tramoLabel);
            if (!minCalcByTramo.has(tramoId)) {
                minCalcByTramo.set(tramoId, row);
            }
            pushTramo(tramoId);
        });

        const datosTramosRows: DatosTramoExportRow[] = orderedTramos.map((tramo) => {
            const maxCalcRow = maxCalcByTramo.get(tramo);
            const maxVerifRow = maxVerifByTramo.get(tramo);
            const minCalcRow = minCalcByTramo.get(tramo);
            const pipe = (maxCalcRow?.segmentId ? pipeBySegmentId.get(maxCalcRow.segmentId) : undefined)
                ?? pipeByTramoId.get(tramo);

            let c_inicial_val = maxCalcRow?.desde ?? null;
            let c_final_val = maxCalcRow?.hasta ?? null;

            if (!c_inicial_val || c_inicial_val === '?' || c_inicial_val === '—') {
                c_inicial_val = 'N/A';
                console.warn(`C_INICIAL no definido para tramo: ${tramo}`);
            }
            if (!c_final_val || c_final_val === '?' || c_final_val === '—') {
                c_final_val = 'N/A';
                console.warn(`C_FINAL no definido para tramo: ${tramo}`);
            }

            return {
                tramo,
                c_inicial: c_inicial_val,
                c_final: c_final_val,
                p_hab: roundExport(maxCalcRow?.p_hab ?? 0, 0) ?? 0,
                hab_casa: roundExport(maxCalcRow?.hab_por_casa_usado ?? 0, 2) ?? 0,
                bsce_ls: roundExport(maxCalcRow?.q_bsce_ref ?? 0, 3) ?? 0,
                metodo: String(maxCalcRow?.metodo_qmax ?? '—'),
                rol: mapRoleForExport(maxCalcRow?.rol ?? minCalcRow?.role ?? (pipe ? getEffectivePipe(pipe).role : undefined)),
                dn_mm: roundExport(maxCalcRow?.dn_mm ?? minCalcRow?.DN_mm ?? 0, 0) ?? 0,
                dint_mm: roundExport(maxCalcRow?.d_int_mm ?? minCalcRow?.Dint_mm ?? 0, 0) ?? 0,
                material: String(pipe?.material?.value ?? '—'),
                manning: roundExport(maxCalcRow?.manning ?? minCalcRow?.manning ?? 0, 3) ?? 0,
                origen_manning: mapManningOriginForExport(maxCalcRow?.manning_origin ?? minCalcRow?.manning_origin ?? pipe?.manningOrigin),
                longitud_m: roundExport(maxCalcRow?.l_m ?? minCalcRow?.L_m ?? pipe?.length?.value ?? 0, 2) ?? 0,
                pendiente_permille: roundExport(maxVerifRow?.i_eval_permil ?? minCalcRow?.I_eval_permille ?? (maxCalcRow ? Number(maxCalcRow.i_pct) * 10 : 0), 1) ?? 0
            };
        });

        const calculoQmaxRows: CalculoQmaxExportRow[] = orderedTramos
            .map((tramo) => {
                const maxCalcRow = maxCalcByTramo.get(tramo);
                if (!maxCalcRow) return null;
                return {
                    tramo,
                    qmd_ls:        roundExport(maxCalcRow.q_md_as, 3),
                    m_harmon_1000: maxCalcRow.metodo_qmax === 'INTERPOLACION'
                        ? roundExport(1 + 14 / (4 + Math.sqrt(1000 / 1000)), 3)
                        : null,
                    q_harmon_1000: maxCalcRow.metodo_qmax === 'INTERPOLACION'
                        ? roundExport(maxCalcRow.q_harmon_1000_interp ?? null, 3)
                        : null,
                    t_interp:      maxCalcRow.metodo_qmax === 'INTERPOLACION'
                        ? roundExport(maxCalcRow.t_interp ?? null, 4)
                        : null,
                    fp_qmax_qmd:   roundExport(maxCalcRow.fp, 2),
                    m_harmon:      maxCalcRow.metodo_qmax === 'HARMON'
                        ? roundExport(maxCalcRow.m_harmon, 2)
                        : null,
                    qmax_ls:       roundExport(maxCalcRow.q_max_h, 3),
                    qcap_ls:       roundExport(maxCalcRow.q_cap, 3),
                    q_over_qcap:   roundExport(maxCalcRow.q_over_qcap, 2),
                    hd:            roundExport(maxCalcRow.h_over_d, 2),
                    velocidad_ms:  roundExport(maxCalcRow.v_mps, 2)
                };
            })
            .filter((row): row is CalculoQmaxExportRow => row !== null);

        const verificacionQmaxRows: VerificacionQmaxExportRow[] = orderedTramos
            .map((tramo) => {
                const maxVerifRow = maxVerifByTramo.get(tramo);
                if (!maxVerifRow) return null;
                const apto = maxVerifRow.ok_hd === true && maxVerifRow.ok_v === true;
                return {
                    tramo,
                    hd: roundExport(maxVerifRow.hd_eval, 2),
                    limite_hd: roundExport(maxVerifRow.hd_lim ?? 0.70, 2),
                    velocidad_ms: roundExport(maxVerifRow.v_eval, 2),
                    velocidad_max_norma_ms: roundExport(maxVerifRow.v_lim ?? 3.0, 2),
                    estado: apto ? 'APTO' : 'NO APTO'
                };
            })
            .filter((row): row is VerificacionQmaxExportRow => row !== null);

        const calculoQminRows: CalculoQminExportRow[] = orderedTramos
            .map((tramo) => {
                const minCalcRow = minCalcByTramo.get(tramo);
                if (!minCalcRow) return null;
                return {
                    tramo,
                    metodo_qmin: mapQminMethodForExport(minCalcRow.trace.basis),
                    qmin_ls: roundExport(minCalcRow.Qmin_Ls, 3),
                    qcap_ls: roundExport(minCalcRow.Qcap_Ls, 3),
                    hd: roundExport(minCalcRow.h_over_D, 2),
                    velocidad_ms: roundExport(minCalcRow.V_ms, 2)
                };
            })
            .filter((row): row is CalculoQminExportRow => row !== null);

        const verificacionQminRows: VerificacionQminExportRow[] = orderedTramos
            .map((tramo) => {
                const minCalcRow = minCalcByTramo.get(tramo);
                if (!minCalcRow) return null;
                return {
                    tramo,
                    qmin_ls: roundExport(minCalcRow.Qmin_Ls, 3),
                    dn_mm: roundExport(minCalcRow.DN_mm, 0),
                    pendiente_permille: roundExport(minCalcRow.I_eval_permille, 1),
                    pendiente_minima: roundExport(minCalcRow.limits.I_min_permille, 1),
                    cumple_pendiente: minCalcRow.checks.I ? 'CUMPLE' : 'NO CUMPLE',
                    hd: roundExport(minCalcRow.h_over_D, 2),
                    vmin_ms: roundExport(minCalcRow.V_ms, 2),
                    estado_velocidad: minCalcRow.velocityStatus ?? '—',
                    estado: normalizeStatusText(minCalcRow.status)
                };
            })
            .filter((row): row is VerificacionQminExportRow => row !== null);
        const resumenRows: ResumenHidraulicoExportRow[] = orderedTramos.map((tramo) => {
            const maxCalcRow = maxCalcByTramo.get(tramo);
            const maxVerifRow = maxVerifByTramo.get(tramo);
            const minCalcRow = minCalcByTramo.get(tramo);
            const pipe = (maxCalcRow?.segmentId ? pipeBySegmentId.get(maxCalcRow.segmentId) : undefined)
                ?? pipeByTramoId.get(tramo);

            const qmaxApto = maxVerifRow?.ok_hd === true && maxVerifRow?.ok_v === true;
            const qminStatus = minCalcRow?.status;

            let finalEstado = 'NO CUMPLE';
            if (qmaxApto && qminStatus === 'APTO') finalEstado = 'APTO';
            else if (qmaxApto && qminStatus === 'REVISAR') finalEstado = 'REVISAR';

            return {
                tramo,
                rol: mapRoleForExport(maxCalcRow?.rol ?? minCalcRow?.role ?? (pipe ? getEffectivePipe(pipe).role : undefined)),
                dn_mm: roundExport(maxCalcRow?.dn_mm ?? minCalcRow?.DN_mm, 0),
                dint_mm: roundExport(maxCalcRow?.d_int_mm ?? minCalcRow?.Dint_mm, 0),
                pendiente_permille: roundExport(maxVerifRow?.i_eval_permil ?? minCalcRow?.I_eval_permille ?? (maxCalcRow ? Number(maxCalcRow.i_pct) * 10 : null), 1),
                qmax_ls: roundExport(maxCalcRow?.q_max_h, 3),
                v_qmax_ms: roundExport(maxCalcRow?.v_mps, 2),
                hd_qmax: roundExport(maxCalcRow?.h_over_d, 2),
                qmin_ls: roundExport(minCalcRow?.Qmin_Ls, 3),
                v_qmin_ms: roundExport(minCalcRow?.V_ms, 2),
                hd_qmin: roundExport(minCalcRow?.h_over_D, 2),
                velocidad_max_norma_ms: roundExport(maxVerifRow?.v_lim ?? 3.0, 2),
                estado: finalEstado
            };
        });

        const datosTramosColumns: DataTableColumn<DatosTramoExportRow>[] = [
            { key: 'tramo', header: 'Tramo' },
            { key: 'c_inicial', header: 'C_INICIAL' },
            { key: 'c_final', header: 'C_FINAL' },
            { key: 'p_hab', header: 'P (hab)' },
            { key: 'hab_casa', header: 'Hab/Casa' },
            { key: 'bsce_ls', header: 'BSCE (L/s)' },
            { key: 'metodo', header: 'MÉTODO' },
            { key: 'rol', header: 'Rol' },
            { key: 'dn_mm', header: 'DN (mm)' },
            { key: 'dint_mm', header: 'Dint (mm)' },
            { key: 'material', header: 'Material' },
            { key: 'manning', header: 'Manning' },
            { key: 'longitud_m', header: 'Longitud (m)' },
            { key: 'pendiente_permille', header: 'Pendiente (‰)' }
        ];

        const calculoQmaxColumns: DataTableColumn<CalculoQmaxExportRow>[] = [
            { key: 'tramo',         header: 'Tramo' },
            { key: 'qmd_ls',        header: 'Qmd (L/s)' },
            { key: 'm_harmon_1000', header: 'M Harmon (P=1.000)' },
            { key: 'q_harmon_1000', header: 'Q₁₀₀₀ (L/s)' },
            { key: 't_interp',      header: 't interpolación' },
            { key: 'fp_qmax_qmd',   header: 'Fp (Qmax/Qmd)' },
            { key: 'm_harmon',      header: 'M Harmon (P>1.000)' },
            { key: 'qmax_ls',       header: 'Qmax (L/s)' },
            { key: 'qcap_ls',       header: 'Qcap (L/s)' },
            { key: 'q_over_qcap',   header: 'Qmax/Qcap (-)' },
            { key: 'hd',            header: 'h/D' },
            { key: 'velocidad_ms',  header: 'Velocidad (m/s)' }
        ];

        const verificacionQmaxColumns: DataTableColumn<VerificacionQmaxExportRow>[] = [
            { key: 'tramo', header: 'Tramo' },
            { key: 'hd', header: 'h/D' },
            { key: 'limite_hd', header: 'Límite h/D' },
            { key: 'velocidad_ms', header: 'Velocidad (m/s)' },
            { key: 'velocidad_max_norma_ms', header: 'Velocidad máx. norma (m/s)' },
            { key: 'estado', header: 'Estado' }
        ];

        const calculoQminColumns: DataTableColumn<CalculoQminExportRow>[] = [
            { key: 'tramo', header: 'Tramo' },
            { key: 'metodo_qmin', header: 'Criterio verif. autolavado' },
            { key: 'qmin_ls', header: 'Q verif. (L/s)' },
            { key: 'qcap_ls', header: 'Qcap (L/s)' },
            { key: 'hd', header: 'h/D' },
            { key: 'velocidad_ms', header: 'Velocidad (m/s)' }
        ];

        const verificacionQminColumns: DataTableColumn<VerificacionQminExportRow>[] = [
            { key: 'tramo', header: 'Tramo' },
            { key: 'qmin_ls', header: 'Q verif. (L/s)' },
            { key: 'dn_mm', header: 'DN (mm)' },
            { key: 'pendiente_permille', header: 'Pendiente (‰)' },
            { key: 'pendiente_minima', header: 'Pendiente mínima (‰)' },
            { key: 'cumple_pendiente', header: 'Cumple Pendiente' },
            { key: 'hd', header: 'h/D' },
            { key: 'vmin_ms', header: 'Vmin (m/s)' },
            { key: 'estado_velocidad', header: 'Estado Velocidad' },
            { key: 'estado', header: 'Estado' }
        ];

        const resumenColumns: DataTableColumn<ResumenHidraulicoExportRow>[] = [
            { key: 'tramo', header: 'Tramo' },
            { key: 'rol', header: 'Rol' },
            { key: 'dn_mm', header: 'DN (mm)' },
            { key: 'dint_mm', header: 'Dint (mm)' },
            { key: 'pendiente_permille', header: 'Pendiente (‰)' },
            { key: 'qmax_ls', header: 'Qmax (L/s)' },
            { key: 'v_qmax_ms', header: 'V Qmax (m/s)' },
            { key: 'hd_qmax', header: 'h/D Qmax' },
            { key: 'qmin_ls', header: 'Q verif. (L/s)' },
            { key: 'v_qmin_ms', header: 'V Q verif. (m/s)' },
            { key: 'hd_qmin', header: 'h/D Q verif.' },
            { key: 'velocidad_max_norma_ms', header: 'Velocidad máx. norma (m/s)' },
            { key: 'estado', header: 'Estado' }
        ];

        return [
            {
                sheetName: '1_DATOS_TRAMOS',
                title: '1. Datos de entrada por tramo',
                subtitle: 'Parámetros de entrada usados por el motor hidráulico',
                columns: datosTramosColumns as DataTableColumn<any>[],
                rows: datosTramosRows
            },
            {
                sheetName: '2_CALCULO_QMAX',
                title: '2. Cálculo hidráulico en condición de caudal máximo',
                subtitle: 'Valores provenientes del motor hidráulico existente',
                columns: calculoQmaxColumns as DataTableColumn<any>[],
                rows: calculoQmaxRows
            },
            {
                sheetName: '3_VERIFICACION_QMAX',
                title: '3. Verificación normativa para condición Qmax',
                subtitle: 'Límites: h/D <= 0.70 y V <= 3.0 m/s',
                columns: verificacionQmaxColumns as DataTableColumn<any>[],
                rows: verificacionQmaxRows
            },
            {
                sheetName: '4_CALCULO_QMIN',
                title: '4. Cálculo hidráulico – Verificación de autolavado',
                subtitle: 'Caudal de verificación según NCh1105 Art. 6.6.2 – BSCE entrega caudal máximo instantáneo (no mínimo)',
                columns: calculoQminColumns as DataTableColumn<any>[],
                rows: calculoQminRows
            },
            {
                sheetName: '5_VERIFICACION_QMIN',
                title: '5. Verificación hidráulica y normativa – Condición de autolavado',
                subtitle: 'Criterios: Pendiente >= I_min y Velocidad >= 0.60 m/s',
                columns: verificacionQminColumns as DataTableColumn<any>[],
                rows: verificacionQminRows
            },
            {
                sheetName: '6_RESUMEN_HIDRAULICO',
                title: '6. Resumen hidráulico consolidado del sistema',
                subtitle: 'Estado final APTO solo si cumple todas las verificaciones',
                columns: resumenColumns as DataTableColumn<any>[],
                rows: resumenRows
            }
        ];
    }, [canExport1105, pipes1105, results16Data.tabla16Calculo, results16Data.tabla16Verificacion, results17]);

    const handleExportExcel = React.useCallback(() => {
        if (exportSheets.length === 0) return;

        exportMultiSheetToExcel({
            fileName: buildDatedExcelFileName('nch1105_verificacion'),
            sheets: exportSheets
        });
    }, [exportSheets]);

    return (
        <div className="nch1105-pura">
            <div className="header-pro-main">
                <div className="title-group">
                    <Calculator className="icon-main" />
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h2>SMCAL_GRAV: NCh1105</h2>
                            <span className="norma-badge">Norma aplicada: NCh1105 – Redes públicas</span>
                        </div>
                        <p>Verificación Normativa Estricta (Motor Gravedad)</p>
                    </div>
                </div>
                <button
                    className="btn-export-excel"
                    onClick={handleExportExcel}
                    disabled={!canExport1105}
                    title="Exportar Excel"
                >
                    <FileSpreadsheet size={14} />
                    <span>Exportar Excel</span>
                </button>
            </div>

            {!pipes || pipes.length === 0 ? (
                <div className="results-empty-state" style={{ padding: '60px 20px' }}>
                    <Info size={40} style={{ opacity: 0.2, marginBottom: '16px' }} />
                    <p>No hay tuberías en el proyecto para verificar.</p>
                </div>
            ) : settings.projectType === 'Domiciliario' ? (
                <div className="results-empty-state" style={{ padding: '60px 20px' }}>
                    <ShieldCheck size={48} className="mb-16" style={{ opacity: 0.2 }} />
                    <p>El Proyecto es de tipo <strong>DOMICILIARIO</strong>.<br />
                        La verificación normativa se realiza mediante NCh3371.</p>
                </div>
            ) : settings.projectType === 'Mixto' && pipes1105.length === 0 ? (
                <div className="empty-nch-msg">
                    <Info size={20} />
                    <p>No existen tramos de red pública (NCh1105) para verificación en este proyecto Mixto.</p>
                </div>
            ) : (
                <>
                    <section className="gravity-section">
                        <div className="section-header">
                            <div className="dot max"></div>
                            <h3>Condición de Caudal Máximo</h3>
                        </div>

                        {/* Banner de alerta: tramos sin caudal */}
                        {sinCaudalRows.length > 0 && (
                            <div style={{
                                display: 'flex', alignItems: 'flex-start', gap: '12px',
                                padding: '12px 16px', marginBottom: '16px',
                                background: 'rgba(245, 158, 11, 0.10)',
                                border: '1px solid rgba(245, 158, 11, 0.40)',
                                borderRadius: 'var(--radius-md)',
                                color: '#f59e0b',
                            }}>
                                <Droplets size={20} style={{ flexShrink: 0, marginTop: '1px' }} />
                                <div style={{ fontSize: '0.88rem', lineHeight: 1.5 }}>
                                    <strong style={{ display: 'block', marginBottom: '2px' }}>
                                        {sinCaudalRows.length} tramo{sinCaudalRows.length > 1 ? 's' : ''} sin caudal asignado
                                    </strong>
                                    Los tramos <strong>{sinCaudalRows.map(r => r.id_tramo).join(', ')}</strong> tienen
                                    población acumulada P&nbsp;=&nbsp;0 y no pueden ser calculados ni verificados
                                    bajo NCh1105. Verifique la acumulación de población en el proyecto.
                                </div>
                            </div>
                        )}

                        <DataTable
                            title="1. CÁLCULO HIDRÁULICO (Qmáx.h)"
                            columns={columns16Calc}
                            rows={results16Data.tabla16Calculo}
                            rowKey={r => r.segmentId}
                            density="compact"
                            maxHeight="400px"
                            rowClassName={(r) => r.sinCaudal ? 'row-sin-caudal' : ''}
                        />

                        <div className="mt-16">
                            <DataTable
                                title="2. VERIFICACIÓN NCh 1105 – Condición de Caudal Máximo"
                                columns={columns16Verif}
                                rows={results16Data.tabla16Verificacion}
                                rowKey={r => r.segmentId}
                                density="compact"
                                maxHeight="300px"
                                rowClassName={(r) => r.sinCaudal ? 'row-sin-caudal' : ''}
                            />
                        </div>
                    </section>

                    <section className="gravity-section mt-32">
                        <div className="section-header">
                            <div className="dot min"></div>
                            <h3>Condición de Caudal Mínimo</h3>
                        </div>

                        {results17.length === 0 ? (
                            <div className="empty-table-msg">Sin tramos válidos para evaluación de Qmín.</div>
                        ) : (
                            <>
                                <DataTable
                                    title="3. CÁLCULO HIDRÁULICO (Qmín)"
                                    columns={columns17Calc}
                                    rows={results17}
                                    rowKey={r => r.id}
                                    density="compact"
                                    maxHeight="350px"
                                />

                                <div className="mt-16">
                                    <DataTable
                                        title="4. VERIFICACIÓN NCh 1105 – Condición de Caudal Mínimo"
                                        columns={columns17Verif}
                                        rows={results17}
                                        rowKey={r => r.id}
                                        density="compact"
                                        maxHeight="350px"
                                    />
                                </div>
                            </>
                        )}
                    </section>
                </>
            )}

            {selectedMinResult && (
                <TraceModal
                    result={selectedMinResult}
                    onClose={() => setSelectedMinResult(null)}
                />
            )}

            <div className="footer-info mt-32">
                <Info size={16} />
                <p>
                    <strong>Trazabilidad Condición Mínima:</strong> Pendientes evaluadas entre bordes de cámara. Qmín según rol normativo. h/D ≥ 0.30 para autolavado.
                </p>
            </div>

            <InverseCapacityPanel />

            <style>{`
                .nch1105-pura { padding: 24px; color: var(--text-primary); }
                .header-pro-main { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; border-bottom: 2px solid var(--accent); padding-bottom: 16px; }
                .header-pro-main h2 { margin: 0; font-size: 1.4rem; font-weight: 800; color: var(--accent); }
                .header-pro-main p { margin: 4px 0 0; color: var(--text-secondary); font-size: 0.9rem; }
                .title-group { display: flex; align-items: center; gap: 16px; }
                .icon-main { color: var(--accent); width: 28px; height: 28px; }
 
                .norma-badge { background: var(--accent); color: white; font-size: 10px; padding: 2px 8px; border-radius: 4px; font-weight: 600; text-transform: uppercase; margin-left: 8px; }
                .empty-nch-msg { display: flex; align-items: center; gap: 12px; padding: 20px; background: var(--surface-alt); border: 1px dashed var(--border); border-radius: var(--radius-md); color: var(--text-secondary); margin: 20px 0; }
                .empty-nch-msg p { margin: 0; font-weight: 500; }
                .empty-table-msg { padding: 20px; text-align: center; color: var(--text-muted); font-style: italic; background: var(--surface-alt); border-radius: var(--radius-md); }

                .gravity-section { background: rgba(var(--surface-rgb), 0.5); border-radius: var(--radius-lg); padding: 24px; border: 1px solid var(--border); margin-bottom: 32px; box-shadow: var(--shadow-sm); }
                .section-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
                .section-header h3 { margin: 0; font-size: 1.2rem; font-weight: 700; color: var(--text-primary); }
                .dot { width: 12px; height: 12px; border-radius: 50%; }
                .dot.max { background: #ef4444; box-shadow: 0 0 12px rgba(239, 68, 68, 0.5); }
                .dot.min { background: #10b981; box-shadow: 0 0 12px rgba(16, 185, 129, 0.5); }

                .btn-export-excel { display: inline-flex; align-items: center; gap: 6px; border: 1px solid rgba(16, 185, 129, 0.35); background: rgba(16, 185, 129, 0.12); color: #059669; border-radius: 6px; font-size: 0.78rem; font-weight: 600; padding: 6px 10px; cursor: pointer; transition: all 0.2s; }
                .btn-export-excel:hover:not(:disabled) { background: rgba(16, 185, 129, 0.2); border-color: rgba(16, 185, 129, 0.55); }
                .btn-export-excel:disabled { opacity: 0.45; cursor: not-allowed; }

                .btn-icon { background: var(--surface-alt); border: 1px solid var(--border-soft); color: var(--accent); padding: 5px; border-radius: var(--radius-sm); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
                .btn-icon:hover { background: var(--accent-soft); border-color: var(--accent); transform: scale(1.05); }

                .motivos-text {
                    font-size: 11px;
                    line-height: 1.3;
                    color: var(--text-secondary);
                    display: block;
                    white-space: normal;
                    word-break: break-word;
                    overflow-wrap: anywhere;
                }
                .footer-info { display: flex; align-items: center; gap: 12px; padding: 14px 22px; background: var(--accent-soft); border-radius: var(--radius-md); color: var(--accent); font-size: 0.9rem; border: 1px solid var(--accent-muted); }
                .footer-info p { margin: 0; }

                /* ============================================================
                   TABLAS NCh1105 - SISTEMA UNIFICADO
                   Usar solo variables CSS del sistema
                   ============================================================ */
                
                /* Contenedor de tabla -干净的 */
                .nch1105-pura .dt-card {
                    background: var(--surface);
                    border: 1px solid var(--border);
                    border-radius: var(--radius-md);
                    overflow: hidden;
                }
                
                /* Header de tabla */
                .nch1105-pura .dt-header {
                    background: var(--surface-alt);
                    border-bottom: 1px solid var(--border);
                    padding: 12px 16px;
                }
                
                /* Tabla base */
                .nch1105-pura .dt-table {
                    width: 100%;
                    border-collapse: collapse;
                    background: var(--surface);
                }
                
                /* Headers de columna - uniformados */
                .nch1105-pura .dt-th,
                .nch1105-pura .dt-th.dt-sticky-left,
                .nch1105-pura .dt-th.dt-sticky-right,
                .nch1105-pura .data-table-container th {
                    background: var(--surface-alt) !important;
                    color: var(--text-secondary) !important;
                    border-bottom: 1px solid var(--border) !important;
                    font-size: 11px;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    padding: 10px 12px;
                    text-align: left;
                    white-space: nowrap;
                }
                
                /* Unidad en header */
                .nch1105-pura .dt-th-unit {
                    color: var(--text-muted) !important;
                    font-weight: 400;
                    font-size: 9px;
                }
                
                /* Celdas de datos */
                .nch1105-pura .dt-td {
                    background: var(--surface) !important;
                    color: var(--text-primary) !important;
                    border-bottom: 1px solid var(--border-soft) !important;
                    font-size: 13px;
                    font-weight: 500;
                    padding: 8px 12px;
                    vertical-align: middle;
                }
                
                /* Celdas sticky - z-index bajo, background sólido */
                .nch1105-pura .dt-td.dt-sticky-left,
                .nch1105-pura .dt-td.dt-sticky-right {
                    background: var(--surface) !important;
                    color: var(--text-primary) !important;
                    position: sticky;
                    z-index: 2;
                }
                
                /* Headers sticky */
                .nch1105-pura .dt-th.dt-sticky-left,
                .nch1105-pura .dt-th.dt-sticky-right {
                    position: sticky;
                    z-index: 3;
                    background: var(--surface-alt) !important;
                }
                
                /* Sombra subtle para columnas sticky */
                .nch1105-pura .dt-th.dt-sticky-left,
                .nch1105-pura .dt-td.dt-sticky-left {
                    box-shadow: 2px 0 4px rgba(0, 0, 0, 0.1);
                }
                .nch1105-pura .dt-th.dt-sticky-right,
                .nch1105-pura .dt-td.dt-sticky-right {
                    box-shadow: -2px 0 4px rgba(0, 0, 0, 0.1);
                }
                
                /* Zebra - variación suave con rgba */
                .nch1105-pura .dt-zebra tr:nth-child(even) .dt-td {
                    background: rgba(0, 0, 0, 0.02) !important;
                }
                .nch1105-pura .dt-zebra tr:nth-child(even) .dt-td.dt-sticky-left,
                .nch1105-pura .dt-zebra tr:nth-child(even) .dt-td.dt-sticky-right {
                    background: rgba(0, 0, 0, 0.02) !important;
                }
                
                /* Hover - usar accent con opacity baja */
                .nch1105-pura .dt-hover tr:hover .dt-td,
                .nch1105-pura .data-table-container tr:hover {
                    background: rgba(65, 199, 255, 0.08) !important;
                }
                .nch1105-pura .dt-hover tr:hover .dt-td.dt-sticky-left,
                .nch1105-pura .dt-hover tr:hover .dt-td.dt-sticky-right {
                    background: rgba(65, 199, 255, 0.08) !important;
                }
                
                /* Fila seleccionada */
                .nch1105-pura .dt-table tr.is-selected .dt-td {
                    background: rgba(65, 199, 255, 0.15) !important;
                    color: var(--accent) !important;
                    font-weight: 600;
                }
                .nch1105-pura .dt-table tr.is-selected .dt-td.dt-sticky-left,
                .nch1105-pura .dt-table tr.is-selected .dt-td.dt-sticky-right {
                    background: rgba(65, 199, 255, 0.15) !important;
                }
                
                /* Filas sin caudal - warning sutil */
                .nch1105-pura .row-sin-caudal td {
                    background-color: rgba(245, 158, 11, 0.08) !important;
                    color: var(--warning) !important;
                }
                
                /* Celdas de texto secundario */
                .nch1105-pura .motivos-text,
                .nch1105-pura .results-cell-norma,
                .nch1105-pura .results-cell-role {
                    color: var(--text-secondary) !important;
                }
                
                /* Badges */
                .nch1105-pura .dt-td .results-badge,
                .nch1105-pura .dt-td .results-check-badge {
                    border-color: var(--border);
                }

                /* DataGrid-like styles - también unificados */
                .data-table-container th { 
                    background-color: var(--surface-alt) !important; 
                    font-weight: 600 !important; 
                    color: var(--text-secondary) !important; 
                    text-transform: uppercase; 
                    font-size: 11px; 
                    letter-spacing: 0.05em; 
                    border-bottom: 1px solid var(--border);
                }
                .data-table-container tr:nth-child(even) { 
                    background-color: rgba(0, 0, 0, 0.02); 
                }
                .data-table-container tr:hover { 
                    background-color: rgba(65, 199, 255, 0.08) !important; 
                }
                .row-sin-caudal td { 
                    background-color: rgba(245, 158, 11, 0.08) !important; 
                }
                .row-sin-caudal:hover td { 
                    background-color: rgba(245, 158, 11, 0.12) !important; 
                }

                .results-empty-state { 
                    padding: 80px 20px; 
                    text-align: center; 
                    color: var(--text-secondary); 
                    background: var(--surface-alt); 
                    border-radius: var(--radius-lg); 
                    border: 1px dashed var(--border); 
                    margin: 20px 0; 
                    display: flex; 
                    flex-direction: column; 
                    align-items: center; 
                    justify-content: center; 
                    width: 100%; 
                }
                .results-empty-state p { 
                    font-size: 1.1rem; 
                    max-width: 400px; 
                    line-height: 1.5; 
                    margin-top: 16px; 
                }

                .mt-16 { margin-top: 16px; }
                .mt-32 { margin-top: 32px; }
                .mb-16 { margin-bottom: 16px; }
            `}</style>
        </div>
    );
};
