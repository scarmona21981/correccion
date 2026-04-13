import React from 'react';
import { VisualizationMode, useView } from '../context/ViewContext';
import { X } from 'lucide-react';
import { PipeVerificationResult } from '../hydraulics/types';
import { COMPLIANCE_LEGEND_ITEMS } from '../utils/visualizationUtils';

interface ColorLegendProps {
    mode: VisualizationMode;
    onClose: () => void;
}

interface LegendItem {
    id: string;
    color: string;
    label: string;
    count?: number;
}

export const ColorLegend: React.FC<ColorLegendProps> = ({ mode, onClose }) => {
    const { customColors, analysisResults } = useView();

    if (mode === 'none') return null;

    const getDefaultLegendItems = (): LegendItem[] => {
        const modeColors = customColors[mode] || {};

        switch (mode) {
            case 'compliance': {
                const verifications = analysisResults?.verifications || {};
                const counts = COMPLIANCE_LEGEND_ITEMS.reduce<Record<string, number>>((acc, item) => {
                    acc[item.id] = 0;
                    return acc;
                }, {});

                Object.values(verifications as Record<string, PipeVerificationResult>).forEach(verification => {
                    const matched = COMPLIANCE_LEGEND_ITEMS.find(item => item.statuses.some(status => status === verification.status));
                    const bucketId = matched?.id || 'no_evaluado';
                    counts[bucketId] = (counts[bucketId] || 0) + 1;
                });

                return COMPLIANCE_LEGEND_ITEMS.map(item => ({
                    id: item.id,
                    color: modeColors[item.id] || item.color,
                    label: item.label,
                    count: counts[item.id] || 0
                }));
            }
            case 'ueh':
                return [
                    { id: 'ueh_0', color: modeColors['ueh_0'] || '#22d3ee', label: '0 UEH' },
                    { id: 'ueh_500', color: modeColors['ueh_500'] || '#3b82f6', label: '500 UEH' },
                    { id: 'ueh_2000', color: modeColors['ueh_2000'] || '#7c3aed', label: '2000+ UEH' }
                ];
            case 'velocity':
                return [
                    { id: 'vel_low', color: modeColors['vel_low'] || '#ef4444', label: '< 0.6 m/s (Bajo)' },
                    { id: 'vel_optimal', color: modeColors['vel_optimal'] || '#10b981', label: '0.6 - 1.5 m/s (Óptimo)' },
                    { id: 'vel_high', color: modeColors['vel_high'] || '#f59e0b', label: '1.5 - 3.0 m/s (Alto)' },
                    { id: 'vel_critical', color: modeColors['vel_critical'] || '#ef4444', label: '> 3.0 m/s (Crítico)' }
                ];
            case 'filling_ratio':
                return [
                    { id: 'fill_low', color: modeColors['fill_low'] || '#f59e0b', label: '< 30% (Bajo)' },
                    { id: 'fill_optimal', color: modeColors['fill_optimal'] || '#10b981', label: '30 - 70% (Óptimo)' },
                    { id: 'fill_high', color: modeColors['fill_high'] || '#ef4444', label: '70 - 80% (Alto)' },
                    { id: 'fill_critical', color: modeColors['fill_critical'] || '#7f1d1d', label: '> 80% (Crítico)' }
                ];
            case 'slope':
                return [
                    { id: 'slope_low', color: modeColors['slope_low'] || '#f59e0b', label: '< 1% (Bajo)' },
                    { id: 'slope_standard', color: modeColors['slope_standard'] || '#10b981', label: '1 - 4% (Estándar)' },
                    { id: 'slope_high', color: modeColors['slope_high'] || '#166534', label: '4 - 15% (Alto)' },
                    { id: 'slope_very_high', color: modeColors['slope_very_high'] || '#6366f1', label: '> 15% (Muy Alto)' }
                ];
            default:
                return [];
        }
    };

    const getTitle = () => {
        switch (mode) {
            case 'compliance': return 'Cumplimiento Normativo';
            case 'ueh': return 'UEH Transportadas';
            case 'velocity': return 'Velocidad Hidráulica';
            case 'filling_ratio': return 'Relación de Llenado (y/D)';
            case 'slope': return 'Pendiente';
            default: return '';
        }
    };

    const items = getDefaultLegendItems();
    const total = mode === 'compliance'
        ? items.reduce((sum, item) => sum + Number(item.count || 0), 0)
        : 0;

    return (
        <div className="color-legend-panel">
            <div className="color-legend-header">
                <h4 className="color-legend-title">{getTitle()}</h4>
                <button
                    className="color-legend-close-btn"
                    onClick={onClose}
                    title="Cerrar leyenda"
                >
                    <X size={18} />
                </button>
            </div>
            {mode === 'compliance' && (
                <div className="color-legend-caption">
                    Basado en cálculo y verificación normativa (NCh 3371 y NCh 1105).
                </div>
            )}

            <div className="color-legend-items">
                {items.map(item => (
                    <div key={item.id} className="color-legend-item">
                        <span className="color-legend-dot" style={{ background: item.color }} />
                        <span className="color-legend-label">{item.label}</span>
                        {mode === 'compliance' && (
                            <span className="color-legend-count">{item.count || 0}</span>
                        )}
                    </div>
                ))}
            </div>

            {mode === 'compliance' && (
                <div className="color-legend-footer">Tramos evaluados: {total}</div>
            )}
        </div>
    );
};
