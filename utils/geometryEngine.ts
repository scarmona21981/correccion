import type { Chamber, Pipe } from '../context/ProjectContext';

export interface GeometryResult {
    chambers: Chamber[];
    pipes: Pipe[];
    errors: string[];
}

/**
 * Helper Utilities
 */
export const getVal = (attr: any): number => {
    if (attr && typeof attr === 'object' && 'value' in attr) {
        const v = Number(attr.value);
        return isNaN(v) ? 0 : v;
    }
    const v = Number(attr);
    return isNaN(v) ? 0 : v;
};

export const round3 = (val: number): number => parseFloat(val.toFixed(3));
export const round4 = (val: number): number => parseFloat(val.toFixed(4));

export const resolveIncomingDelta = (chamber: Chamber, pipeId: string): number => {
    const fromMapRaw = (chamber.incomingDeltas as any)?.[pipeId];
    const fromMap = Number(fromMapRaw);
    if (Number.isFinite(fromMap)) return fromMap;
    return getVal(chamber.delta);
};

const findLowestIncomingEntry = (
    incomingElevations: { value: number; pipeId: string }[] | undefined
): { value: number; pipeId: string } | null => {
    if (!incomingElevations || incomingElevations.length === 0) return null;
    return incomingElevations.reduce((lowest, current) => current.value < lowest.value ? current : lowest);
};

export const chamberHasManualH = (chamber: Chamber): boolean => {
    if (typeof chamber.heightLocked === 'boolean') {
        return chamber.heightLocked;
    }

    const hAttr: any = chamber.H;
    return typeof hAttr === 'object' && hAttr?.origin === 'manual';
};

export const pipeHasManualSlope = (pipe: Pipe): boolean => {
    if (typeof pipe.slopeLocked === 'boolean') {
        return pipe.slopeLocked;
    }

    return !!pipe.isSlopeManual;
};

export const resolveFixedChamberGeometry = (chamber: Chamber): Chamber => {
    const ctVal = getVal(chamber.CT);
    const hVal = getVal(chamber.H);

    const newCrs = round4(ctVal - hVal);
    const lowestIncoming = findLowestIncomingEntry(chamber.incomingElevations);
    const newCre = lowestIncoming
        ? round4(lowestIncoming.value)
        : round4(newCrs + getVal(chamber.delta));

    return {
        ...chamber,
        heightLocked: true,
        CRS: { value: newCrs, origin: 'calculated' },
        Cre: { value: newCre, origin: 'calculated' },
        H: { value: hVal, origin: 'manual' }
    };
};

export const resolveFloatingChamberGeometry = (chamber: Chamber, incomingElevations: { value: number, pipeId: string }[]): Chamber => {
    const ctVal = getVal(chamber.CT);

    const hasIncoming = incomingElevations && incomingElevations.length > 0;
    const lowestIncoming = findLowestIncomingEntry(incomingElevations);

    const newCrs = hasIncoming && lowestIncoming
        ? round4(lowestIncoming.value - resolveIncomingDelta(chamber, lowestIncoming.pipeId))
        : round4(getVal(chamber.CRS));

    const newCre = hasIncoming && lowestIncoming
        ? round4(lowestIncoming.value)
        : round4(getVal(chamber.Cre));

    const newH = round4(ctVal - newCrs);

    return {
        ...chamber,
        heightLocked: false,
        Cre: { value: newCre, origin: 'calculated' },
        CRS: { value: newCrs, origin: 'calculated' },
        H: { value: newH, origin: 'calculated' }
    };
};

const resolveTargetInletElevation = (chamber: Chamber, pipeId: string): number => {
    const manualH = chamber.manualIncomingH?.[pipeId];
    if (manualH !== undefined) {
        return round4(getVal(chamber.CT) - Number(manualH));
    }

    const incoming = chamber.incomingElevations?.find(e => e.pipeId === pipeId)?.value;
    if (typeof incoming === 'number' && Number.isFinite(incoming)) return round4(incoming);

    const lowestIncoming = findLowestIncomingEntry(chamber.incomingElevations);
    if (lowestIncoming && lowestIncoming.pipeId === pipeId) {
        return round4(getVal(chamber.CRS) + resolveIncomingDelta(chamber, pipeId));
    }

    return round4(getVal(chamber.Cre));
};

const syncIncomingElevationsToDeltas = (
    chamber: Chamber,
    pipes: Pipe[],
    chambers: Chamber[]
): { chamber: Chamber; pipes: Pipe[] } => {
    const incoming = chamber.incomingElevations || [];
    if (incoming.length === 0) return { chamber, pipes };

    const crsVal = getVal(chamber.CRS);
    const nextIncoming = incoming.map(entry => ({ ...entry }));
    let nextPipes = [...pipes];

    for (let i = 0; i < nextIncoming.length; i++) {
        const entry = nextIncoming[i];
        const pipe = nextPipes.find(p => p.id === entry.pipeId);
        if (!pipe) continue;

        // Legacy override: manual H por tramo fija Cre(tramo).
        const manualH = chamber.manualIncomingH?.[entry.pipeId];
        if (manualH !== undefined) {
            entry.value = round4(getVal(chamber.CT) - Number(manualH));
            continue;
        }

        // Tramos con pendiente manual: su Cre viene de la geometría, no del delta.
        if (pipeHasManualSlope(pipe)) continue;

        // Tramos con pendiente automática: Cre = CRS + delta.

        const desiredCre = round4(crsVal + resolveIncomingDelta(chamber, entry.pipeId));
        entry.value = desiredCre;

        const startId = pipe.startNodeId;
        const start = startId ? chambers.find(c => c.id === startId) : undefined;
        const length = getVal(pipe.length);
        if (!start || length <= 0) continue;

        const calcSlope = round3((getVal(start.CRS) - desiredCre) / length * 100);
        const idx = nextPipes.findIndex(p => p.id === pipe.id);
        if (idx !== -1) {
            nextPipes[idx] = {
                ...pipe,
                slopeLocked: false,
                isSlopeManual: false,
                slope: { value: isNaN(calcSlope) ? 0 : calcSlope, origin: 'calculated' }
            };
        }
    }

    const minCre = Math.min(...nextIncoming.map(e => e.value));
    const nextChamber: Chamber = {
        ...chamber,
        incomingElevations: nextIncoming,
        Cre: { value: round4(minCre), origin: 'calculated' }
    };

    return { chamber: nextChamber, pipes: nextPipes };
};

/**
 * Geometry Engine
 * 
 * Centralizes the logic for:
 * 1. Automatic CRe assignment based on pipe connections.
 * 2. Manual slope calculation and downstream propagation.
 * 3. Consistent geometric recalculation (Cre, CRS, H, Slope).
 * 4. Multi-CRE support (each inlet elevation is tracked).
 * 5. Universal H override support.
 */
export const calculateGeometry = (chambers: Chamber[], pipes: Pipe[]): GeometryResult => {
    const errors: string[] = [];

    // 1. Map connections
    const inletPipes = new Map<string, string[]>(); // chamberId -> pipeIds
    const outletPipes = new Map<string, string[]>(); // chamberId -> pipeIds

    pipes.forEach(p => {
        if (p.startNodeId) {
            const list = outletPipes.get(p.startNodeId) || [];
            list.push(p.id);
            outletPipes.set(p.startNodeId, list);
        }
        if (p.endNodeId) {
            const list = inletPipes.get(p.endNodeId) || [];
            list.push(p.id);
            inletPipes.set(p.endNodeId, list);
        }
    });

    // 2. Identify "Reunion" Chambers and PRE-RESOLVE MANUAL H
    const updatedChambers: Chamber[] = chambers.map(c => {
        const inlets = inletPipes.get(c.id) || [];
        const hasCRe = inlets.length >= 2;
        let chamber: Chamber = { ...c, hasCRe };
        if (chamberHasManualH(chamber)) {
            chamber = resolveFixedChamberGeometry(chamber);
        }
        return chamber;
    });

    let processedPipes: Pipe[] = [...pipes];
    let finalChambers: Chamber[] = [...updatedChambers];

    const memo = new Set<string>();
    const visiting = new Set<string>();

    const propagateFrom = (chamberId: string) => {
        if (visiting.has(chamberId)) {
            if (!errors.includes('Ciclo geométrico detectado.')) {
                errors.push('Ciclo geométrico detectado.');
            }
            return;
        }
        if (memo.has(chamberId)) return;

        visiting.add(chamberId);

        const chamber = finalChambers.find(c => c.id === chamberId);
        if (!chamber) {
            visiting.delete(chamberId);
            return;
        }

        const outlets = outletPipes.get(chamberId) || [];
        outlets.forEach(pipeId => {
            const pipeIdx = processedPipes.findIndex(p => p.id === pipeId);
            if (pipeIdx === -1) return;

            let pipe = processedPipes[pipeIdx];
            const startNode = chamber;
            const endNodeId = pipe.endNodeId;
            if (!endNodeId) return;

            const length = getVal(pipe.length);

            // 1. Calculate the radier elevation at the END of this specific pipe
            let pipeEndElevation = 0;

            const nextChamberForManual = finalChambers.find(c => c.id === endNodeId);
            const downstreamManualH = nextChamberForManual?.manualIncomingH?.[pipe.id];

            if (downstreamManualH !== undefined && length > 0) {
                // Manual H per tramo: back-calculate Cre and slope from the manually set depth
                const nextCT = getVal(nextChamberForManual!.CT);
                pipeEndElevation = round4(nextCT - downstreamManualH);
                const calcSlope = round3((getVal(startNode.CRS) - pipeEndElevation) / length * 100);
                pipe = {
                    ...pipe,
                    slopeLocked: false,
                    isSlopeManual: false,
                    slope: { value: isNaN(calcSlope) ? 0 : calcSlope, origin: 'calculated' }
                };
            } else if (pipeHasManualSlope(pipe) && pipe.manualSlope) {
                const manualSlopeVal = getVal(pipe.manualSlope);
                pipeEndElevation = round4(getVal(startNode.CRS) - (manualSlopeVal / 100 * length));
                pipe = {
                    ...pipe,
                    slopeLocked: true,
                    isSlopeManual: true,
                    slope: { value: manualSlopeVal, origin: 'manual' }
                };
            } else {
                const nextChamber = finalChambers.find(c => c.id === endNodeId);
                if (nextChamber && length > 0) {
                    const creFin = resolveTargetInletElevation(nextChamber, pipe.id);
                    const fall = getVal(startNode.CRS) - creFin;
                    const calcSlope = round3((fall / length) * 100);
                    pipe = {
                        ...pipe,
                        slopeLocked: false,
                        isSlopeManual: false,
                        slope: { value: isNaN(calcSlope) ? 0 : calcSlope, origin: 'calculated' }
                    };
                    pipeEndElevation = creFin;
                }
            }

            processedPipes[pipeIdx] = pipe;

            // 2. Update the downstream chamber's elevations
            const nextChamberIdx = finalChambers.findIndex(c => c.id === endNodeId);
            if (nextChamberIdx !== -1) {
                let nextChamber = finalChambers[nextChamberIdx];

                const incomingElevs = nextChamber.incomingElevations || [];
                const existingIdx = incomingElevs.findIndex(e => e.pipeId === pipe.id);
                const newElevEntry = { pipeId: pipe.id, value: round4(pipeEndElevation) };

                if (existingIdx !== -1) {
                    incomingElevs[existingIdx] = newElevEntry;
                } else {
                    incomingElevs.push(newElevEntry);
                }

                if (incomingElevs.length > 0) {
                    let nextChamberToUpdate = {
                        ...nextChamber,
                        incomingElevations: [...incomingElevs]
                    } as Chamber;

                    if (chamberHasManualH(nextChamberToUpdate)) {
                        // Mantener cámara fija pero actualizar incomingElevations
                        nextChamberToUpdate = resolveFixedChamberGeometry(nextChamberToUpdate);
                    } else {
                        // H es auto, resolver con minIncoming
                        nextChamberToUpdate = resolveFloatingChamberGeometry(nextChamberToUpdate, incomingElevs);
                    }

                    // Sincronizar entradas: solo el tramo con menor Cre usa Δ manual.
                    const syncRes = syncIncomingElevationsToDeltas(nextChamberToUpdate, processedPipes, finalChambers);
                    nextChamberToUpdate = syncRes.chamber;
                    processedPipes = syncRes.pipes;

                    finalChambers[nextChamberIdx] = nextChamberToUpdate;
                }

                propagateFrom(endNodeId);
            }
        });

        visiting.delete(chamberId);
        memo.add(chamberId);
    };

    // Calculate source chambers
    const sources = chambers.filter(c => (inletPipes.get(c.id) || []).length === 0);
    sources.forEach(s => {
        const idx = finalChambers.findIndex(c => c.id === s.id);
        if (idx !== -1) {
            let source = finalChambers[idx];
            if (chamberHasManualH(source)) {
                source = resolveFixedChamberGeometry(source);
            } else {
                let hVal = getVal(source.H);
                if (hVal === 0) {
                    hVal = 0.60; // Default minimum depth for source chambers
                }
                const ctVal = getVal(source.CT);
                const newCrs = round4(ctVal - hVal);
                const newCre = round4(newCrs + getVal(source.delta));

                source = {
                    ...source,
                    heightLocked: false,
                    Cre: { value: isNaN(newCre) ? 0 : newCre, origin: 'calculated' },
                    CRS: { value: isNaN(newCrs) ? 0 : newCrs, origin: 'calculated' },
                    H: { value: hVal, origin: 'calculated' }
                };
            }
            finalChambers[idx] = source;
        }
        propagateFrom(s.id);
    });

    chambers.forEach(c => {
        if (!memo.has(c.id)) propagateFrom(c.id);
    });

    return {
        chambers: finalChambers,
        pipes: processedPipes,
        errors
    };
};

/**
 * Calculates the exact connection point on the perimeter of a node (Project to Radius).
 * 
 * @param center - Center {x, y} of the node.
 * @param radius - Real radius of the node (in model units).
 * @param target - Target point {x, y} (the other end of the pipe).
 * @returns The new point {x, y} on the node's perimeter.
 */
export const calculatePipeConnectionPoint = (
    center: { x: number, y: number },
    radius: number,
    target: { x: number, y: number }
): { x: number, y: number } => {
    const dx = target.x - center.x;
    const dy = target.y - center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // If point is inside or very close, just return center (or maybe keep existing behavior)
    // But logically, a pipe must leave the node.
    // If distance is 0, we can't project. Return center.
    if (dist === 0) return center;

    // Vector normalization and scaling
    const scale = radius / dist;

    return {
        x: center.x + dx * scale,
        y: center.y + dy * scale
    };
};
