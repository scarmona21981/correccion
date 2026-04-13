"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculatePipeConnectionPoint = exports.calculateGeometry = void 0;
const getVal = (attr) => {
    if (attr && typeof attr === 'object' && 'value' in attr) {
        const v = Number(attr.value);
        return isNaN(v) ? 0 : v;
    }
    const v = Number(attr);
    return isNaN(v) ? 0 : v;
};
const round3 = (val) => parseFloat(val.toFixed(3));
const round4 = (val) => parseFloat(val.toFixed(4));
const chamberHasManualH = (chamber) => {
    if (typeof chamber.heightLocked === 'boolean') {
        return chamber.heightLocked;
    }
    const hAttr = chamber.H;
    return typeof hAttr === 'object' && hAttr?.origin === 'manual';
};
const pipeHasManualSlope = (pipe) => {
    if (typeof pipe.slopeLocked === 'boolean') {
        return pipe.slopeLocked;
    }
    return !!pipe.isSlopeManual;
};
const resolveFixedChamberGeometry = (chamber) => {
    const ctVal = getVal(chamber.CT);
    const hVal = getVal(chamber.H);
    const deltaVal = getVal(chamber.delta);
    const newCrs = round4(ctVal - hVal);
    const newCre = round4(newCrs + deltaVal);
    return {
        ...chamber,
        heightLocked: true,
        CRS: { value: newCrs, origin: 'calculated' },
        Cre: { value: newCre, origin: 'calculated' },
        H: { value: hVal, origin: 'manual' }
    };
};
const resolveFloatingChamberGeometry = (chamber, incomingElevations) => {
    const ctVal = getVal(chamber.CT);
    const deltaVal = getVal(chamber.delta);
    let newCre = 0;
    if (incomingElevations && incomingElevations.length > 0) {
        newCre = Math.min(...incomingElevations.map(e => e.value));
    }
    else {
        newCre = getVal(chamber.Cre);
    }
    const newCrs = round4(newCre - deltaVal);
    const newH = round4(ctVal - newCrs);
    return {
        ...chamber,
        heightLocked: false,
        Cre: { value: round4(newCre), origin: 'calculated' },
        CRS: { value: newCrs, origin: 'calculated' },
        H: { value: newH, origin: 'calculated' }
    };
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
const calculateGeometry = (chambers, pipes) => {
    const errors = [];
    // 1. Map connections
    const inletPipes = new Map(); // chamberId -> pipeIds
    const outletPipes = new Map(); // chamberId -> pipeIds
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
    const updatedChambers = chambers.map(c => {
        const inlets = inletPipes.get(c.id) || [];
        const hasCRe = inlets.length >= 2;
        let chamber = { ...c, hasCRe };
        if (chamberHasManualH(chamber)) {
            chamber = resolveFixedChamberGeometry(chamber);
        }
        return chamber;
    });
    let processedPipes = [...pipes];
    let finalChambers = [...updatedChambers];
    const memo = new Set();
    const visiting = new Set();
    const propagateFrom = (chamberId) => {
        if (visiting.has(chamberId)) {
            if (!errors.includes('Ciclo geométrico detectado.')) {
                errors.push('Ciclo geométrico detectado.');
            }
            return;
        }
        if (memo.has(chamberId))
            return;
        visiting.add(chamberId);
        const chamber = finalChambers.find(c => c.id === chamberId);
        if (!chamber) {
            visiting.delete(chamberId);
            return;
        }
        const outlets = outletPipes.get(chamberId) || [];
        outlets.forEach(pipeId => {
            const pipeIdx = processedPipes.findIndex(p => p.id === pipeId);
            if (pipeIdx === -1)
                return;
            let pipe = processedPipes[pipeIdx];
            const startNode = chamber;
            const endNodeId = pipe.endNodeId;
            if (!endNodeId)
                return;
            const length = getVal(pipe.length);
            // 1. Calculate the radier elevation at the END of this specific pipe
            let pipeEndElevation = 0;
            if (pipeHasManualSlope(pipe) && pipe.manualSlope) {
                const manualSlopeVal = getVal(pipe.manualSlope);
                pipeEndElevation = round4(getVal(startNode.CRS) - (manualSlopeVal / 100 * length));
                pipe = {
                    ...pipe,
                    slopeLocked: true,
                    isSlopeManual: true,
                    slope: { value: manualSlopeVal, origin: 'manual' }
                };
            }
            else {
                const nextChamber = finalChambers.find(c => c.id === endNodeId);
                if (nextChamber && length > 0) {
                    const creFin = getVal(nextChamber.Cre);
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
                }
                else {
                    incomingElevs.push(newElevEntry);
                }
                if (incomingElevs.length > 0) {
                    let nextChamberToUpdate = {
                        ...nextChamber,
                        incomingElevations: [...incomingElevs]
                    };
                    if (chamberHasManualH(nextChamberToUpdate)) {
                        // Mantener cámara fija pero actualizar incomingElevations
                        nextChamberToUpdate = resolveFixedChamberGeometry(nextChamberToUpdate);
                    }
                    else {
                        // H es auto, resolver con minIncoming
                        nextChamberToUpdate = resolveFloatingChamberGeometry(nextChamberToUpdate, incomingElevs);
                    }
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
            }
            else {
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
        if (!memo.has(c.id))
            propagateFrom(c.id);
    });
    return {
        chambers: finalChambers,
        pipes: processedPipes,
        errors
    };
};
exports.calculateGeometry = calculateGeometry;
/**
 * Calculates the exact connection point on the perimeter of a node (Project to Radius).
 *
 * @param center - Center {x, y} of the node.
 * @param radius - Real radius of the node (in model units).
 * @param target - Target point {x, y} (the other end of the pipe).
 * @returns The new point {x, y} on the node's perimeter.
 */
const calculatePipeConnectionPoint = (center, radius, target) => {
    const dx = target.x - center.x;
    const dy = target.y - center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // If point is inside or very close, just return center (or maybe keep existing behavior)
    // But logically, a pipe must leave the node.
    // If distance is 0, we can't project. Return center.
    if (dist === 0)
        return center;
    // Vector normalization and scaling
    const scale = radius / dist;
    return {
        x: center.x + dx * scale,
        y: center.y + dy * scale
    };
};
exports.calculatePipeConnectionPoint = calculatePipeConnectionPoint;
