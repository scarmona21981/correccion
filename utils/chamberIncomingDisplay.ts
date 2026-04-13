import type { Chamber, Pipe } from '../context/ProjectContext';
import { resolveEffectivePipeRole } from './pipeRole';

const hasPipeManualSlope = (pipe: Pipe): boolean => {
    if (typeof pipe.slopeLocked === 'boolean') return pipe.slopeLocked;
    return !!pipe.isSlopeManual;
};

export interface ChamberIncomingDisplayItem {
    pipeId: string;
    pipeLabel: string;
    cre: number;
    delta: number;
    h: number;
    isDeltaEditable: boolean;
    isManual: boolean;
}

const toFiniteNumber = (value: unknown): number | null => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
};

export const buildChamberIncomingDisplay = (
    chamber: Chamber,
    pipes: Pipe[]
): ChamberIncomingDisplayItem[] => {
    const ct = toFiniteNumber(chamber.CT?.value) ?? 0;
    const crs = toFiniteNumber(chamber.CRS?.value) ?? 0;
    const deltaDefault = toFiniteNumber(chamber.delta?.value) ?? 0;

    const visibleIncoming = (chamber.incomingElevations || [])
        .map((entry) => {
            const pipe = pipes.find(candidate => candidate.id === entry.pipeId);
            if (!pipe) return null;

            if (resolveEffectivePipeRole(pipe) === 'INTERIOR_RAMAL') return null;

            return {
                pipeId: entry.pipeId,
                pipeLabel: pipe.userDefinedId?.trim() || entry.pipeId,
                creFromEngine: toFiniteNumber(entry.value) ?? 0,
                hasManualSlope: hasPipeManualSlope(pipe),
            };
        })
        .filter((entry): entry is { pipeId: string; pipeLabel: string; creFromEngine: number; hasManualSlope: boolean } => entry !== null);

    if (visibleIncoming.length === 0) return [];

    return visibleIncoming
        .map((entry) => {
            // Delta editable para todos los tramos con pendiente automática.
            // Tramos con pendiente manual: su Cre viene de la geometría.
            const isDeltaEditable = !entry.hasManualSlope;
            const deltaManual = chamber.incomingDeltas?.[entry.pipeId];
            const autoDelta = entry.creFromEngine - crs;
            const delta = isDeltaEditable
                ? (toFiniteNumber(deltaManual) ?? deltaDefault)
                : autoDelta;
            const cre = isDeltaEditable
                ? (crs + delta)
                : entry.creFromEngine;

            return {
                pipeId: entry.pipeId,
                pipeLabel: entry.pipeLabel,
                cre,
                delta,
                h: ct - cre,
                isDeltaEditable,
                isManual: chamber.manualIncomingH?.[entry.pipeId] !== undefined,
            };
        })
        .sort((a, b) => a.pipeLabel.localeCompare(b.pipeLabel, undefined, { numeric: true, sensitivity: 'base' }));
};
