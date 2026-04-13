import { Pipe, ProjectSettings } from '../context/ProjectContext';
import { VisualizationMode } from '../context/ViewContext';
import { Results, VerificationStatus } from '../hydraulics/types';

export type ComplianceLegendId =
    | 'conforme_ueh'
    | 'conforme_hidraulico'
    | 'conforme_nch1105'
    | 'no_conforme'
    | 'no_evaluado';

export interface ComplianceLegendItem {
    id: ComplianceLegendId;
    color: string;
    label: string;
    statuses: VerificationStatus[];
}

export const COMPLIANCE_LEGEND_ITEMS: ComplianceLegendItem[] = [
    { id: 'conforme_ueh', color: '#10b981', label: 'Conforme (NCh 3371 UEH)', statuses: ['APTO_UEH'] },
    { id: 'conforme_hidraulico', color: '#3b82f6', label: 'Conforme (Manning)', statuses: ['APTO_HIDRAULICO', 'APTO_UEH_MANNING'] },
    { id: 'conforme_nch1105', color: '#14b8a6', label: 'Conforme (NCh 1105)', statuses: ['CONFORME_NCH1105'] },
    { id: 'no_conforme', color: '#ef4444', label: 'No Conforme', statuses: ['NO_CONFORME'] },
    { id: 'no_evaluado', color: '#94a3b8', label: 'No Evaluado', statuses: ['NO_EVALUADO'] }
];

/**
 * Normalizes a value between 0 and 1 within a range
 */
const normalize = (val: number, min: number, max: number): number => {
    return Math.max(0, Math.min(1, (val - min) / (max - min)));
};

/**
 * Interpolates between two hex colors
 */
const interpolateColor = (color1: string, color2: string, factor: number): string => {
    const r1 = parseInt(color1.substring(1, 3), 16);
    const g1 = parseInt(color1.substring(3, 5), 16);
    const b1 = parseInt(color1.substring(5, 7), 16);

    const r2 = parseInt(color2.substring(1, 3), 16);
    const g2 = parseInt(color2.substring(3, 5), 16);
    const b2 = parseInt(color2.substring(5, 7), 16);

    const r = Math.round(r1 + (r2 - r1) * factor);
    const g = Math.round(g1 + (g2 - g1) * factor);
    const b = Math.round(b1 + (b2 - b1) * factor);

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

/**
 * Color logic for compliance status with custom colors
 */
const resolveComplianceLegendItem = (status: string | undefined): ComplianceLegendItem => {
    if (!status) return COMPLIANCE_LEGEND_ITEMS[COMPLIANCE_LEGEND_ITEMS.length - 1];
    return COMPLIANCE_LEGEND_ITEMS.find(item => item.statuses.some(value => value === status)) || COMPLIANCE_LEGEND_ITEMS[COMPLIANCE_LEGEND_ITEMS.length - 1];
};

export const getComplianceColor = (status: string | undefined, customColors?: Record<string, string>): string => {
    const item = resolveComplianceLegendItem(status);
    return customColors?.[item.id] || item.color;
};

/**
 * Main color calculation function
 */
export const getPipeColor = (
    pipe: Pipe,
    mode: VisualizationMode,
    results: Results | null,
    settings: ProjectSettings,
    customColors?: Record<string, Record<string, string>>
): string => {
    if (mode === 'none') return '#475569'; // Default line color

    const verification = results?.verifications?.[pipe.id];
    const modeColors = customColors?.[mode] || {};

    if (mode === 'compliance') {
        return getComplianceColor(verification?.status, modeColors);
    }

    // For other modes, we need calculated results
    if (!results) return '#94a3b8';

    switch (mode) {
        case 'ueh': {
            const ueh = Number(pipe.uehTransportadas.value) || 0;
            if (ueh === 0) return '#cbd5e1';
            const color1 = modeColors['ueh_0'] || '#22d3ee';
            const color2 = modeColors['ueh_500'] || '#3b82f6';
            const color3 = modeColors['ueh_2000'] || '#7c3aed';
            if (ueh < 500) return interpolateColor(color1, color2, normalize(ueh, 0, 500));
            return interpolateColor(color2, color3, normalize(ueh, 500, 2000));
        }

        case 'velocity': {
            const v = (results as any).velocities?.[pipe.id] || (verification as any)?.velocity || (verification as any)?.manningResult?.velocity || 0;
            if (v === 0 && !verification) return '#cbd5e1';


            const colorLow = modeColors['vel_low'] || '#ef4444';
            const colorOptimal = modeColors['vel_optimal'] || '#10b981';
            const colorHigh = modeColors['vel_high'] || '#f59e0b';
            const colorCritical = modeColors['vel_critical'] || '#ef4444';

            if (v < 0.6) return interpolateColor(colorLow, colorHigh, normalize(v, 0, 0.6));
            if (v <= 1.5) return colorOptimal;
            if (v <= 3.0) return interpolateColor(colorOptimal, colorHigh, normalize(v, 1.5, 3.0));
            return colorCritical;
        }

        case 'filling_ratio': {
            const ratio = (verification as any)?.manningResult?.fillRatio || 0;
            if (ratio === 0) return '#cbd5e1';

            const colorLow = modeColors['fill_low'] || '#f59e0b';
            const colorOptimal = modeColors['fill_optimal'] || '#10b981';
            const colorHigh = modeColors['fill_high'] || '#ef4444';
            const colorCritical = modeColors['fill_critical'] || '#7f1d1d';

            if (ratio < 0.3) return interpolateColor(colorLow, colorOptimal, normalize(ratio, 0, 0.3));
            if (ratio <= 0.7) return colorOptimal;
            if (ratio <= 0.8) return interpolateColor(colorOptimal, colorHigh, normalize(ratio, 0.7, 0.8));
            return colorCritical;
        }

        case 'slope': {
            const s = Number(pipe.slope.value) || 0;
            const colorLow = modeColors['slope_low'] || '#f59e0b';
            const colorStandard = modeColors['slope_standard'] || '#10b981';
            const colorHigh = modeColors['slope_high'] || '#166534';
            const colorVeryHigh = modeColors['slope_very_high'] || '#6366f1';

            if (s < 1) return colorLow;
            if (s <= 4) return colorStandard;
            if (s <= 10) return interpolateColor(colorStandard, colorHigh, normalize(s, 4, 10));
            if (s <= 15) return colorHigh;
            return colorVeryHigh;
        }

        default:
            return '#475569';
    }
};
