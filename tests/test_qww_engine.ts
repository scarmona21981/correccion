import { calculateQwwAccumulation } from '../utils/qwwAccumulator';
import type { Chamber, Pipe } from '../context/ProjectContext';

const assertClose = (value: number, expected: number, tol: number, label: string) => {
    if (Math.abs(value - expected) > tol) {
        throw new Error(label + ': expected ' + expected.toFixed(6) + ' +/- ' + tol + ', got ' + value.toFixed(6));
    }
};

const makeChamber = (id: string): Chamber => ({
    id,
    userDefinedId: id,
    x: 0,
    y: 0,
    CT: { value: 100, origin: 'manual' },
    H: { value: 1.2, origin: 'manual' },
    Cre: { value: 98, origin: 'calculated' },
    CRS: { value: 98, origin: 'calculated' },
    delta: { value: 0, origin: 'manual' },
    deltaMode: 'auto',
    Qin: { value: 0, origin: 'manual' },
    uehPropias: { value: 0, origin: 'manual' },
    uehAcumuladas: { value: 0, origin: 'calculated' },
    chamberType: 'Pública',
    chamberDimension: '120 cm'
});

const makePipe = (id: string, startNodeId: string, endNodeId: string): Pipe => ({
    id,
    userDefinedId: id,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    startNodeId,
    endNodeId,
    material: { value: 'PVC', origin: 'manual' },
    diameter: { value: 110, origin: 'manual' },
    length: { value: 10, origin: 'manual' },
    slope: { value: 1, origin: 'calculated' },
    uehTransportadas: { value: 0, origin: 'calculated' }
});

console.log('--- test_qww_engine: system I accumulation ---');
const c1 = makeChamber('C1');
c1.fixtureLoads = [{ fixtureKey: 'INODORO_ESTANQUE_O_FLUSH', quantity: 1, usageClass: 1 }];
const c2 = makeChamber('C2');
c2.fixtureLoads = [{ fixtureKey: 'LAVAPLATOS', quantity: 1, usageClass: 2 }];
const p1 = makePipe('P1', 'C1', 'C2');

const resultI = calculateQwwAccumulation([c1, c2], [p1], 'I');
const ownC1_I = Math.sqrt((0.5 * 0.5 * 108) / 60);
const ownC2_I = Math.sqrt((0.7 * 0.7 * 36) / 60);

const outC1_I = resultI.chambers.find(c => c.id === 'C1');
const outC2_I = resultI.chambers.find(c => c.id === 'C2');
if (!outC1_I || !outC2_I) throw new Error('Missing chamber results for system I.');

assertClose(Number(outC1_I.qwwPropio?.value || 0), ownC1_I, 1e-9, 'C1 qwwPropio (I)');
assertClose(Number(outC2_I.qwwPropio?.value || 0), ownC2_I, 1e-9, 'C2 qwwPropio (I)');
assertClose(Number(outC2_I.qwwAcumulado?.value || 0), ownC1_I + ownC2_I, 1e-9, 'C2 qwwAcumulado (I)');

const outPipeI = resultI.pipes.find(p => p.id === 'P1');
if (!outPipeI) throw new Error('Missing pipe result for system I.');
assertClose(Number(outPipeI.qwwTransportado?.value || 0), ownC1_I, 1e-9, 'P1 qwwTransportado (I)');
console.log('OK system I accumulation');

console.log('--- test_qww_engine: system II effect on QD ---');
const resultII = calculateQwwAccumulation([c1, c2], [p1], 'II');
const ownC1_II = Math.sqrt((0.5 * 0.5 * 120) / 60);
const outC1_II = resultII.chambers.find(c => c.id === 'C1');
if (!outC1_II) throw new Error('Missing chamber C1 for system II.');
assertClose(Number(outC1_II.qwwPropio?.value || 0), ownC1_II, 1e-9, 'C1 qwwPropio (II)');
console.log('OK system II QD adjustment');

console.log('--- test_qww_engine: cycle detection ---');
const cyclePipe = makePipe('P2', 'C2', 'C1');
const cycleResult = calculateQwwAccumulation([c1, c2], [p1, cyclePipe], 'I');
if (!cycleResult.errors.some(e => e.includes('ciclo de acumulacion'))) {
    throw new Error('Expected cycle detection error in Qww accumulator.');
}
console.log('OK cycle detection');

console.log('All qww engine tests passed.');
