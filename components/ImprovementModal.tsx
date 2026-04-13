/**
 * ImprovementModal
 *
 * Modal de "Recomendaciones de mejora" para el módulo Análisis Inverso.
 * Se abre cuando el usuario hace click en "💡 Mejoras" en una fila de la tabla.
 *
 * - No modifica el motor principal.
 * - Lee datos del ProjectContext y del pipe seleccionado.
 */

import React from 'react';
import {
    Lightbulb, X, Zap, RefreshCw, CheckCircle2,
    XCircle, AlertTriangle, Minus, ArrowRight,
    TrendingUp, Layers, GitBranch, Info
} from 'lucide-react';
import { Pipe, ProjectSettings } from '../context/ProjectContext';
import {
    ImprovementRec,
    ImprovementFeasibility,
    ImprovementType,
    DiagnosticResult
} from '../hydraulics/improvementEngine';
import { useImprovementAnalysis } from '../application/hooks';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt2 = (v?: number) =>
    v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(2);

const fmtPop = (v?: number) => {
    if (v === undefined || !Number.isFinite(v) || v <= 0) return '—';
    if (v >= 1_000_000) return '> 1.000.000';
    return Math.round(v).toLocaleString('es-CL');
};

const feasColor: Record<ImprovementFeasibility, string> = {
    CUMPLE: '#10b981',
    NO_CUMPLE: '#ef4444',
    PARCIAL: '#f59e0b',
    INFO: '#6b7280'
};

const feasLabel: Record<ImprovementFeasibility, string> = {
    CUMPLE: '✓ Cumple',
    NO_CUMPLE: '✗ No cumple',
    PARCIAL: '◑ Parcial',
    INFO: 'ℹ Info'
};

const typeIcon: Record<ImprovementType, React.ReactNode> = {
    DN_UPGRADE: <TrendingUp size={16} />,
    PARALLEL_PIPE: <GitBranch size={16} />,
    SLOPE_INCREASE: <Layers size={16} />,
    STAGING: <AlertTriangle size={16} />,
    TEXT_ADVICE: <Info size={16} />
};

// ─── Sub-componentes ──────────────────────────────────────────────────────────

const FeasBadge: React.FC<{ f: ImprovementFeasibility }> = ({ f }) => (
    <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        padding: '2px 10px', borderRadius: '999px',
        background: `${feasColor[f]}18`,
        color: feasColor[f],
        fontWeight: 700, fontSize: '11px',
        border: `1px solid ${feasColor[f]}44`,
        whiteSpace: 'nowrap'
    }}>
        {feasLabel[f]}
    </span>
);

const MetricChip: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
    <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '6px 12px', borderRadius: '6px',
        background: 'var(--surface-alt)',
        border: '1px solid var(--border)',
        minWidth: '80px'
    }}>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: color || 'var(--text-primary)', marginTop: '2px' }}>{value}</span>
    </div>
);

const RecCard: React.FC<{ rec: ImprovementRec; rank: number }> = ({ rec, rank }) => {
    const [expanded, setExpanded] = React.useState(rank === 0);
    const color = feasColor[rec.feasibility];

    return (
        <div style={{
            border: `1px solid ${rec.feasibility === 'CUMPLE' ? color + '55' : 'var(--border)'}`,
            borderRadius: '8px',
            overflow: 'hidden',
            background: rec.feasibility === 'CUMPLE' ? `${color}06` : 'var(--surface)'
        }}>
            {/* Header */}
            <button
                onClick={() => setExpanded(v => !v)}
                style={{
                    width: '100%', padding: '10px 14px',
                    display: 'flex', alignItems: 'center', gap: '10px',
                    background: 'transparent', border: 'none',
                    cursor: 'pointer', textAlign: 'left'
                }}
            >
                <span style={{ color, flexShrink: 0 }}>{typeIcon[rec.type]}</span>
                <span style={{ fontWeight: 700, fontSize: '0.85rem', flex: 1, color: 'var(--text-primary)' }}>
                    {rec.title}
                </span>
                <FeasBadge f={rec.feasibility} />
                <span style={{ color: 'var(--text-muted)', fontSize: '11px', marginLeft: '8px' }}>
                    {expanded ? '▲' : '▼'}
                </span>
            </button>

            {/* Body */}
            {expanded && (
                <div style={{ padding: '0 14px 12px', borderTop: '1px solid var(--border)' }}>
                    <p style={{ margin: '8px 0 6px', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {rec.description}
                    </p>

                    {/* Cambio propuesto */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '6px 10px', borderRadius: '6px',
                        background: 'var(--surface-alt)', marginBottom: '8px',
                        fontSize: '0.8rem', fontFamily: 'monospace'
                    }}>
                        <ArrowRight size={12} color={color} />
                        {rec.changes}
                    </div>

                    {/* Métricas */}
                    {rec.metrics && (
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                            {rec.metrics.Qlim_lps !== undefined && (
                                <MetricChip label="Q_lim (L/s)" value={fmt2(rec.metrics.Qlim_lps)} color={color} />
                            )}
                            {rec.metrics.Qbase_lps !== undefined && (
                                <MetricChip label="Q_req (L/s)" value={fmt2(rec.metrics.Qbase_lps)} />
                            )}
                            {rec.metrics.hD_at_Ptarget !== undefined && (
                                <MetricChip
                                    label="h/D"
                                    value={`${(rec.metrics.hD_at_Ptarget * 100).toFixed(1)}%`}
                                    color={rec.metrics.hD_at_Ptarget > 0.70 ? '#ef4444' : '#10b981'}
                                />
                            )}
                            {rec.metrics.Pmax_approx !== undefined && rec.metrics.Pmax_approx > 0 && (
                                <MetricChip label="P_soportable" value={fmtPop(rec.metrics.Pmax_approx)} color="#10b981" />
                            )}
                        </div>
                    )}

                    {/* Notas */}
                    {rec.notes && (
                        <p style={{
                            margin: 0, fontSize: '0.75rem',
                            color: 'var(--text-muted)', fontStyle: 'italic',
                            padding: '4px 8px', borderLeft: `3px solid ${color}`,
                            background: `${color}08`, borderRadius: '0 4px 4px 0'
                        }}>
                            {rec.notes}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

// ─── Panel de diagnóstico ─────────────────────────────────────────────────────

const DiagSection: React.FC<{ d: DiagnosticResult; Pbase: number }> = ({ d, Pbase }) => {
    const hDPct = (d.hD * 100).toFixed(1);
    const hDColor = d.hD > 0.70 ? '#ef4444' : d.hD < 0.30 ? '#f59e0b' : '#10b981';

    return (
        <div style={{
            background: 'var(--surface-alt)', borderRadius: '8px',
            padding: '12px 14px', marginBottom: '16px',
            border: '1px solid var(--border)'
        }}>
            <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: '8px', color: 'var(--text-secondary)' }}>
                DIAGNÓSTICO ACTUAL (P base = {fmtPop(Pbase)} hab)
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <MetricChip label="Q actual (L/s)" value={fmt2(d.Q_lps)} />
                <MetricChip label="Q_lim (L/s)" value={fmt2(d.Qlim_lps)} />
                <MetricChip label="Q_full (L/s)" value={fmt2(d.Qfull_lps)} color="var(--text-muted)" />
                <MetricChip label="h/D actual" value={`${hDPct}%`} color={hDColor} />
                <MetricChip label="DN" value={`DN ${d.dn_mm}`} />
                <MetricChip label="Pendiente" value={`${d.slope_pct.toFixed(2)}%`} />
                <MetricChip label="P soportable ≈" value={fmtPop(d.Pmax_approx)} color="#10b981" />
            </div>
            {d.failReasons.length > 0 && (
                <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {d.failReasons.map(fr => (
                        <span key={fr} style={{
                            padding: '2px 8px', borderRadius: '4px',
                            background: 'rgba(239,68,68,0.12)', color: '#ef4444',
                            fontSize: '10px', fontWeight: 700, fontFamily: 'monospace'
                        }}>
                            {fr}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
};

// ─── Modal principal ──────────────────────────────────────────────────────────

interface ImprovementModalProps {
    pipe: Pipe;
    settings: ProjectSettings;
    Pbase: number;
    onClose: () => void;
}

export const ImprovementModal: React.FC<ImprovementModalProps> = ({
    pipe, settings, Pbase, onClose
}) => {
    const [P_target, setP_target] = React.useState(() => Math.round(Math.max(Pbase * 1.5, Pbase + 100)));
    const [allowDN, setAllowDN] = React.useState(true);
    const [allowParallel, setAllowParallel] = React.useState(true);
    const [allowSlope, setAllowSlope] = React.useState(false);

    const pipeLabel = pipe.userDefinedId || pipe.id;

    const constraints = React.useMemo(() => ({
        allowDiameterChange: allowDN,
        allowParallel,
        allowSlopeChange: allowSlope,
        slopeMultipliers: [1.1, 1.25, 1.5, 2.0, 3.0]
    }), [allowDN, allowParallel, allowSlope]);

    const { report, isLoading } = useImprovementAnalysis({
        pipe,
        settings,
        P_base: Pbase,
        P_target,
        constraints,
        enabled: true
    });

    React.useEffect(() => { }, [report]);

    const cumpleCount = report?.recommendations.filter(r => r.feasibility === 'CUMPLE').length ?? 0;

    return (
        // Overlay
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 9000,
                background: 'rgba(0,0,0,0.55)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '24px'
            }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                width: '100%',
                maxWidth: '680px',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
                overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', gap: '10px',
                    background: 'rgba(16,185,129,0.05)',
                    flexShrink: 0
                }}>
                    <Lightbulb size={20} color="#10b981" />
                    <div>
                        <div style={{ fontWeight: 800, fontSize: '1rem', color: '#10b981' }}>
                            Recomendaciones de mejora — Tramo {pipeLabel}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Simulación what-if para cumplir normativamente en población objetivo
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            marginLeft: 'auto', background: 'transparent', border: 'none',
                            cursor: 'pointer', color: 'var(--text-muted)', padding: '4px'
                        }}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body (scrollable) */}
                <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
                    {/* Controles */}
                    <div style={{
                        display: 'flex', gap: '12px', flexWrap: 'wrap',
                        alignItems: 'flex-end', marginBottom: '16px',
                        padding: '12px 14px', borderRadius: '8px',
                        background: 'var(--surface-alt)', border: '1px solid var(--border)'
                    }}>
                        {/* P_target */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                P objetivo (hab)
                            </label>
                            <input
                                type="number"
                                value={P_target}
                                min={1}
                                step={10}
                                onChange={e => setP_target(Number(e.target.value))}
                                style={{
                                    width: '110px', padding: '5px 8px',
                                    borderRadius: '6px', border: '1px solid var(--border)',
                                    background: 'var(--surface)', color: 'var(--text-primary)',
                                    fontSize: '0.85rem', fontWeight: 700
                                }}
                            />
                        </div>

                        {/* Toggles */}
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                            {[
                                { label: '↕ DN', state: allowDN, set: setAllowDN, title: 'Permitir cambio de diámetro' },
                                { label: '∥ Paralelo', state: allowParallel, set: setAllowParallel, title: 'Permitir tubería paralela' },
                                { label: '⤴ Pendiente', state: allowSlope, set: setAllowSlope, title: 'Permitir cambio de pendiente' }
                            ].map(tog => (
                                <button
                                    key={tog.label}
                                    title={tog.title}
                                    onClick={() => tog.set(v => !v)}
                                    style={{
                                        padding: '5px 10px',
                                        borderRadius: '6px',
                                        border: `1px solid ${tog.state ? '#10b981' : 'var(--border)'}`,
                                        background: tog.state ? 'rgba(16,185,129,0.12)' : 'transparent',
                                        color: tog.state ? '#10b981' : 'var(--text-muted)',
                                        cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700,
                                        transition: 'all 0.15s'
                                    }}
                                >
                                    {tog.label}
                                </button>
                            ))}
                        </div>

                        {/* Botón - ejecución automática via hook */}
                        <button
                            onClick={() => {}}
                            disabled={true}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '6px 14px', borderRadius: '6px',
                                background: isLoading ? 'var(--surface)' : '#10b981',
                                color: isLoading ? 'var(--text-muted)' : 'white',
                                border: 'none', cursor: isLoading ? 'not-allowed' : 'pointer',
                                fontWeight: 700, fontSize: '0.8rem', transition: 'all 0.15s'
                            }}
                        >
                            {isLoading
                                ? <RefreshCw size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
                                : <Zap size={14} />
                            }
                            Simular
                        </button>
                    </div>

                    {/* Diagnóstico */}
                    {report && (
                        <DiagSection d={report.diagnostic} Pbase={Pbase} />
                    )}

                    {/* Resumen */}
                    {report && report.recommendations.length > 0 && (
                        <div style={{
                            display: 'flex', gap: '8px', marginBottom: '12px',
                            padding: '8px 12px', borderRadius: '6px',
                            background: cumpleCount > 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.06)',
                            border: `1px solid ${cumpleCount > 0 ? '#10b98144' : '#ef444433'}`
                        }}>
                            {cumpleCount > 0
                                ? <><CheckCircle2 size={15} color="#10b981" />
                                    <span style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 700 }}>
                                        {cumpleCount} solución{cumpleCount > 1 ? 'es' : ''} que cumple{cumpleCount > 1 ? 'n' : ''} para P = {P_target.toLocaleString()} hab
                                    </span></>
                                : <><XCircle size={15} color="#ef4444" />
                                    <span style={{ fontSize: '0.8rem', color: '#ef4444', fontWeight: 700 }}>
                                        Ninguna solución individual cumple para P = {P_target.toLocaleString()} hab
                                    </span></>
                            }
                        </div>
                    )}

                    {/* Tarjetas de recomendaciones */}
                    {report && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {report.recommendations.length === 0 && (
                                <div style={{
                                    padding: '20px', textAlign: 'center',
                                    color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.85rem'
                                }}>
                                    No se generaron recomendaciones. Habilite al menos una opción de simulación.
                                </div>
                            )}
                            {report.recommendations.map((rec, i) => (
                                <RecCard key={`${rec.type}-${i}`} rec={rec} rank={i} />
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '10px 20px',
                    borderTop: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    fontSize: '0.72rem', color: 'var(--text-muted)',
                    background: 'var(--surface-alt)', flexShrink: 0
                }}>
                    <span>⚠ Las recomendaciones son orientativas. Verifique con cálculo final antes de proyectar.</span>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '5px 12px', borderRadius: '6px',
                            border: '1px solid var(--border)', background: 'var(--surface)',
                            cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-secondary)'
                        }}
                    >
                        Cerrar
                    </button>
                </div>
            </div>

            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};
