
import { calculateFlowAccumulation } from './utils/flowAccumulator';
import { Chamber, Pipe } from './context/ProjectContext';

const mockChamber = (id: string, qin: number): Chamber => ({
    id, userDefinedId: id, x: 0, y: 0,
    CT: { value: 100, origin: 'manual' },
    H: { value: 1, origin: 'manual' },
    Cre: { value: 99, origin: 'calculated' },
    CRS: { value: 99, origin: 'calculated' },
    delta: { value: 0, origin: 'manual' },
    deltaMode: 'auto',
    Qin: { value: qin, origin: 'manual' },
    uehPropias: { value: 0, origin: 'manual' },
    uehAcumuladas: { value: 0, origin: 'calculated' },
    chamberType: 'Pública',
    chamberDimension: '120'
});

const mockPipe = (id: string, start: string, end: string): Pipe => ({
    id, userDefinedId: id, x1: 0, y1: 0, x2: 0, y2: 0,
    startNodeId: start, endNodeId: end,
    material: { value: 'PVC', origin: 'manual' },
    diameter: { value: 200, origin: 'manual' },
    length: { value: 10, origin: 'manual' },
    slope: { value: 1, origin: 'manual' },
    uehTransportadas: { value: 0, origin: 'calculated' },
    qContinuous: { value: 0, origin: 'calculated' }
});

// Case 1: Linear A -> B -> C
// A (Qin=10) -> Pipe1 -> B (Qin=5) -> Pipe2 -> C (Qin=0)
const chambers = [
    mockChamber('A', 10),
    mockChamber('B', 5),
    mockChamber('C', 0)
];

const pipes = [
    mockPipe('P1', 'A', 'B'),
    mockPipe('P2', 'B', 'C')
];

const result = calculateFlowAccumulation(chambers, pipes);

console.log('--- Test Results ---');
result.pipes.forEach(p => {
    console.log(`Pipe ${p.userDefinedId}: Q=${p.qContinuous?.value}`);
});

// Verification
const p1 = result.pipes.find(p => p.id === 'P1');
const p2 = result.pipes.find(p => p.id === 'P2');

if (p1?.qContinuous?.value === 10 && p2?.qContinuous?.value === 15) {
    console.log('SUCCESS: Flow accumulation is correct.');
} else {
    console.error('FAILURE: Flow accumulation is incorrect.');
}
