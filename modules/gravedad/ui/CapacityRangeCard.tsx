import React from 'react';
import { useProject } from '../../../context/ProjectContext';
import { useView } from '../../../context/ViewContext';
import { resolveEffectivePipeRole } from '../../../utils/pipeRole';
import { evaluateBatchCapacityRange, evaluatePipeCapacityRange } from '../../../engine/capacityRange/capacityRange.core';
import { CapacityRangeResult, CapacityStatus } from '../../../engine/capacityRange/capacityRange.types';
import { getCapacityImprovements, ImprovementRec } from '../../../engine/capacityRange/capacityRange.recommendations';
import { DataTable } from '../../../components/common/DataTable';
import { StatusBadge, StatusType } from '../../../components/common/StatusBadge';
import {
    BarChart3,
    Info,
    Lightbulb,
    Play,
    Filter,
    ChevronDown,
    ChevronUp,
    AlertTriangle,
    User,
    Users
} from 'lucide-react';

type FilterMode = 'COLLECTORS_ONLY' | 'ALL_PIPES' | 'SELECTED_ONLY';

export const CapacityRangeCard: React.FC = () => {
    const { pipes, settings } = useProject();
    const { selectedIds } = useView();

    const [filterMode, setFilterMode] = React.useState<FilterMode>('COLLECTORS_ONLY');
    const [results, setResults] = React.useState<CapacityRangeResult[]>([]);
    const [isCalculating, setIsCalculating] = React.useState(false);
    const [expandedImprovements, setExpandedImprovements] = React.useState<Set<string>>(new Set());

    // --- KPIs ---
    const kpis = React.useMemo(() => {
        const counts: Record<CapacityStatus, number> = {
            OPTIMO: 0,
            SUBUTILIZADO: 0,
            SOBRECARGADO: 0,
            INDETERMINADO: 0,
            INCOMPATIBLE: 0
        };
        results.forEach(r => counts[r.status]++);
        return counts;
    }, [results]);

    const handleCalculate = () => {
        setIsCalculating(true);
        // Pequeño timeout para permitir que la UI muestre el estado de carga si son muchos tramos
        setTimeout(() => {
            let pipesToEval = pipes;
            if (filterMode === 'COLLECTORS_ONLY') {
                pipesToEval = pipes.filter(p => resolveEffectivePipeRole(p) === 'COLECTOR_EXTERIOR');
            } else if (filterMode === 'SELECTED_ONLY') {
                pipesToEval = pipes.filter(p => selectedIds.has(p.id));
            }

            const newResults = evaluateBatchCapacityRange(pipesToEval, settings);
            setResults(newResults);
            setIsCalculating(false);
        }, 50);
    };

    const toggleImprovements = (pipeId: string) => {
        setExpandedImprovements(prev => {
            const next = new Set(prev);
            if (next.has(pipeId)) next.delete(pipeId);
            else next.add(pipeId);
            return next;
        });
    };

    const mapStatusToBadge = (status: CapacityStatus): StatusType => {
        switch (status) {
            case 'OPTIMO': return 'APTO';
            case 'SUBUTILIZADO': return 'CONDICIONAL';
            case 'SOBRECARGADO': return 'NO APTO';
            case 'INCOMPATIBLE': return 'NO APTO';
            default: return 'INFO';
        }
    };

    return (
        <div style={{ marginTop: '24px' }} className="capacity-range-card">
            <div style={{
                background: 'var(--surface-elevated)',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                padding: '20px',
                boxShadow: 'var(--shadow-xl)'
            }}>
                {/* Header Section */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                            <div style={{
                                padding: '8px',
                                background: 'rgba(59, 130, 246, 0.1)',
                                borderRadius: '8px',
                                color: '#3b82f6'
                            }}>
                                <BarChart3 size={20} />
                            </div>
                            <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-bright)', fontWeight: 800 }}>
                                Análisis Inverso de Capacidad — Rango Poblacional
                            </h3>
                        </div>
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', maxWidth: '600px' }}>
                            Determina el rango de habitantes [P_min, P_max] que el tramo soporta cumpliendo simultáneamente autolavado y capacidad hidráulica.
                        </p>
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                        {/* Selector de Filtro */}
                        <div style={{
                            display: 'flex',
                            background: 'var(--surface)',
                            padding: '3px',
                            borderRadius: '8px',
                            border: '1px solid var(--border)'
                        }}>
                            {(['COLLECTORS_ONLY', 'ALL_PIPES', 'SELECTED_ONLY'] as FilterMode[]).map(m => (
                                <button
                                    key={m}
                                    onClick={() => setFilterMode(m)}
                                    style={{
                                        padding: '5px 12px',
                                        fontSize: '11px',
                                        borderRadius: '6px',
                                        border: 'none',
                                        cursor: 'pointer',
                                        background: filterMode === m ? '#3b82f6' : 'transparent',
                                        color: filterMode === m ? 'white' : 'var(--text-muted)',
                                        fontWeight: filterMode === m ? 700 : 500,
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {m === 'COLLECTORS_ONLY' ? 'Solo Colectores' : m === 'ALL_PIPES' ? 'Todos' : 'Seleccionados'}
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={handleCalculate}
                            disabled={isCalculating}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px 16px',
                                background: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                opacity: isCalculating ? 0.7 : 1
                            }}
                        >
                            <Play size={14} fill="currentColor" />
                            {isCalculating ? 'Calculando...' : 'Calcular Rango'}
                        </button>
                    </div>
                </div>

                {/* KPI Overview */}
                {results.length > 0 && (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                        gap: '12px',
                        marginBottom: '24px'
                    }}>
                        <KPICard label="ÓPTIMO" value={kpis.OPTIMO} color="#10b981" />
                        <KPICard label="SUBUTILIZADO" value={kpis.SUBUTILIZADO} color="#f59e0b" />
                        <KPICard label="SOBRECARGADO" value={kpis.SOBRECARGADO} color="#ef4444" />
                        <KPICard label="INCOMPATIBLE" value={kpis.INCOMPATIBLE} color="#8b5cf6" />
                        <KPICard label="INDETERMINADO" value={kpis.INDETERMINADO} color="#64748b" />
                    </div>
                )}

                {/* Table Section */}
                {results.length > 0 ? (
                    <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                        <DataTable
                            columns={[
                                { key: 'label', header: 'Tramo', width: 90, format: (v) => <span style={{ fontWeight: 800 }}>{v}</span> },
                                { key: 'rol', header: 'Rol', width: 130, format: (v) => <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{v}</span> },
                                {
                                    key: 'P_base',
                                    header: 'P_base (hab)',
                                    width: 100,
                                    align: 'right',
                                    format: (v) => <span style={{ color: 'var(--text-bright)' }}>{Math.round(v).toLocaleString()}</span>
                                },
                                {
                                    key: 'P_min_norm',
                                    header: 'P_min (hab)',
                                    width: 100,
                                    align: 'right',
                                    format: (v) => v !== null ? Math.round(v).toLocaleString() : '—'
                                },
                                {
                                    key: 'P_max_norm',
                                    header: 'P_max (hab)',
                                    width: 100,
                                    align: 'right',
                                    format: (v) => v !== null ? Math.round(v).toLocaleString() : '—'
                                },
                                {
                                    key: 'deltaP_up',
                                    header: 'Margen ↑',
                                    width: 100,
                                    align: 'right',
                                    format: (v) => v !== null ? (
                                        <span style={{ color: v >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                                            {v > 0 ? '+' : ''}{Math.round(v).toLocaleString()}
                                        </span>
                                    ) : '—'
                                },
                                {
                                    key: 'okMaxAtBase',
                                    header: 'Cap. Física',
                                    width: 90,
                                    align: 'center',
                                    format: (v) => v === true ? <span style={{ color: '#10b981', fontWeight: 800 }}>OK</span> : v === false ? <span style={{ color: '#ef4444', fontWeight: 800 }}>NO</span> : '—'
                                },
                                {
                                    key: 'okMinAtBase',
                                    header: 'Cap. Sanitaria',
                                    width: 110,
                                    align: 'center',
                                    format: (v) => v === true ? <span style={{ color: '#10b981', fontWeight: 800 }}>OK</span> : v === false ? <span style={{ color: '#ef4444', fontWeight: 800 }}>NO</span> : '—'
                                },
                                {
                                    key: 'limitingRealText',
                                    header: 'Limitante real',
                                    width: 180,
                                    format: (v, row) => (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {v ?? '—'}
                                            </span>
                                            <InfoTooltip content={<LimitDetails row={row} />} />
                                        </div>
                                    )
                                },
                                {
                                    key: 'status',
                                    header: 'Estado',
                                    width: 120,
                                    align: 'center',
                                    format: (v) => <StatusBadge status={mapStatusToBadge(v)} label={v} />
                                },
                                {
                                    key: 'actions',
                                    header: 'Mejoras',
                                    width: 80,
                                    align: 'center',
                                    format: (_, row) => (
                                        <button
                                            onClick={() => toggleImprovements(row.pipeId)}
                                            disabled={row.status === 'OPTIMO' || row.status === 'INDETERMINADO'}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                cursor: 'pointer',
                                                color: row.status === 'OPTIMO' ? 'var(--text-muted)' : '#f59e0b',
                                                padding: '4px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                transition: 'transform 0.2s',
                                                transform: expandedImprovements.has(row.pipeId) ? 'scale(1.2)' : 'scale(1)'
                                            }}
                                            title="Ver recomendaciones de mejora"
                                        >
                                            <Lightbulb size={18} fill={expandedImprovements.has(row.pipeId) ? 'currentColor' : 'none'} />
                                        </button>
                                    )
                                }
                            ]}
                            rows={results}
                            rowKey={(row) => row.pipeId}
                            density="compact"
                            maxHeight="500px"
                            isRowExpanded={(row) => expandedImprovements.has(row.pipeId)}
                            rowExpanded={(row) => <ImprovementsPanel row={row} />}
                        />
                    </div>
                ) : (
                    <div style={{
                        padding: '40px',
                        textAlign: 'center',
                        border: '1px dashed var(--border)',
                        borderRadius: '8px',
                        background: 'rgba(255,255,255,0.01)'
                    }}>
                        <Info size={32} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
                        <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
                            Seleccione un filtro y presione "Calcular Rango" para iniciar el análisis inverso de capacidad.
                        </p>
                    </div>
                )}

                {/* Footer / Nota */}
                <div style={{ marginTop: '16px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'var(--surface)', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                        Fórmula técnica: Q(P) = Q_base * (P / P_base)
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'var(--surface)', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                        Norma aplicada: {settings.projectType === 'Público' ? 'NCh1105 (Red Pública)' : 'Dinámica por Rol'}
                    </div>
                </div>
            </div>
        </div>
    );
};

const KPICard: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
    <div style={{
        background: 'var(--surface)',
        padding: '12px',
        borderRadius: '8px',
        borderLeft: `4px solid ${color}`,
        borderTop: '1px solid var(--border)',
        borderRight: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)'
    }}>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '4px' }}>{label}</div>
        <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-bright)' }}>{value}</div>
    </div>
);

const InfoTooltip: React.FC<{ content: React.ReactNode }> = ({ content }) => {
    const [visible, setVisible] = React.useState(false);
    return (
        <div style={{ position: 'relative' }}>
            <div
                onMouseEnter={() => setVisible(true)}
                onMouseLeave={() => setVisible(false)}
                style={{ cursor: 'help', color: 'var(--text-muted)' }}
            >
                <Info size={14} />
            </div>
            {visible && (
                <div style={{
                    position: 'absolute',
                    bottom: '100%',
                    right: 0,
                    zIndex: 1000,
                    marginBottom: '8px',
                    background: '#1e293b',
                    color: 'white',
                    padding: '12px',
                    borderRadius: '8px',
                    width: '280px',
                    fontSize: '11px',
                    boxShadow: 'var(--shadow-2xl)',
                    border: '1px solid rgba(255,255,255,0.1)'
                }}>
                    {content}
                </div>
            )}
        </div>
    );
};

const LimitDetails: React.FC<{ row: CapacityRangeResult }> = ({ row }) => (
    <div>
        <div style={{ fontWeight: 800, marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px' }}>
            Detalle de Restricciones ({row.norma})
        </div>
        <div style={{ marginBottom: '8px' }}>
            <span style={{ color: '#3b82f6', fontWeight: 700 }}>CAPACIDAD (MÁX):</span>
            <div style={{ marginLeft: '4px', color: '#cbd5e1' }}>{row.limitingMax}</div>
            <div style={{ marginLeft: '4px', color: '#94a3b8', fontSize: '10px' }}>{row.detailsMax}</div>
        </div>
        <div>
            <span style={{ color: '#10b981', fontWeight: 700 }}>AUTOLAVADO (MÍN):</span>
            <div style={{ marginLeft: '4px', color: '#cbd5e1' }}>{row.limitingMin}</div>
            <div style={{ marginLeft: '4px', color: '#94a3b8', fontSize: '10px' }}>{row.detailsMin}</div>
        </div>
    </div>
);

const ImprovementsPanel: React.FC<{ row: CapacityRangeResult }> = ({ row }) => {
    const improvements = getCapacityImprovements(row);

    return (
        <div style={{
            padding: '16px',
            background: 'rgba(245, 158, 11, 0.03)',
            borderTop: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <Lightbulb size={16} color="#f59e0b" />
                <h4 style={{ margin: 0, fontSize: '13px', color: '#f59e0b', fontWeight: 800, textTransform: 'uppercase' }}>
                    Sugerencias de Mejora
                </h4>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    Diagnóstico: <span style={{ fontWeight: 700, color: 'var(--text-bright)' }}>{row.status}</span>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                {improvements.map((imp: ImprovementRec, idx: number) => (
                    <div key={idx} style={{
                        background: 'var(--surface)',
                        padding: '12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        gap: '12px'
                    }}>
                        <div style={{
                            width: '24px', height: '24px',
                            borderRadius: '50%', background: 'rgba(245, 158, 11, 0.1)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0
                        }}>
                            <span style={{ fontSize: '10px', fontWeight: 900, color: '#f59e0b' }}>{idx + 1}</span>
                        </div>
                        <div>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-bright)', marginBottom: '4px' }}>
                                {imp.title}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                                {imp.description}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ marginTop: '16px', padding: '8px 12px', background: 'var(--surface)', borderRadius: '6px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <AlertTriangle size={12} color="var(--text-muted)" />
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    Nota: Estas recomendaciones son sugerencias técnicas automáticas y no modifican los cálculos del proyecto.
                </span>
            </div>
        </div>
    );
};
