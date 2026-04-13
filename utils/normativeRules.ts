import { ProjectType } from '../context/ProjectContext';
import { PipeRole } from './pipeRole';

export interface NormativeAlert {
    type: 'warning' | 'recommendation';
    message: string;
}

export const getPipeNormativeAlerts = (
    projectType: ProjectType,
    pipeRole: PipeRole | undefined,
    diameter: number,
    slope: number
): NormativeAlert[] => {
    const alerts: NormativeAlert[] = [];

    if (pipeRole === 'INTERIOR_RAMAL') {
        if (diameter < 75) {
            alerts.push({ type: 'warning', message: 'Diámetro mín interior: 75mm (RIDAA)' });
        }
        if (diameter >= 75 && diameter < 110 && slope < 1) {
            alerts.push({ type: 'warning', message: 'Pendiente mín 75mm: 1%' });
        }
        if (diameter === 110 && slope < 1) {
            alerts.push({ type: 'warning', message: 'Pendiente mín 110mm: 1%' });
        }
    } else if (pipeRole === 'DESCARGA_HORIZ') {
        if (diameter < 110) {
            alerts.push({ type: 'warning', message: 'Diámetro mín descarga: 110mm (NCh3371)' });
        }
        if (diameter === 110 && slope < 1) {
            alerts.push({ type: 'warning', message: 'Pendiente mín 110mm: 1%' });
        } else if (diameter === 160 && slope < 1) {
            alerts.push({ type: 'warning', message: 'Pendiente mín 160mm: 1%' });
        }
    } else if (pipeRole === 'COLECTOR_EXTERIOR') {
        if (diameter < 200) {
            alerts.push({ type: 'warning', message: 'Diámetro mín colector: 200mm (NCh 1105)' });
        }
        if (slope < 0.5) {
            alerts.push({ type: 'warning', message: 'Pendiente mín colector: 0.5% (NCh 1105)' });
        }
        if (slope > 10) {
            alerts.push({ type: 'warning', message: 'Pendiente elevada (>10%). Verificar velocidad (>6m/s)' });
        }
    }

    return alerts;
};

export const getChamberNormativeAlerts = (
    projectType: ProjectType,
    pipeRole: PipeRole | undefined,
    depth: number
): NormativeAlert[] => {
    const alerts: NormativeAlert[] = [];

    return alerts;
};
