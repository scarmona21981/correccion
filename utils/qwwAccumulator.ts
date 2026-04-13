import { Chamber, Pipe } from '../context/ProjectContext';
import { ChamberFixtureLoad, getFixtureQD, getKByUsageClass, normalizeUsageClass, SanitarySystemType } from '../hydraulics/qwwTables';

export interface QwwResult {
    chambers: Chamber[];
    pipes: Pipe[];
    errors: string[];
}

function sanitizeFixtureLoads(loads: ChamberFixtureLoad[] | undefined): ChamberFixtureLoad[] {
    if (!Array.isArray(loads)) return [];

    return loads
        .filter(item => item && typeof item === 'object')
        .map(item => ({
            fixtureKey: String(item.fixtureKey || '').trim(),
            quantity: Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : 0,
            usageClass: normalizeUsageClass(item.usageClass)
        }))
        .filter(item => item.fixtureKey !== '' && item.quantity > 0);
}

function calculateOwnQwwFromFixtures(loads: ChamberFixtureLoad[], sanitarySystemType: SanitarySystemType): number {
    const sum = loads.reduce((acc, load) => {
        const qdLmin = getFixtureQD(load.fixtureKey, sanitarySystemType);
        const k = getKByUsageClass(load.usageClass);
        return acc + (k * k * qdLmin * load.quantity) / 60;
    }, 0);

    return Math.sqrt(Math.max(0, sum));
}

export const calculateQwwAccumulation = (
    chambers: Chamber[],
    pipes: Pipe[],
    sanitarySystemType: SanitarySystemType
): QwwResult => {
    const errors: string[] = [];
    const memo = new Map<string, number>();
    const visiting = new Set<string>();

    const upstreamMap = new Map<string, string[]>();
    pipes.forEach(p => {
        if (p.startNodeId && p.endNodeId) {
            const list = upstreamMap.get(p.endNodeId) || [];
            list.push(p.startNodeId);
            upstreamMap.set(p.endNodeId, list);
        }
    });

    const chamberById = new Map(chambers.map(c => [c.id, c]));

    const getAccumulated = (chamberId: string): number => {
        if (visiting.has(chamberId)) {
            if (!errors.includes('Error: ciclo de acumulacion detectado en camaras (Qww).')) {
                errors.push('Error: ciclo de acumulacion detectado en camaras (Qww).');
            }
            return 0;
        }

        if (memo.has(chamberId)) return memo.get(chamberId)!;

        const chamber = chamberById.get(chamberId);
        if (!chamber) return 0;

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
            qwwPropio: { value: own, origin: 'calculated' as const },
            qwwAcumulado: { value: acc, origin: 'calculated' as const }
        };
    });

    const updatedPipes = pipes.map(p => {
        const startChamber = updatedChambers.find(c => c.id === p.startNodeId);
        return {
            ...p,
            qwwTransportado: {
                value: startChamber ? Number(startChamber.qwwAcumulado?.value || 0) : 0,
                origin: 'calculated' as const
            }
        };
    });

    return {
        chambers: updatedChambers,
        pipes: updatedPipes,
        errors
    };
};
