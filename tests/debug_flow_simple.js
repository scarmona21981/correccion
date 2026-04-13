
const calculateFlowAccumulation = (chambers, pipes) => {
    const errors = [];
    const memo = new Map();
    const visiting = new Set();

    // SYSTEMATIC RESET
    const initialPipes = pipes.map(p => ({
        ...p,
        qContinuous: { value: 0, origin: 'calculated' },
        hasUpstreamInput: false
    }));

    // Build adjacency: EndNode -> [StartNode]
    const upstreamMap = new Map();
    initialPipes.forEach(p => {
        if (p.startNodeId && p.endNodeId) {
            const list = upstreamMap.get(p.endNodeId) || [];
            list.push(p.startNodeId);
            upstreamMap.set(p.endNodeId, list);
        }
    });

    const getAccumulatedFlow = (chamberId) => {
        if (visiting.has(chamberId)) {
            errors.push('Cycle detected');
            return { flow: 0, hasInput: false };
        }
        if (memo.has(chamberId)) return memo.get(chamberId);

        const chamber = chambers.find(c => c.id === chamberId);
        if (!chamber) return { flow: 0, hasInput: false };

        visiting.add(chamberId);

        let sumUpstream = 0;
        let hasInput = false;
        const upstreams = upstreamMap.get(chamberId) || [];

        upstreams.forEach(upId => {
            const res = getAccumulatedFlow(upId);
            sumUpstream += res.flow;
            if (res.hasInput) hasInput = true;
        });

        const localQin = Number(chamber.Qin?.value || 0);
        if (localQin > 0) hasInput = true;

        const total = localQin + sumUpstream;

        visiting.delete(chamberId);
        const result = { flow: total, hasInput };
        memo.set(chamberId, result);
        return result;
    };

    const updatedPipes = initialPipes.map(p => {
        if (!p.startNodeId) return p;
        const res = getAccumulatedFlow(p.startNodeId);
        return {
            ...p,
            qContinuous: {
                value: res.flow,
                origin: 'calculated'
            },
            hasUpstreamInput: res.hasInput
        };
    });

    return { chambers, pipes: updatedPipes, errors };
};

// --- TEST CASE ---

const mockChamber = (id, qin) => ({
    id, userDefinedId: id,
    Qin: { value: qin, origin: 'manual' }
});

const mockPipe = (id, start, end) => ({
    id, userDefinedId: id,
    startNodeId: start, endNodeId: end,
    qContinuous: { value: 0, origin: 'calculated' }
});

const chambers = [
    mockChamber('A', 10),
    mockChamber('B', 5),
    mockChamber('C', 0)
];

const pipes = [
    mockPipe('P1', 'A', 'B'),
    mockPipe('P2', 'B', 'C')
];

console.log('Running Flow Accumulation Test...');
const result = calculateFlowAccumulation(chambers, pipes);

result.pipes.forEach(p => {
    console.log(`Pipe ${p.userDefinedId} (${p.startNodeId}->${p.endNodeId}): Q=${p.qContinuous.value}`);
});

// Verification
const p1 = result.pipes.find(p => p.id === 'P1');
const p2 = result.pipes.find(p => p.id === 'P2');
const cB = result.chambers.find(c => c.id === 'B');
const cC = result.chambers.find(c => c.id === 'C');

if (p1.qContinuous.value === 10 && p2.qContinuous.value === 15 && cB.qinAcumulado.value === 15 && cC.qinAcumulado.value === 15) {
    console.log('SUCCESS: Flow accumulation (Pipes & Chambers) works as expected.');
} else {
    console.log('FAILURE: Flow accumulation mismatch.');
    console.log('Chamber B:', cB.qinAcumulado.value);
    console.log('Chamber C:', cC.qinAcumulado.value);
}
