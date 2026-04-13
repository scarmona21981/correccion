"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateQwwAccumulation = void 0;
const qwwTables_1 = require("../hydraulics/qwwTables");
function sanitizeFixtureLoads(loads) {
    if (!Array.isArray(loads))
        return [];
    return loads
        .filter(item => item && typeof item === 'object')
        .map(item => ({
        fixtureKey: String(item.fixtureKey || '').trim(),
        quantity: Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : 0,
        usageClass: (0, qwwTables_1.normalizeUsageClass)(item.usageClass)
    }))
        .filter(item => item.fixtureKey !== '' && item.quantity > 0);
}
function calculateOwnQwwFromFixtures(loads, sanitarySystemType) {
    const sum = loads.reduce((acc, load) => {
        const qdLmin = (0, qwwTables_1.getFixtureQD)(load.fixtureKey, sanitarySystemType);
        const k = (0, qwwTables_1.getKByUsageClass)(load.usageClass);
        return acc + (k * k * qdLmin * load.quantity) / 60;
    }, 0);
    return Math.sqrt(Math.max(0, sum));
}
const calculateQwwAccumulation = (chambers, pipes, sanitarySystemType) => {
    const errors = [];
    const memo = new Map();
    const visiting = new Set();
    const upstreamMap = new Map();
    pipes.forEach(p => {
        if (p.startNodeId && p.endNodeId) {
            const list = upstreamMap.get(p.endNodeId) || [];
            list.push(p.startNodeId);
            upstreamMap.set(p.endNodeId, list);
        }
    });
    const chamberById = new Map(chambers.map(c => [c.id, c]));
    const getAccumulated = (chamberId) => {
        if (visiting.has(chamberId)) {
            if (!errors.includes('Error: ciclo de acumulacion detectado en camaras (Qww).')) {
                errors.push('Error: ciclo de acumulacion detectado en camaras (Qww).');
            }
            return 0;
        }
        if (memo.has(chamberId))
            return memo.get(chamberId);
        const chamber = chamberById.get(chamberId);
        if (!chamber)
            return 0;
        visiting.add(chamberId);
        const fixtureLoads = sanitizeFixtureLoads(chamber.fixtureLoads);
        const ownQww = fixtureLoads.length > 0
            ? calculateOwnQwwFromFixtures(fixtureLoads, sanitarySystemType)
            : Number(chamber.qwwPropio?.value || 0);
        const upstreams = upstreamMap.get(chamberId) || [];
        const sumUpstream = upstreams.reduce((sum, upId) => sum + getAccumulated(upId), 0);
        const total = ownQww + sumUpstream;
        visiting.delete(chamberId);
        memo.set(chamberId, total);
        return total;
    };
    const updatedChambers = chambers.map(c => {
        const acc = getAccumulated(c.id);
        const fixtureLoads = sanitizeFixtureLoads(c.fixtureLoads);
        const own = fixtureLoads.length > 0
            ? calculateOwnQwwFromFixtures(fixtureLoads, sanitarySystemType)
            : Number(c.qwwPropio?.value || 0);
        return {
            ...c,
            fixtureLoads,
            qwwPropio: { value: own, origin: 'calculated' },
            qwwAcumulado: { value: acc, origin: 'calculated' }
        };
    });
    const updatedPipes = pipes.map(p => {
        const startChamber = updatedChambers.find(c => c.id === p.startNodeId);
        return {
            ...p,
            qwwTransportado: {
                value: startChamber ? Number(startChamber.qwwAcumulado?.value || 0) : 0,
                origin: 'calculated'
            }
        };
    });
    return {
        chambers: updatedChambers,
        pipes: updatedPipes,
        errors
    };
};
exports.calculateQwwAccumulation = calculateQwwAccumulation;
