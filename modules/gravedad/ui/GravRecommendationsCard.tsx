import React from 'react';
import { useProject } from '../../../context/ProjectContext';
import { Recommendation } from '../recommendations/types';
import { buildRecommendations } from '../recommendations/buildRecommendations';
import { ManningSolver } from '../../../hydraulics/solver';
import { getManningAndDiMm } from '../../../hydraulics/hydraulicCalculationEngine';
import { LIMITS_NCH1105 } from '../../../hydraulics/nch1105Limits';
import { resolveHydraulicDiMm } from '../../../utils/diameterMapper';
import { resolveEffectiveTopologyRole } from '../../../utils/pipeRole';

export const GravRecommendationsCard: React.FC<{ rows: any[] }> = ({ rows }) => {
    const { pipes } = useProject();

    // Filtrar SOLO tramos NO APTOS
    const nonCompliantRows = rows.filter(r => r.estado === 'NO APTO');

    if (nonCompliantRows.length === 0) {
        return (
            <div style={{
                marginTop: '16px', padding: '16px', background: 'var(--surface-elevated)',
                borderRadius: '8px', border: '1px dashed var(--border)', textAlign: 'center'
            }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    ✅ Todos los tramos cumplen normativa. No hay recomendaciones adicionales.
                </span>
            </div>
        );
    }

    // Generar recomendaciones técnicas
    const allRecommendations: Recommendation[] = React.useMemo(() => {
        const result: Recommendation[] = [];

        for (const row of nonCompliantRows) {
            const pipe = pipes.find(p => p.id === row.pipeId);
            if (!pipe) continue;

            const material = String(pipe.material?.value || 'PVC');
            const { n } = getManningAndDiMm(material, row.dn, pipe.sdr?.value ? String(pipe.sdr.value) : undefined);

            // Caudales reales de diseño
            const qActualMax = row.qDiseno; // L/s
            const qMinOrig = pipe.qMin_Ls || 0; // L/s (set in recalcProject)

            const evalMax = (dn: number, slopePerc: number) => {
                const { di_mm: diTable } = getManningAndDiMm(material, dn, pipe.sdr?.value ? String(pipe.sdr.value) : undefined);
                const currentDn = Number(pipe.diameter?.value || 0);
                const di_mm = (dn === currentDn)
                    ? resolveHydraulicDiMm(pipe, diTable)
                    : diTable;
                const s = Math.max(0, slopePerc / 100);
                // Manejar dn=0
                if (dn <= 0 || s <= 0) return { apto: false };

                const results = ManningSolver.calculatePartialFlow(qActualMax / 1000, di_mm / 1000, s, n);

                const okVelocity = results.velocity <= LIMITS_NCH1105.MAX.v_max;
                const okHD = results.fillRatio <= LIMITS_NCH1105.MAX.hD_max;
                return { apto: okVelocity && okHD };
            };

            const evalMin = (dn: number, slopePerc: number) => {
                if (qMinOrig <= 0) return { apto: false, motivo: 'Sin caudal mínimo' };
                const { di_mm: diTable } = getManningAndDiMm(material, dn, pipe.sdr?.value ? String(pipe.sdr.value) : undefined);
                const currentDn = Number(pipe.diameter?.value || 0);
                const di_mm = (dn === currentDn)
                    ? resolveHydraulicDiMm(pipe, diTable)
                    : diTable;
                const s = Math.max(0, slopePerc / 100);
                if (dn <= 0 || s <= 0) return { apto: false };

                const results = ManningSolver.calculatePartialFlow(qMinOrig / 1000, di_mm / 1000, s, n);

                const isColector = resolveEffectiveTopologyRole(pipe) === 'COLECTOR';
                const okVelocity = results.velocity >= LIMITS_NCH1105.MIN.v_min;
                const okHD = isColector ? (results.fillRatio >= LIMITS_NCH1105.MIN.hD_min) : true;

                return { apto: okVelocity && okHD };
            };

            const recs = buildRecommendations(row, { evalMin, evalMax, material });
            result.push(...recs);
        }

        return result;
    }, [nonCompliantRows, pipes]);

    return (
        <div style={{ marginTop: '20px' }} className="recommendations-card">
            <div style={{
                background: 'var(--surface-elevated)',
                borderRadius: '8px',
                border: '1px solid #3b82f644',
                padding: '16px',
                boxShadow: 'var(--shadow-lg)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '18px' }}>🔧</span>
                    <h3 style={{ margin: 0, fontSize: '14px', color: '#3b82f6', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Recomendaciones Automáticas de Mejora
                    </h3>
                </div>
                <p style={{ margin: '0 0 16px 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                    Sugerencias tácticas para tramos <span style={{ color: '#ef4444' }}>NO APTOS</span> orientadas al cumplimiento normativo.
                    No altera la configuración actual del proyecto.
                </p>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                        <thead>
                            <tr style={{ background: 'var(--surface)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                                <th style={{ padding: '8px' }}>Tramo</th>
                                <th style={{ padding: '8px' }}>Norma</th>
                                <th style={{ padding: '8px' }}>Fallo Atendido</th>
                                <th style={{ padding: '8px' }}>Recomendación Sugerida</th>
                                <th style={{ padding: '8px', textAlign: 'center' }}>Valor Sugerido</th>
                                <th style={{ padding: '8px' }}>Análisis Técnico</th>
                            </tr>
                        </thead>
                        <tbody>
                            {allRecommendations.length === 0 ? (
                                <tr>
                                    <td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        No se encontraron recomendaciones automáticas dentro de los rangos tolerables.
                                    </td>
                                </tr>
                            ) : allRecommendations.map((rec, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                                    <td style={{ padding: '10px 8px', fontWeight: 800, color: 'var(--text-bright)' }}>{rec.tramoId}</td>
                                    <td style={{ padding: '10px 8px' }}>
                                        <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                                            {rec.norma}
                                        </span>
                                    </td>
                                    <td style={{ padding: '10px 8px', color: getRecColor(rec.tipo), fontWeight: 700 }}>
                                        {rec.falloLabel || getRecLabel(rec.tipo)}
                                    </td>
                                    <td style={{ padding: '10px 8px', fontWeight: 600 }}>{rec.titulo}</td>
                                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                        {rec.valores?.suggestedSlope && (
                                            <div style={{ padding: '3px 7px', borderRadius: '4px', background: '#10b98115', color: '#10b981', display: 'inline-block', fontWeight: 800 }}>
                                                {rec.valores.suggestedSlope.toFixed(2)} %
                                            </div>
                                        )}
                                        {rec.valores?.suggestedDn && (
                                            <div style={{ padding: '3px 7px', borderRadius: '4px', background: '#3b82f615', color: '#3b82f6', display: 'inline-block', fontWeight: 800 }}>
                                                DN {rec.valores.suggestedDn}
                                            </div>
                                        )}
                                        {!rec.valores?.suggestedSlope && !rec.valores?.suggestedDn && <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                    </td>
                                    <td style={{ padding: '10px 8px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                                        {rec.detalle}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const getRecColor = (type: string) => {
    switch (type) {
        case 'INCREASE_SLOPE': return '#10b981';
        case 'INCREASE_DN': return '#3b82f6';
        case 'DECREASE_DN': return '#f59e0b';
        default: return 'var(--text-muted)';
    }
};

const getRecLabel = (type: string) => {
    switch (type) {
        case 'INCREASE_SLOPE': return 'PENDIENTE';
        case 'INCREASE_DN': return 'DIÁMETRO (+)';
        case 'DECREASE_DN': return 'DIÁMETRO (-)';
        case 'FLOW_CAPACITY': return 'CAPACIDAD';
        default: return type;
    }
};
