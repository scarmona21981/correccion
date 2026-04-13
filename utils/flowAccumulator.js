"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateFlowAccumulation = void 0;
/**
 * Calculates Continuous Flow accumulation (NCh 1105) for a network.
 * Rule: Q_tramo = Sum(Q_in_upstream)
 *
 * SYSTEMATIC RESET RULES:
 * 1. Pipe.qContinuous is RESET to 0 before accumulation.
 * 2. Only Chamber.Qin is considered as a source. Use 0 if undefined.
 */
const calculateFlowAccumulation = (chambers, pipes) => {
    const errors = [];
    const memo = new Map();
    const visiting = new Set();
    // SYSTEMATIC RESET: Ensure all pipes start clean
    // This prevents "ghost flows" from previous calculations being carried over
    const initialPipes = pipes.map(p => ({
        ...p,
        qContinuous: { value: 0, origin: 'calculated' },
        hasUpstreamInput: false
    }));
    // Build adjacency for upstream lookup (who feeds into this chamber?)
    // map: targetChamberId -> list of sourceChamberIds
    const upstreamMap = new Map();
    initialPipes.forEach(p => {
        if (p.startNodeId && p.endNodeId) {
            const list = upstreamMap.get(p.endNodeId) || [];
            list.push(p.startNodeId);
            upstreamMap.set(p.endNodeId, list);
        }
    });
    /**
     * Recursive function to get total accumulated flow at a chamber.
     * Flow at Chamber = Chamber.Qin + Sum(Flow at Upstream Chambers)
     * Returns { flow, hasInput }
     */
    const getAccumulatedFlow = (chamberId) => {
        // Cycle detection
        if (visiting.has(chamberId)) {
            if (!errors.includes('Error: ciclo de flujo detectado en cámaras (Red Pública).')) {
                errors.push('Error: ciclo de flujo detectado en cámaras (Red Pública).');
            }
            return { flow: 0, hasInput: false };
        }
        // Memoization
        if (memo.has(chamberId))
            return memo.get(chamberId);
        // Find chamber - if not found, it contributes 0
        const chamber = chambers.find(c => c.id === chamberId);
        if (!chamber)
            return { flow: 0, hasInput: false };
        visiting.add(chamberId);
        let sumUpstream = 0;
        let hasInput = false;
        const upstreams = upstreamMap.get(chamberId) || [];
        upstreams.forEach(upId => {
            const res = getAccumulatedFlow(upId);
            sumUpstream += res.flow;
            if (res.hasInput)
                hasInput = true;
        });
        // SOURCE OF TRUTH: Chamber.Qin only.
        const localQin = Number(chamber.Qin?.value || 0);
        if (localQin > 0)
            hasInput = true;
        // Total at this node = Input at this node + Inputs from upstream
        // Note: In continuous flow, the flow AT the node is what enters the downstream pipe.
        const total = localQin + sumUpstream;
        visiting.delete(chamberId);
        const result = { flow: total, hasInput };
        memo.set(chamberId, result);
        return result;
    };
    // Calculate flows for all pipes
    // Flow in Pipe = Accumulated Flow at Start Node
    const updatedPipes = initialPipes.map(p => {
        if (!p.startNodeId)
            return p;
        const res = getAccumulatedFlow(p.startNodeId);
        return {
            ...p,
            qContinuous: {
                value: res.flow,
                origin: 'calculated'
            },
            qinTransportado: {
                value: res.flow,
                origin: 'calculated'
            },
            hasUpstreamInput: res.hasInput
        };
    });
    // Calculate flows for all chambers
    // Accumulated Flow at Chamber = Total flow passing through or entering this node
    const updatedChambers = chambers.map(c => {
        const res = getAccumulatedFlow(c.id);
        return {
            ...c,
            qinAcumulado: {
                value: res.flow,
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
exports.calculateFlowAccumulation = calculateFlowAccumulation;
