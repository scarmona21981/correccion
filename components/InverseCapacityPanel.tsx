/**
 * InverseCapacityPanel
 *
 * Módulo UI autónomo para el análisis inverso de capacidad.
 * No modifica el motor principal ni sus resultados.
 *
 * Uso: colocado dentro de NCh1105VerificationTables, debajo de los resultados existentes.
 */

import React from 'react';
import {
    Zap, ChevronDown, RefreshCw, AlertTriangle,
    CheckCircle2, XCircle, Minus, Info, TrendingUp
} from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { useView } from '../context/ViewContext';
import { getEffectivePipe } from '../utils/getEffectivePipe';
import {
    InverseMode,
    InverseResult,
    InverseStatus
} from '../hydraulics/inverseCapacityEngine';
import { useInverseCapacity } from '../application/hooks';
import { ImprovementModal } from './ImprovementModal';

// ─── Helpers de formato ───────────────────────────────────────────────────────

const fmt = (v: number | undefined, dec = 2): string => {
    if (v === undefined || v === null || !Number.isFinite(v)) return '—';
    return v.toLocaleString('es-CL', { minimumFractionDigits: dec, maximumFractionDigits: dec });
};

/** Formatea población entera con separador de miles */
const fmtPop = (v: number | undefined): string => {
    if (v === undefined || !Number.isFinite(v)) return '—';
    if (v >= 1_000_000) return '> 1.000.000';
    return Math.round(v).toLocaleString('es-CL');
};

/**
 * Formatea ΔP en habitantes con signo explícito.
 * Nunca clampea; refleja el valor matemático real.
 */
const fmtDeltaHab = (deltaHab: number, norma: string): string => {
    if (norma !== 'NCh1105') return '—';
    if (!Number.isFinite(deltaHab)) return '—';
    const rounded = Math.round(deltaHab);
    if (rounded > 0) return `+${rounded.toLocaleString('es-CL')} hab`;
    if (rounded < 0) return `${rounded.toLocaleString('es-CL')} hab`;
    return '0 hab';
};

/**
 * Formatea ΔP en porcentaje.
 * deltaHab / Pbase * 100, sin clamp.
 */
const fmtDeltaPct = (deltaHab: number, Pbase: number, norma: string): string => {
    if (norma !== 'NCh1105') return '—';
    if (!Number.isFinite(deltaHab) || Pbase <= 0) return 'N/A';
    const pct = (deltaHab / Pbase) * 100;
    if (!Number.isFinite(pct)) return 'N/A';
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(1)}%`;
};

// ─── Cálculo de deltaHab y estado UI ─────────────────────────────────────────

/**
 * deltaHab = Pmax - Pbase (valor matemático real, sin clamp).
 * El status visual se recalcula aquí desde deltaHab y deltaPct.
 *
 * Reglas (req. 3):
 *   CRITICAL  → deltaHab < 0
 *   LIMITED   → deltaHab >= 0 && deltaPct < 15
 *   OK        → deltaPct >= 15
 *   NA        → norma !== NCh1105 o Pbase = 0 y Pmax = 0
 */
function computeDisplayStatus(result: InverseResult): {
    deltaHab: number;
    deltaPct: number;
    status: InverseStatus;
} {
    try {
        if (result.status === 'NA' || result.status === 'ERROR') {
            return { deltaHab: 0, deltaPct: 0, status: result.status };
        }

        if (result.norma !== 'NCh1105') {
            const dq = Number.isFinite(result.deltaP) ? result.deltaP : 0;
            const status: InverseStatus = dq < 0 ? 'CRITICAL' : dq < 0.15 ? 'LIMITED' : 'OK';
            return { deltaHab: 0, deltaPct: dq * 100, status };
        }

        const deltaHab = (Number.isFinite(result.Pmax) ? result.Pmax : 0)
            - (Number.isFinite(result.Pbase) ? result.Pbase : 0);
        const deltaPct = (result.Pbase > 0)
            ? (deltaHab / result.Pbase) * 100
            : (result.Pmax > 0 ? 9999 : 0);

        let status: InverseStatus;
        if (deltaHab < 0) {
            status = 'CRITICAL';
        } else if (deltaPct >= 15) {
            status = 'OK';
        } else {
            status = 'LIMITED';
        }

        return { deltaHab, deltaPct, status };
    } catch {
        return { deltaHab: 0, deltaPct: 0, status: 'ERROR' };
    }
}

// ─── Error Boundary ───────────────────────────────────────────────────────────

class InverseErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { hasError: boolean; message: string }
> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false, message: '' };
    }
    static getDerivedStateFromError(error: any) {
        return { hasError: true, message: String(error?.message || error) };
    }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    padding: '16px 20px',
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: '8px',
                    color: '#ef4444',
                    fontSize: '0.8rem'
                }}>
                    <strong>Error en Análisis Inverso:</strong> {this.state.message}
                    <button
                        onClick={() => this.setState({ hasError: false, message: '' })}
                        style={{
                            marginLeft: '12px', fontSize: '0.75rem', padding: '2px 10px',
                            background: 'transparent', border: '1px solid #ef4444',
                            borderRadius: '4px', color: '#ef4444', cursor: 'pointer'
                        }}
                    >Reintentar</button>
                </div>
            );
        }
        return this.props.children;
    }
}

// ─── Componentes visuales ─────────────────────────────────────────────────────

const statusColor: Record<InverseStatus, string> = {
    OK: '#10b981',
    LIMITED: '#f59e0b',
    CRITICAL: '#ef4444',
    NA: '#6b7280',
    ERROR: '#dc2626'
};

const statusLabel: Record<InverseStatus, string> = {
    OK: 'OK',
    LIMITED: 'LIMITADO',
    CRITICAL: 'SOBRECARGADO',
    NA: 'N/A',
    ERROR: 'ERROR'
};

const StatusPill: React.FC<{ status: InverseStatus }> = ({ status }) => (
    <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '999px',
        background: `${statusColor[status]}22`,
        color: statusColor[status],
        fontWeight: 700,
        fontSize: '10px',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        border: `1px solid ${statusColor[status]}55`,
        whiteSpace: 'nowrap'
    }}>
        {status === 'OK' && <CheckCircle2 size={11} />}
        {status === 'LIMITED' && <AlertTriangle size={11} />}
        {status === 'CRITICAL' && <XCircle size={11} />}
        {status === 'NA' && <Minus size={11} />}
        {status === 'ERROR' && <XCircle size={11} />}
        {statusLabel[status]}
    </span>
);

// ─── Cache para evitar recálculos si los inputs no cambiaron ─────────────────

let _cacheKey: string | null = null;
let _cacheResults: Record<string, InverseResult> | null = null;

function buildCacheKey(
    pipes: any[],
    settings: any,
    mode: InverseMode,
    selectedPipeId?: string | null
): string {
    const pids = pipes.map(p =>
        [
            p.id,
            p.diameter?.value ?? p.diameter ?? 0,
            p.isSlopeManual ? (p.manualSlope?.value ?? 0) : (p.slope?.value ?? p.slope ?? 0),
            p.material?.value ?? p.material ?? 'PVC',
            p.hydraulics?.inputs?.P_edge ?? 0,
            p.hydraulics?.Q_design_Lps ?? p.Q_design_Lps ?? 0
        ].join(':')
    ).join('|');
    const sKey = `${settings.populationTotal}:${settings.D_L_per_hab_day}:${settings.R_recovery}:${settings.C_capacity}:${settings.projectType}`;
    return `${mode}:${selectedPipeId || ''}:${pids}:${sKey}`;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export const InverseCapacityPanel: React.FC = () => {
    const { chambers, pipes, settings } = useProject();
    const { selectedIds } = useView();

    const [mode, setMode] = React.useState<InverseMode>('COLLECTORS_ONLY');
    const [results, setResults] = React.useState<Record<string, InverseResult>>({});
    const [isRunning, setIsRunning] = React.useState(false);
    const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
    const [lastCacheKey, setLastCacheKey] = React.useState<string | null>(null);
    const [expanded, setExpanded] = React.useState(true);
    const [tooltipPipeId, setTooltipPipeId] = React.useState<string | null>(null);
    const [improvementPipe, setImprovementPipe] = React.useState<{ pipe: any; Pbase: number } | null>(null);

    // Pipe seleccionado
    const selectedPipeId = React.useMemo(() => {
        const arr = Array.from(selectedIds);
        return arr.find(id => pipes.some(p => p.id === id)) ?? null;
    }, [selectedIds, pipes]);

    // Pipes según modo
    const pipesToEvaluate = React.useMemo(() => {
        if (mode === 'COLLECTORS_ONLY') {
            return pipes.filter(p => getEffectivePipe(p).regime === 'NCH1105');
        }
        if (mode === 'ALL_PIPES') return pipes;
        if (mode === 'SELECTED_ONLY' && selectedPipeId) {
            return pipes.filter(p => p.id === selectedPipeId);
        }
        return [];
    }, [mode, pipes, selectedPipeId]);

    const label_button = React.useMemo(() => {
        if (mode === 'COLLECTORS_ONLY') return 'Calcular capacidad (colectores)';
        if (mode === 'ALL_PIPES') return 'Calcular capacidad (todos)';
        return 'Calcular capacidad (tramo)';
    }, [mode]);

    const isButtonDisabled =
        isRunning ||
        pipesToEvaluate.length === 0 ||
        (mode === 'SELECTED_ONLY' && !selectedPipeId);

    const { results: hookResults, isRunning: hookIsRunning, progress: hookProgress } = useInverseCapacity({
        pipes: pipesToEvaluate,
        settings,
        mode,
        selectedPipeId,
        enabled: pipesToEvaluate.length > 0
    });

    React.useEffect(() => {
        if (hookResults) {
            setResults(hookResults);
        }
    }, [hookResults]);

    React.useEffect(() => {
        setIsRunning(hookIsRunning);
    }, [hookIsRunning]);

    React.useEffect(() => {
        setProgress(hookProgress);
    }, [hookProgress]);

    // Filas con estado UI recalculado
    const rows = React.useMemo(() => {
        try {
            return pipesToEvaluate.map(p => {
                const r = results[p.id];
                const label = p.userDefinedId || p.id;
                const display = r ? computeDisplayStatus(r) : null;
                return { pipe: p, label, result: r, display };
            });
        } catch {
            return [];
        }
    }, [pipesToEvaluate, results]);

    const hasResults = rows.some(r => r.result !== undefined);
    const summaryOK = rows.filter(r => r.display?.status === 'OK').length;
    const summaryLimited = rows.filter(r => r.display?.status === 'LIMITED').length;
    const summaryCritical = rows.filter(r => r.display?.status === 'CRITICAL').length;

    // Cabeceras definidas fuera del componente (ver const HEADERS arriba)

    return (
        <InverseErrorBoundary>
            <section style={{
                marginTop: '24px',
                background: 'rgba(16, 185, 129, 0.04)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: '10px',
                overflow: 'hidden'
            }}>
                {/* ── Header colapsable ── */}
                <button
                    onClick={() => setExpanded(v => !v)}
                    style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '14px 20px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-primary)',
                        textAlign: 'left',
                        borderBottom: expanded ? '1px solid rgba(16,185,129,0.2)' : 'none'
                    }}
                >
                    <TrendingUp size={18} color="#10b981" />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontWeight: 700, fontSize: '1rem', color: '#10b981', lineHeight: 1.2 }}>
                            Análisis Inverso de Capacidad — P soportable / ΔP por tramo
                        </span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                            P soportable: población máxima que cumple normativamente en el tramo con la configuración actual de aportes.
                        </span>
                    </div>
                    <span style={{
                        marginLeft: 'auto',
                        color: 'var(--text-muted)',
                        transition: 'transform 0.2s',
                        transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        flexShrink: 0
                    }}>
                        <ChevronDown size={16} />
                    </span>
                </button>

                {expanded && (
                    <div style={{ padding: '16px 20px' }}>

                        {/* ── Controls ── */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>

                            {/* Selector de modo */}
                            <div style={{
                                display: 'flex',
                                border: '1px solid var(--border)',
                                borderRadius: '6px',
                                overflow: 'hidden',
                                background: 'var(--surface)'
                            }}>
                                {(['COLLECTORS_ONLY', 'ALL_PIPES', 'SELECTED_ONLY'] as InverseMode[]).map(m => (
                                    <button
                                        key={m}
                                        onClick={() => setMode(m)}
                                        style={{
                                            padding: '6px 12px',
                                            fontSize: '0.75rem',
                                            fontWeight: mode === m ? 700 : 400,
                                            border: 'none',
                                            borderRight: m !== 'SELECTED_ONLY' ? '1px solid var(--border)' : 'none',
                                            background: mode === m ? '#10b981' : 'transparent',
                                            color: mode === m ? 'white' : 'var(--text-muted)',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        {m === 'COLLECTORS_ONLY' && 'Solo colectores'}
                                        {m === 'ALL_PIPES' && 'Todos los tramos'}
                                        {m === 'SELECTED_ONLY' && 'Tramo seleccionado'}
                                    </button>
                                ))}
                            </div>

                            {/* Botón ejecutar - ejecuta automáticamente via hook */}
                            <button
                                onClick={() => {}}
                                disabled={true}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '7px 16px',
                                    background: isButtonDisabled ? 'var(--surface-alt)' : '#10b981',
                                    color: isButtonDisabled ? 'var(--text-muted)' : 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: isButtonDisabled ? 'not-allowed' : 'pointer',
                                    fontWeight: 600,
                                    fontSize: '0.8rem',
                                    transition: 'all 0.2s',
                                    opacity: isButtonDisabled ? 0.6 : 1
                                }}
                                title={
                                    mode === 'SELECTED_ONLY' && !selectedPipeId
                                        ? 'Seleccione un tramo en el canvas'
                                        : pipesToEvaluate.length === 0
                                            ? 'Sin tramos para evaluar en este modo'
                                            : label_button
                                }
                            >
                                {isRunning
                                    ? <RefreshCw size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
                                    : <Zap size={14} />
                                }
                                {label_button}
                            </button>

                            {/* Progreso */}
                            {isRunning && progress && (
                                <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>
                                    {progress.done}/{progress.total} tramos…
                                </span>
                            )}

                            {/* Info selección */}
                            {mode === 'SELECTED_ONLY' && !selectedPipeId && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Info size={12} /> Seleccione un tramo en el canvas
                                </span>
                            )}
                            {mode === 'SELECTED_ONLY' && selectedPipeId && (
                                <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 500 }}>
                                    Tramo: {pipes.find(p => p.id === selectedPipeId)?.userDefinedId || selectedPipeId}
                                </span>
                            )}
                        </div>

                        {/* ── KPI chips ── */}
                        {hasResults && (
                            <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
                                {[
                                    { label: 'OK', val: summaryOK, color: '#10b981' },
                                    { label: 'LIMITADO', val: summaryLimited, color: '#f59e0b' },
                                    { label: 'SOBRECARGADO', val: summaryCritical, color: '#ef4444' }
                                ].map(k => (
                                    <div key={k.label} style={{
                                        padding: '6px 14px',
                                        borderRadius: '6px',
                                        background: `${k.color}15`,
                                        border: `1px solid ${k.color}40`,
                                        color: k.color,
                                        fontWeight: 700,
                                        fontSize: '0.78rem',
                                        display: 'flex',
                                        gap: '6px',
                                        alignItems: 'center'
                                    }}>
                                        <span style={{ fontSize: '1.1rem' }}>{k.val}</span>
                                        <span style={{ fontWeight: 400, opacity: 0.8 }}>{k.label}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* ── Tabla de resultados ── */}
                        {hasResults && (
                            <div style={{ overflowX: 'auto', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                <table className="table-pro compact zebra hover">
                                    <thead>
                                        <tr>
                                            {HEADERS.map(h => (
                                                <th
                                                    key={h.label}
                                                    title={h.tooltip}
                                                    className={h.align === 'right' ? 'numeric' : h.align === 'center' ? 'center' : ''}
                                                    style={{ cursor: h.tooltip ? 'help' : 'default' }}
                                                >
                                                    {h.label}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map(({ pipe, label, result, display }, idx) => {
                                            if (!result || !display) {
                                                return (
                                                    <tr key={pipe.id}>
                                                        <td style={{ fontWeight: 600 }}>{label}</td>
                                                        <td colSpan={10} style={{ fontStyle: 'italic' }}>
                                                            Sin resultado
                                                        </td>
                                                    </tr>
                                                );
                                            }

                                            const eff = getEffectivePipe(pipe);
                                            const roleLabel =
                                                eff.role === 'COLECTOR' ? 'Colector' :
                                                    eff.role === 'LATERAL' ? 'Lateral' :
                                                        eff.role === 'INTERIOR_RAMAL' ? 'Interior/Ramal' : 'Descarga Horiz.';

                                            const { deltaHab, deltaPct, status } = display;
                                            const isNch = result.norma === 'NCh1105';

                                            // Color ΔP (hab)
                                            const deltaHabColor =
                                                status === 'CRITICAL' ? '#ef4444' :
                                                    status === 'LIMITED' ? '#f59e0b' : '#10b981';

                                            const showTooltip = tooltipPipeId === pipe.id;

                                            return (
                                                <tr key={pipe.id}>
                                                    {/* Tramo */}
                                                    <td style={{ padding: '6px 10px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                                        {label}
                                                    </td>

                                                    {/* Rol */}
                                                    <td style={{ padding: '6px 10px', color: 'var(--text-secondary)', fontSize: '11px' }}>
                                                        {roleLabel}
                                                    </td>

                                                    {/* P base */}
                                                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                                                        {isNch ? fmtPop(result.Pbase) : '—'}
                                                    </td>

                                                    {/* Q base */}
                                                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                                                        {fmt(result.Qbase_lps, 3)}
                                                    </td>

                                                    {/* Q lim (informativo) */}
                                                    <td style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text-muted)' }}>
                                                        {fmt(result.Qlim_lps, 3)}
                                                    </td>

                                                    {/* Q full (informativo) */}
                                                    <td style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text-muted)' }}>
                                                        {fmt(result.Qfull_lps, 3)}
                                                    </td>

                                                    {/* P soportable */}
                                                    <td style={{
                                                        padding: '6px 10px',
                                                        textAlign: 'right',
                                                        fontWeight: 700,
                                                        color: status === 'CRITICAL' ? '#ef4444' : 'var(--text-primary)'
                                                    }}>
                                                        {isNch ? fmtPop(result.Pmax) : (status === 'NA' ? 'N/A' : '—')}
                                                    </td>

                                                    {/* ΔP (hab) — columna principal */}
                                                    <td style={{
                                                        padding: '6px 10px',
                                                        textAlign: 'right',
                                                        fontWeight: 700,
                                                        color: deltaHabColor
                                                    }}>
                                                        {status === 'NA' ? '—' : fmtDeltaHab(deltaHab, result.norma)}
                                                    </td>

                                                    {/* ΔP (%) — secundario, texto pequeño */}
                                                    <td style={{
                                                        padding: '6px 10px',
                                                        textAlign: 'right',
                                                        fontSize: '11px',
                                                        color: 'var(--text-muted)'
                                                    }}>
                                                        {status === 'NA' ? '—' : fmtDeltaPct(deltaHab, result.Pbase, result.norma)}
                                                    </td>

                                                    {/* Estado */}
                                                    <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                                        <StatusPill status={status} />
                                                    </td>

                                                    {/* Limitante con tooltip */}
                                                    <td style={{ padding: '6px 10px', position: 'relative' }}>
                                                        {result.limitingReason ? (
                                                            <button
                                                                title={result.limitingDetails || result.limitingReason}
                                                                onMouseEnter={() => setTooltipPipeId(pipe.id)}
                                                                onMouseLeave={() => setTooltipPipeId(null)}
                                                                style={{
                                                                    background: 'none',
                                                                    border: 'none',
                                                                    cursor: 'help',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px',
                                                                    color: 'var(--text-secondary)',
                                                                    fontSize: '11px',
                                                                    padding: 0
                                                                }}
                                                            >
                                                                <Info size={12} style={{ flexShrink: 0, color: 'var(--accent)' }} />
                                                                <span style={{
                                                                    overflow: 'hidden',
                                                                    textOverflow: 'ellipsis',
                                                                    whiteSpace: 'nowrap',
                                                                    maxWidth: '130px',
                                                                    display: 'inline-block'
                                                                }}>
                                                                    {result.limitingReason}
                                                                </span>
                                                            </button>
                                                        ) : '—'}

                                                        {/* Tooltip flotante */}
                                                        {showTooltip && result.limitingDetails && (
                                                            <div style={{
                                                                position: 'absolute',
                                                                left: 0,
                                                                bottom: '100%',
                                                                zIndex: 1000,
                                                                background: 'var(--surface)',
                                                                border: '1px solid var(--border)',
                                                                borderRadius: '6px',
                                                                padding: '8px 12px',
                                                                fontSize: '11px',
                                                                color: 'var(--text-primary)',
                                                                maxWidth: '340px',
                                                                boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
                                                                lineHeight: 1.6,
                                                                whiteSpace: 'normal',
                                                                fontFamily: 'monospace'
                                                            }}>
                                                                {result.limitingDetails}
                                                            </div>
                                                        )}
                                                    </td>

                                                    {/* 💡 Mejoras */}
                                                    <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                                                        {isNch && status !== 'NA' && (
                                                            <button
                                                                title="Ver recomendaciones de mejora para este tramo"
                                                                onClick={() => setImprovementPipe({ pipe, Pbase: result.Pbase })}
                                                                style={{
                                                                    background: status === 'CRITICAL' ? 'rgba(239,68,68,0.10)' :
                                                                        status === 'LIMITED' ? 'rgba(245,158,11,0.10)' :
                                                                            'rgba(16,185,129,0.08)',
                                                                    border: `1px solid ${status === 'CRITICAL' ? '#ef444440' :
                                                                        status === 'LIMITED' ? '#f59e0b40' : '#10b98130'}`,
                                                                    borderRadius: '5px', cursor: 'pointer',
                                                                    padding: '3px 8px', fontSize: '12px',
                                                                    color: status === 'CRITICAL' ? '#ef4444' :
                                                                        status === 'LIMITED' ? '#f59e0b' : '#10b981',
                                                                    fontWeight: 700, transition: 'all 0.15s',
                                                                    whiteSpace: 'nowrap'
                                                                }}
                                                            >
                                                                💡 Mejoras
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* ── Estado vacío ── */}
                        {!hasResults && !isRunning && (
                            <div style={{
                                padding: '20px',
                                textAlign: 'center',
                                color: 'var(--text-muted)',
                                fontSize: '0.85rem',
                                fontStyle: 'italic',
                                background: 'var(--surface-alt)',
                                borderRadius: '6px'
                            }}>
                                Seleccione un modo y haga clic en "Calcular capacidad" para iniciar el análisis inverso.
                            </div>
                        )}

                        {/* ── Leyenda ── */}
                        {hasResults && (
                            <div style={{
                                marginTop: '12px',
                                fontSize: '0.73rem',
                                color: 'var(--text-muted)',
                                display: 'flex',
                                gap: '16px',
                                flexWrap: 'wrap',
                                alignItems: 'center'
                            }}>
                                <span><strong style={{ color: '#10b981' }}>OK</strong>: ΔP(%) ≥ 15%</span>
                                <span><strong style={{ color: '#f59e0b' }}>LIMITADO</strong>: 0 ≤ ΔP(%) &lt; 15%</span>
                                <span><strong style={{ color: '#ef4444' }}>SOBRECARGADO</strong>: P soportable &lt; P base (tramo saturado)</span>
                                <span style={{ marginLeft: 'auto' }}>
                                    <strong>ΔP (hab)</strong> = P soportable − P base&nbsp;&nbsp;|&nbsp;&nbsp;
                                    <strong>ΔP (%)</strong> = ΔP(hab) / P base × 100
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* CSS spinner */}
                <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
            </section>

            {/* Modal de mejoras */}
            {improvementPipe && (
                <ImprovementModal
                    pipe={improvementPipe.pipe}
                    settings={settings}
                    Pbase={improvementPipe.Pbase}
                    onClose={() => setImprovementPipe(null)}
                />
            )}
        </InverseErrorBoundary >
    );
};

// Ahora definimos HEADERS fuera del componente para evitar recreación
const HEADERS: Array<{ label: string; align: 'left' | 'right' | 'center'; minW: number; tooltip?: string }> = [
    { label: 'Tramo', align: 'left', minW: 80 },
    { label: 'Rol', align: 'left', minW: 110 },
    { label: 'P base (hab)', align: 'right', minW: 110 },
    { label: 'Q base (L/s)', align: 'right', minW: 110 },
    { label: 'Q lim (L/s)', align: 'right', minW: 100 },
    { label: 'Q full (L/s)', align: 'right', minW: 100 },
    {
        label: 'P soportable (hab)',
        align: 'right',
        minW: 140,
        tooltip: 'Máxima población total que cumple normativamente en este tramo bajo la configuración actual.'
    },
    { label: 'ΔP (hab)', align: 'right', minW: 110 },
    { label: 'ΔP (%)', align: 'right', minW: 80 },
    { label: 'Estado', align: 'center', minW: 120 },
    { label: 'Limitante', align: 'left', minW: 160 },
    { label: '💡', align: 'center', minW: 80, tooltip: 'Abrir panel de recomendaciones de mejora' },
];
