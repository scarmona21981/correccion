import {
    convertToSourceNodes,
    ensureDirectedGraph,
    propagateSourcesFixpoint,
    classifyAllPipes,
    executeSourcePropagation,
    calculateHarmonCoefficient,
    calculateQbyHarmon,
    distributeQbyUEH,
    SourceNode,
    SourceEdge
} from '../../sourcePropagationEngine';
import { runTopologyAndApply, runTopologyPipeline } from '../runTopologyPipeline';
import { mapTopologyRoleToPipeRole, getRegimeForTopologyRole } from '../roleMapping';
import { resolveNormativeState } from '../../../utils/resolveNormativeState';

function makeMockChamber(
    id: string,
    chamberType: 'Domiciliaria' | 'Pública' | string,
    uehPropias: number,
    installationGroupId?: string,
    CT: number = 100
): any {
    return {
        id,
        userDefinedId: id,
        x: 0,
        y: 0,
        CT: { value: CT, origin: 'manual' as const },
        H: { value: 1.5, origin: 'manual' as const },
        Cre: { value: 98.5, origin: 'calculated' as const },
        CRS: { value: 98.5, origin: 'calculated' as const },
        delta: { value: 0, origin: 'manual' as const },
        deltaMode: 'auto' as const,
        Qin: { value: 0, origin: 'manual' as const },
        uehPropias: { value: uehPropias, origin: 'manual' as const },
        uehAcumuladas: { value: 0, origin: 'calculated' as const },
        chamberType,
        chamberDimension: '120 cm',
        installationGroupId
    };
}

function makeMockPipe(
    id: string,
    startNodeId: string,
    endNodeId: string,
    diameter: number = 110,
    slope: number = 2,
    length: number = 10
): any {
    return {
        id,
        userDefinedId: id,
        x1: 0,
        y1: 0,
        x2: 100,
        y2: 100,
        startNodeId,
        endNodeId,
        material: { value: 'PVC', origin: 'manual' as const },
        diameter: { value: diameter, origin: 'manual' as const },
        length: { value: length, origin: 'calculated' as const },
        slope: { value: slope, origin: 'calculated' as const },
        uehTransportadas: { value: 0, origin: 'calculated' as const }
    };
}

describe('Topology Engine', () => {
    
    describe('Test 1: Dos orígenes confluyen', () => {
        it('debe detectar 2 sources en tramo aguas abajo y clasificar PUB-PUB como LATERAL/NCh1105 (nuevo default)', () => {
            const chambers = [
                makeMockChamber('A', 'Domiciliaria', 10, undefined, 100),
                makeMockChamber('B', 'Domiciliaria', 15, undefined, 100),
                makeMockChamber('C', 'Pública', 0, undefined, 99),
                makeMockChamber('D', 'Pública', 0, undefined, 98)
            ];
            
            const pipes = [
                makeMockPipe('P1', 'A', 'C'),
                makeMockPipe('P2', 'B', 'C'),
                makeMockPipe('P3', 'C', 'D')
            ];
            
            const result = executeSourcePropagation(chambers, pipes);
            
            const p3 = result.edges.find(e => e.id === 'P3');
            const res3 = resolveNormativeState(p3 as any);
            
            expect(p3?.sources.length).toBe(2);
            expect(res3.role).toBe('LATERAL');
            expect(res3.regime).toBe('NCH1105');
        });
    });
    
    describe('Test 2: Un origen solo', () => {
        it('debe clasificar todos los tramos como NCh3371/DESCARGA_HORIZ (nuevo default)', () => {
            const chambers = [
                makeMockChamber('A', 'Domiciliaria', 10, undefined, 100),
                makeMockChamber('B', 'Domiciliaria', 0, undefined, 99),
                makeMockChamber('C', 'Pública', 0, undefined, 98)
            ];
            
            const pipes = [
                makeMockPipe('P1', 'A', 'B'),
                makeMockPipe('P2', 'B', 'C')
            ];
            
            const result = executeSourcePropagation(chambers, pipes);
            
            const p1 = result.edges.find(e => e.id === 'P1');
            const res1 = resolveNormativeState(p1 as any);
            
            expect(res1.regime).toBe('NCH3371');
            expect(res1.role).toBe('DESCARGA_HORIZ');
        });
    });
    
    describe('Override persistence in mixed segments', () => {
        it('removes effective and uses resolveNormativeState instead', () => {
            const chambers = [
                makeMockChamber('A', 'Domiciliaria', 10, undefined, 100),
                makeMockChamber('B', 'Pública', 0, undefined, 99)
            ];
 
            const pipes = [
                {
                    ...makeMockPipe('P1', 'A', 'B', 110, 2, 10),
                    override: {
                        enabled: true,
                        norma: 'NCH1105',
                        role1105: 'LATERAL'
                    }
                }
            ];
 
            const result = runTopologyAndApply(chambers as any, pipes as any);
            const updated = result.pipes.find(p => p.id === 'P1')!;
            const resolved = resolveNormativeState(updated);
 
            expect(updated.override?.enabled).toBe(true);
            expect(updated.effective).toBeUndefined(); // Should be undefined now
            expect(resolved.role).toBe('LATERAL');
            expect(resolved.regime).toBe('NCH1105');
        });
    });
});
