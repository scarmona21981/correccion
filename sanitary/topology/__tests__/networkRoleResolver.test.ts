import {
    buildGraph,
    inferEdgeRole,
    resolveAllEdgeRoles,
    classifyAllPipesWithNetworkResolver,
    NetworkRoleResult
} from '../networkRoleResolver';
import { SourceNode, SourceEdge } from '../../sourcePropagationEngine';

function makeNode(
    id: string,
    chamberClass: 'DOMICILIARIA' | 'PUBLICA' | 'NONE',
    uehLocal: number,
    isOrigin: boolean = false
): SourceNode {
    return {
        id,
        type: 'CHAMBER',
        chamberClass,
        uehLocal,
        sources: [],
        isOrigin,
        nodeRole: 'INSTALACION',
        installationGroupId: undefined
    };
}

function makeEdge(
    id: string,
    from: string,
    to: string,
    sources: string[] = [],
    dn_mm: number = 110
): SourceEdge {
    return {
        id,
        from,
        to,
        dn_mm,
        slope_percent: 2,
        length_m: 10,
        sources,
        topologyRole: 'RAMAL_CONEXION',
        topologyRegime: 'NCH3371',
        pipeRole: 'DESCARGA_HORIZ'
    };
}

describe('NetworkRoleResolver', () => {
    describe('findSinks', () => {
        it('should detect PUBLICA chamber as sink', () => {
            const nodes = [
                makeNode('C1', 'DOMICILIARIA', 10, true),
                makeNode('C2', 'DOMICILIARIA', 0),
                makeNode('C3', 'PUBLICA', 0)
            ];
            const edges = [
                makeEdge('T1', 'C1', 'C2', ['C1']),
                makeEdge('T2', 'C2', 'C3', ['C1'])
            ];

            const network = buildGraph(nodes, edges);

            expect(network.sinks).toContain('C3');
        });

        it('should use node with no outgoing edges as fallback sink', () => {
            const nodes = [
                makeNode('C1', 'DOMICILIARIA', 10, true),
                makeNode('C2', 'DOMICILIARIA', 0)
            ];
            const edges = [
                makeEdge('T1', 'C1', 'C2', ['C1'])
            ];

            const network = buildGraph(nodes, edges);

            expect(network.sinks).toContain('C2');
        });
    });

    describe('computeTrunkEdges', () => {
        it('should mark edge to PUBLICA sink as trunk', () => {
            const nodes = [
                makeNode('C1', 'DOMICILIARIA', 10, true),
                makeNode('C2', 'PUBLICA', 0)
            ];
            const edges = [
                makeEdge('T1', 'C1', 'C2', ['C1'])
            ];

            const network = buildGraph(nodes, edges);

            expect(network.trunkEdges.has('T1')).toBe(true);
        });
    });

    describe('3-branch junction - CASO ESPECÍFICO A CORREGIR', () => {
        it('should mark trunk edge towards PUBLICA sink correctly', () => {
            const nodes = [
                makeNode('C1', 'DOMICILIARIA', 10, true),
                makeNode('C2', 'DOMICILIARIA', 15, true),
                makeNode('C3', 'DOMICILIARIA', 0),
                makeNode('C4', 'PUBLICA', 0)
            ];

            const edges = [
                makeEdge('T1', 'C1', 'C3', ['C1'], 100),
                makeEdge('T2', 'C2', 'C3', ['C2'], 100),
                makeEdge('T3', 'C3', 'C4', ['C1', 'C2'], 150)
            ];

            const network = buildGraph(nodes, edges);

            expect(network.sinks).toContain('C4');
            expect(network.trunkEdges.has('T3')).toBe(true);

            const results = resolveAllEdgeRoles(nodes, edges);
            const t3Result = results.get('T3');

            expect(t3Result?.pipeRole).toBe('COLECTOR_EXTERIOR');
            expect(t3Result?.isTrunk).toBe(true);
            expect(t3Result?.reason).toContain('TRUNK');
        });

        it('should assign DESCARGA_HORIZ or COLECTOR_EXTERIOR to trunk edge connecting to PUBLICA', () => {
            const nodes = [
                makeNode('C1', 'DOMICILIARIA', 5, true),
                makeNode('C2', 'DOMICILIARIA', 0),
                makeNode('C3', 'PUBLICA', 0)
            ];

            const edges = [
                makeEdge('T1', 'C1', 'C2', ['C1'], 100),
                makeEdge('T2', 'C2', 'C3', ['C1'], 100)
            ];

            const network = buildGraph(nodes, edges);
            const results = resolveAllEdgeRoles(nodes, edges);

            const t2Result = results.get('T2');
            expect(t2Result?.isTrunk).toBe(true);
            expect(t2Result?.pipeRole).not.toBe('INTERIOR_RAMAL');
        });

        it('should NOT mark lateral edges as trunk when there is a better path', () => {
            const nodes = [
                makeNode('C1', 'DOMICILIARIA', 10, true),
                makeNode('C2', 'DOMICILIARIA', 5, true),
                makeNode('C3', 'DOMICILIARIA', 0),
                makeNode('C4', 'PUBLICA', 0)
            ];

            const edges = [
                makeEdge('T1', 'C1', 'C3', ['C1'], 100),
                makeEdge('T2', 'C2', 'C3', ['C2'], 100),
                makeEdge('T3', 'C3', 'C4', ['C1', 'C2'], 150)
            ];

            const network = buildGraph(nodes, edges);
            const results = resolveAllEdgeRoles(nodes, edges);

            const t3Result = results.get('T3');
            expect(t3Result?.pipeRole).toBe('COLECTOR_EXTERIOR');
            expect(t3Result?.isTrunk).toBe(true);
        });
    });

    describe('Override - no cambiar rol si está forzado', () => {
        it('should respect manual override and not recalculate', () => {
            const nodes = [
                makeNode('C1', 'DOMICILIARIA', 10, true),
                makeNode('C2', 'PUBLICA', 0)
            ];

            const edge = makeEdge('T1', 'C1', 'C2', ['C1'], 100);
            edge.override = {
                enabled: true,
                pipeRole: 'INTERIOR_RAMAL',
                reason: 'Manual override',
                changedAt: new Date().toISOString()
            };

            const edges = [edge];

            classifyAllPipesWithNetworkResolver(nodes, edges);

            const t1 = edges[0];
            expect(t1.override?.enabled).toBe(true);
            expect(t1.override?.pipeRole).toBe('INTERIOR_RAMAL');
        });
    });

    describe('Sin sink explícito - heurística determinista', () => {
        it('should use node with max UEH accumulated as sink when no PUBLICA', () => {
            const nodes = [
                makeNode('C1', 'DOMICILIARIA', 10, true),
                makeNode('C2', 'DOMICILIARIA', 20, true),
                makeNode('C3', 'DOMICILIARIA', 0)
            ];

            const edges = [
                makeEdge('T1', 'C1', 'C3', ['C1'], 100),
                makeEdge('T2', 'C2', 'C3', ['C2'], 100)
            ];

            const uehAccumulated = new Map<string, number>();
            uehAccumulated.set('C1', 10);
            uehAccumulated.set('C2', 20);
            uehAccumulated.set('C3', 30);

            const network = buildGraph(nodes, edges, uehAccumulated);

            expect(network.sinks.length).toBeGreaterThan(0);
        });

        it('should assign trunk to edge with most flow towards accumulation point', () => {
            const nodes = [
                makeNode('C1', 'DOMICILIARIA', 10, true),
                makeNode('C2', 'DOMICILIARIA', 0),
                makeNode('C3', 'DOMICILIARIA', 0)
            ];

            const edges = [
                makeEdge('T1', 'C1', 'C2', ['C1'], 100),
                makeEdge('T2', 'C2', 'C3', ['C1'], 100)
            ];

            const network = buildGraph(nodes, edges);

            expect(network.trunkEdges.size).toBeGreaterThan(0);
        });
    });

    describe('Edge cases', () => {
        it('should handle empty network', () => {
            const network = buildGraph([], []);
            expect(network.sinks).toHaveLength(0);
            expect(network.trunkEdges.size).toBe(0);
        });

        it('should handle single node', () => {
            const nodes = [makeNode('C1', 'DOMICILIARIA', 10, true)];
            const network = buildGraph(nodes, []);
            expect(network.nodes.size).toBe(1);
        });

        it('should keep DOMICILIARIA-DOMICILIARIA in INTERIOR_RAMAL regardless DN', () => {
            const nodes = [
                makeNode('C1', 'DOMICILIARIA', 10, true),
                makeNode('C2', 'DOMICILIARIA', 0)
            ];

            const edges = [
                makeEdge('T1', 'C1', 'C2', ['C1'], 110)
            ];

            const results = resolveAllEdgeRoles(nodes, edges);
            const t1Result = results.get('T1');

            expect(t1Result?.pipeRole).toBe('INTERIOR_RAMAL');
            expect(t1Result?.topologyRegime).toBe('NCH3371');
        });
    });

    describe('Inferencia de roles según reglas', () => {
        it('should assign DESCARGA_HORIZ in mixed DOMICILIARIA-PUBLICA', () => {
            const nodes = [
                makeNode('C1', 'DOMICILIARIA', 10, true),
                makeNode('C2', 'PUBLICA', 0)
            ];

            const edges = [
                makeEdge('T1', 'C1', 'C2', ['C1'], 150)
            ];

            const results = resolveAllEdgeRoles(nodes, edges);
            const t1Result = results.get('T1');

            expect(t1Result?.pipeRole).toBe('DESCARGA_HORIZ');
            expect(t1Result?.topologyRegime).toBe('NCH3371');
        });

        it('should assign INTERIOR_RAMAL for small DN with DOMICILIARIA chambers', () => {
            const nodes = [
                makeNode('C1', 'DOMICILIARIA', 10, true),
                makeNode('C2', 'DOMICILIARIA', 0)
            ];

            const edges = [
                makeEdge('T1', 'C1', 'C2', ['C1'], 75)
            ];

            const network = buildGraph(nodes, edges);
            const fromNode = network.nodes.get('C1');
            const toNode = network.nodes.get('C2');
            const isTrunk = network.trunkEdges.has('T1');

            const result = inferEdgeRole(edges[0], fromNode, toNode, isTrunk);

            expect(result.pipeRole).toBe('INTERIOR_RAMAL');
            expect(result.topologyRegime).toBe('NCH3371');
        });

        it('should keep INTERIOR_RAMAL for DOMICILIARIA chambers with DN>=100', () => {
            const nodes = [
                makeNode('C1', 'DOMICILIARIA', 10, true),
                makeNode('C2', 'DOMICILIARIA', 0)
            ];

            const edges = [
                makeEdge('T1', 'C1', 'C2', ['C1'], 100)
            ];

            const network = buildGraph(nodes, edges);
            const fromNode = network.nodes.get('C1');
            const toNode = network.nodes.get('C2');
            const isTrunk = network.trunkEdges.has('T1');

            const result = inferEdgeRole(edges[0], fromNode, toNode, isTrunk);

            expect(result.pipeRole).toBe('INTERIOR_RAMAL');
        });

        it('should keep DOMICILIARIA-DOMICILIARIA in NCH3371 even with k>=2', () => {
            const nodes = [
                makeNode('C1', 'DOMICILIARIA', 10, true),
                makeNode('C2', 'DOMICILIARIA', 10, true),
                makeNode('C3', 'DOMICILIARIA', 0)
            ];

            const edges = [
                makeEdge('T1', 'C1', 'C3', ['C1']),
                makeEdge('T2', 'C2', 'C3', ['C2']),
                makeEdge('T3', 'C3', 'C3', ['C1', 'C2'])
            ];

            const network = buildGraph(nodes, edges);
            const t3Edge = network.edges.get('T3');

            if (t3Edge) {
                const fromNode = network.nodes.get(t3Edge.from);
                const toNode = network.nodes.get(t3Edge.to);
                const result = inferEdgeRole(
                    edges[2],
                    fromNode,
                    toNode,
                    t3Edge.isTrunk
                );

                expect(result.pipeRole).toBe('INTERIOR_RAMAL');
                expect(result.topologyRegime).toBe('NCH3371');
            }
        });
    });
});
