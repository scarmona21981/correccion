import { Chamber, Pipe } from '../context/ProjectContext';

export interface UEHResult {
    chambers: Chamber[];
    pipes: Pipe[];
    errors: string[];
}

/**
 * Calculates UEH accumulation for a network of chambers and pipes.
 * Rule: UEH Acumuladas = UEH Propias + sum(UEH Acumuladas of upstream chambers)
 */
export const calculateUEHAccumulation = (chambers: Chamber[], pipes: Pipe[]): UEHResult => {
    const errors: string[] = [];
    const memo = new Map<string, number>();
    const visiting = new Set<string>();

    // Build adjacency for upstream lookup (who feeds into this chamber?)
    // map: targetChamberId -> list of sourceChamberIds
    const upstreamMap = new Map<string, string[]>();
    pipes.forEach(p => {
        if (p.startNodeId && p.endNodeId) {
            const list = upstreamMap.get(p.endNodeId) || [];
            list.push(p.startNodeId);
            upstreamMap.set(p.endNodeId, list);
        }
    });

    const getAccumulated = (chamberId: string): number => {
        // Cycle detection
        if (visiting.has(chamberId)) {
            if (!errors.includes('Error: ciclo de acumulación detectado en cámaras.')) {
                errors.push('Error: ciclo de acumulación detectado en cámaras.');
            }
            return 0;
        }

        // Memoization
        if (memo.has(chamberId)) return memo.get(chamberId)!;

        const chamber = chambers.find(c => c.id === chamberId);
        if (!chamber) return 0;

        visiting.add(chamberId);

        let sumUpstream = 0;
        const upstreams = upstreamMap.get(chamberId) || [];

        upstreams.forEach(upId => {
            sumUpstream += getAccumulated(upId);
        });

        const total = Number(chamber.uehPropias?.value || 0) + sumUpstream;

        visiting.delete(chamberId);
        memo.set(chamberId, total);
        return total;
    };

    // Calculate for all chambers
    const updatedChambers = chambers.map(c => {
        const accValue = getAccumulated(c.id);
        return {
            ...c,
            uehAcumuladas: { value: accValue, origin: 'calculated' as const }
        };
    });

    // Calculate for all pipes
    const updatedPipes = pipes.map(p => {
        const startChamber = updatedChambers.find(c => c.id === p.startNodeId);
        return {
            ...p,
            uehTransportadas: {
                value: startChamber ? startChamber.uehAcumuladas.value : 0,
                origin: 'calculated' as const
            }
        };
    });

    // Check for terminal chambers (cámaras sin salida)
    updatedChambers.forEach(c => {
        const hasDownstream = pipes.some(p => p.startNodeId === c.id);
        if (!hasDownstream) {
            // It's a terminal chamber. In some contexts this is intended, 
            // but the user requested an explicit warning.
            errors.push(`Advertencia: cámara ${c.userDefinedId} terminal sin tramo aguas abajo.`);
        }
    });

    return {
        chambers: updatedChambers,
        pipes: updatedPipes,
        errors
    };
};
