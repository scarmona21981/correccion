import { CapacityRangeResult } from './capacityRange.types';

export interface ImprovementRec {
    title: string;
    description: string;
}

export function getCapacityImprovements(result: CapacityRangeResult): ImprovementRec[] {
    const recs: ImprovementRec[] = [];

    if (result.status === 'OPTIMO') {
        return [{ title: 'Sin mejoras', description: 'El tramo cumple con el rango poblacional normativo.' }];
    }

    if (result.status === 'SUBUTILIZADO') {
        recs.push({
            title: 'Subir pendiente',
            description: 'Incrementar la pendiente del tramo para mejorar la velocidad de autolavado.'
        });
        recs.push({
            title: 'Reducir diámetro',
            description: 'Disminuir el diámetro nominal (DN) para aumentar el tirante relativo (h/D) y la velocidad.'
        });
        recs.push({
            title: 'Sectorizar tributación',
            description: 'Redistribuir el flujo o sectorizar la red para mejorar la carga hidráulica en este tramo.'
        });
        recs.push({
            title: 'Revisar sobredimensionamiento',
            description: 'Verificar si el tramo está sobredimensionado para la carga de habitantes actual (P_base).'
        });
    }

    if (result.status === 'SOBRECARGADO') {
        recs.push({
            title: 'Aumentar diámetro',
            description: 'Incrementar el diámetro nominal (DN) para reducir el llenado relativo (h/D) a menos de 0.70.'
        });
        recs.push({
            title: 'Aumentar pendiente',
            description: 'Si es posible, aumentar la pendiente para incrementar la capacidad de conducción.'
        });
        recs.push({
            title: 'Redistribuir flujo',
            description: 'Derivar parte del caudal a otros ramales o colectores paralelos.'
        });
    }

    if (result.status === 'INCOMPATIBLE') {
        recs.push({
            title: 'Rediseño del tramo',
            description: 'El tramo no puede cumplir autolavado y capacidad simultáneamente. Se requiere una nueva combinación de Diámetro y Pendiente.'
        });
    }

    if (result.status === 'INDETERMINADO') {
        recs.push({
            title: 'Revisar datos de entrada',
            description: 'Verificar que el tramo tenga población (P_edge), caudal (Q_design), diámetro y material configurados.'
        });
    }

    return recs;
}
