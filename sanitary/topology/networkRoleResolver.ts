import { SourceNode, SourceEdge } from '../sourcePropagationEngine';
import { PipeRole } from '../../utils/pipeRole';
import { TopologyRegime, TopologyRole } from './roleMapping';
import { inferAutoNormative } from '../../utils/autoNormative';

const DEBUG = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';

interface GraphNode {
    id: string;
    chamberClass: 'DOMICILIARIA' | 'PUBLICA' | 'NONE';
    uehLocal: number;
    uehAccumulated: number;
    isOrigin: boolean;
    isSink: boolean;
    inDegree: number;
    outDegree: number;
}

interface GraphEdge {
    id: string;
    from: string;
    to: string;
    dn_mm: number;
    sources: string[];
    uehTransported: number;
    isTrunk: boolean;
    flowDirection: 'forward' | 'reverse' | 'undirected';
}

export interface NetworkRoleResult {
    pipeRole: PipeRole;
    topologyRegime: TopologyRegime;
    topologyRole: TopologyRole;
    isTrunk: boolean;
    reason: string;
    normativeRegime: string;
    normativeRole: string;
}

interface ResolvedNetwork {
    nodes: Map<string, GraphNode>;
    edges: Map<string, GraphEdge>;
    sinks: string[];
    trunkEdges: Set<string>;
}

function logDebug(...args: any[]): void {
    if (DEBUG) {
        console.log('[NetworkRoleResolver]', ...args);
    }
}

export function buildGraph(
    nodes: SourceNode[],
    edges: SourceEdge[],
    uehAccumulated?: Map<string, number>
): ResolvedNetwork {
    const graphNodes = new Map<string, GraphNode>();
    const graphEdges = new Map<string, GraphEdge>();

    for (const node of nodes) {
        graphNodes.set(node.id, {
            id: node.id,
            chamberClass: node.chamberClass,
            uehLocal: node.uehLocal,
            uehAccumulated: uehAccumulated?.get(node.id) ?? node.uehLocal,
            isOrigin: node.isOrigin,
            isSink: false,
            inDegree: 0,
            outDegree: 0
        });
    }

    for (const edge of edges) {
        const uehTransported = edge.sources.reduce((sum, src) => {
            const srcNode = nodes.find(n => n.id === src || n.installationGroupId === src);
            return sum + (srcNode?.uehLocal ?? 0);
        }, 0);

        const flowDirection = resolveFlowDirection(edge, graphNodes);

        graphEdges.set(edge.id, {
            id: edge.id,
            from: edge.from,
            to: edge.to,
            dn_mm: edge.dn_mm,
            sources: edge.sources,
            uehTransported,
            isTrunk: false,
            flowDirection
        });

        const fromNode = graphNodes.get(edge.from);
        const toNode = graphNodes.get(edge.to);
        if (fromNode) fromNode.outDegree++;
        if (toNode) toNode.inDegree++;
    }

    const sinks = findSinks(graphNodes, graphEdges);
    for (const sinkId of sinks) {
        const node = graphNodes.get(sinkId);
        if (node) node.isSink = true;
    }

    const trunkEdges = computeTrunkEdges(graphNodes, graphEdges, sinks);
    for (const edgeId of trunkEdges) {
        const edge = graphEdges.get(edgeId);
        if (edge) edge.isTrunk = true;
    }

    logDebug('Graph built:', {
        nodes: graphNodes.size,
        edges: graphEdges.size,
        sinks: sinks,
        trunkEdges: Array.from(trunkEdges)
    });

    return { nodes: graphNodes, edges: graphEdges, sinks, trunkEdges };
}

function resolveFlowDirection(
    edge: SourceEdge,
    nodes: Map<string, GraphNode>
): 'forward' | 'reverse' | 'undirected' {
    const fromNode = nodes.get(edge.from);
    const toNode = nodes.get(edge.to);

    if (!fromNode || !toNode) return 'forward';

    if (toNode.chamberClass === 'PUBLICA' && fromNode.chamberClass !== 'PUBLICA') {
        return 'forward';
    }
    if (fromNode.chamberClass === 'PUBLICA' && toNode.chamberClass !== 'PUBLICA') {
        return 'reverse';
    }

    if (toNode.uehAccumulated > fromNode.uehAccumulated && toNode.uehAccumulated > 0) {
        return 'forward';
    }
    if (fromNode.uehAccumulated > toNode.uehAccumulated && fromNode.uehAccumulated > 0) {
        return 'reverse';
    }

    if (toNode.outDegree === 0 && fromNode.outDegree > 0) {
        return 'forward';
    }
    if (fromNode.outDegree === 0 && toNode.outDegree > 0) {
        return 'reverse';
    }

    return 'forward';
}

function findSinks(
    nodes: Map<string, GraphNode>,
    edges: Map<string, GraphEdge>
): string[] {
    const sinks: string[] = [];

    for (const [id, node] of nodes) {
        if (node.chamberClass === 'PUBLICA') {
            sinks.push(id);
            logDebug(`Found sink (PUBLICA): ${id}`);
        }
    }

    if (sinks.length === 0) {
        for (const [id, node] of nodes) {
            if (node.outDegree === 0 && node.inDegree > 0) {
                sinks.push(id);
                logDebug(`Found sink (no out edges): ${id}`);
            }
        }
    }

    if (sinks.length === 0) {
        let maxUeh = 0;
        let maxUehNode = '';
        for (const [id, node] of nodes) {
            if (node.uehAccumulated > maxUeh) {
                maxUeh = node.uehAccumulated;
                maxUehNode = id;
            }
        }
        if (maxUehNode) {
            sinks.push(maxUehNode);
            logDebug(`Found sink (max UEH): ${maxUehNode} with ${maxUeh} UEH`);
        }
    }

    return sinks;
}

function computeTrunkEdges(
    nodes: Map<string, GraphNode>,
    edges: Map<string, GraphEdge>,
    sinks: string[]
): Set<string> {
    const trunkEdges = new Set<string>();
    const adjacencyReverse = new Map<string, string[]>();

    for (const [id, node] of nodes) {
        adjacencyReverse.set(id, []);
    }
    for (const [, edge] of edges) {
        const downstream = edge.to;
        const upstream = edge.from;
        const list = adjacencyReverse.get(downstream) || [];
        list.push(upstream);
        adjacencyReverse.set(downstream, list);
    }

    const sinkSet = new Set(sinks);

    for (const [edgeId, edge] of edges) {
        if (sinkSet.has(edge.to)) {
            trunkEdges.add(edgeId);
        }
    }

    let changed = true;
    const maxIter = edges.size + 10;
    let iter = 0;

    while (changed && iter < maxIter) {
        changed = false;
        iter++;

        for (const [edgeId, edge] of edges) {
            if (trunkEdges.has(edgeId)) continue;

            if (sinkSet.has(edge.to) || trunkEdges.has(edge.to + '_virtual')) {
                trunkEdges.add(edgeId);
                changed = true;
            }
        }

        const nodeTrunkOut = new Map<string, string>();
        for (const [edgeId, edge] of edges) {
            if (!trunkEdges.has(edgeId)) continue;
            const existing = nodeTrunkOut.get(edge.from);
            const existingEdge = existing ? edges.get(existing) : null;
            if (!existingEdge || edge.uehTransported > existingEdge.uehTransported) {
                nodeTrunkOut.set(edge.from, edgeId);
            }
        }

        for (const [nodeId, trunkOutEdgeId] of nodeTrunkOut) {
            const node = nodes.get(nodeId);
            if (!node) continue;

            const incomingEdges = Array.from(edges.values())
                .filter(e => e.to === nodeId);

            for (const inEdge of incomingEdges) {
                if (!trunkEdges.has(inEdge.id)) {
                    trunkEdges.add(inEdge.id);
                    changed = true;
                }
            }
        }
    }

    for (const sinkId of sinks) {
        const incomingToSink = Array.from(edges.values())
            .filter(e => e.to === sinkId);

        incomingToSink.sort((a, b) => b.uehTransported - a.uehTransported);

        if (incomingToSink.length > 0) {
            trunkEdges.add(incomingToSink[0].id);
        }
    }

    for (const [edgeId, edge] of edges) {
        const fromNode = nodes.get(edge.from);
        const toNode = nodes.get(edge.to);

        if (toNode?.isSink && edge.uehTransported > 0) {
            const incomingToSink = Array.from(edges.values())
                .filter(e => e.to === edge.to)
                .sort((a, b) => b.uehTransported - a.uehTransported);

            if (incomingToSink.length === 1 || incomingToSink[0]?.id === edgeId) {
                trunkEdges.add(edgeId);
            }
        }
    }

    const origins = Array.from(nodes.values()).filter(n => n.isOrigin);
    for (const origin of origins) {
        let currentId = origin.id;
        const visited = new Set<string>();
        let bestPath: string[] = [];

        const pathToSink = findPathToSink(currentId, nodes, edges, sinkSet, visited);
        if (pathToSink.length > 0) {
            for (const edgeId of pathToSink) {
                trunkEdges.add(edgeId);
            }
        }
    }

    logDebug('Trunk edges computed:', Array.from(trunkEdges));
    return trunkEdges;
}

function findPathToSink(
    nodeId: string,
    nodes: Map<string, GraphNode>,
    edges: Map<string, GraphEdge>,
    sinkSet: Set<string>,
    visited: Set<string>
): string[] {
    if (visited.has(nodeId)) return [];
    visited.add(nodeId);

    const node = nodes.get(nodeId);
    if (!node) return [];

    if (sinkSet.has(nodeId)) return [];

    const outgoingEdges = Array.from(edges.values())
        .filter(e => e.from === nodeId);

    if (outgoingEdges.length === 0) return [];

    outgoingEdges.sort((a, b) => b.uehTransported - a.uehTransported);

    for (const edge of outgoingEdges) {
        if (sinkSet.has(edge.to)) {
            return [edge.id];
        }

        const restOfPath = findPathToSink(edge.to, nodes, edges, sinkSet, visited);
        if (restOfPath.length > 0 || sinkSet.has(edge.to)) {
            return [edge.id, ...restOfPath];
        }
    }

    return [];
}

export function inferEdgeRole(
    edge: SourceEdge,
    graphNodeFrom: GraphNode | undefined,
    graphNodeTo: GraphNode | undefined,
    isTrunk: boolean
): NetworkRoleResult {
    const autoNormative = inferAutoNormative(
        { chamberClass: graphNodeFrom?.chamberClass },
        { chamberClass: graphNodeTo?.chamberClass }
    );
    const trunkSuffix = isTrunk ? ' + TRUNK' : '';

    if (autoNormative.regime === 'NCH1105') {
        const role = autoNormative.role as TopologyRole; // LATERAL
        return {
            pipeRole: 'COLECTOR_EXTERIOR',
            topologyRegime: 'NCH1105',
            topologyRole: role, 
            isTrunk,
            reason: `PUBLICA-PUBLICA${trunkSuffix} => NCH1105/${role} (auto)`,
            normativeRegime: 'NCH1105',
            normativeRole: role
        };
    }

    if (autoNormative.role === 'INTERIOR_RAMAL') {
        return {
            pipeRole: 'INTERIOR_RAMAL',
            topologyRegime: 'NCH3371',
            topologyRole: 'RAMAL_INTERIOR',
            isTrunk,
            reason: `DOMICILIARIA-DOMICILIARIA${trunkSuffix} => NCH3371/RAMAL_INTERIOR (auto)`,
            normativeRegime: 'NCH3371',
            normativeRole: 'INTERIOR_RAMAL'
        };
    }

    return {
        pipeRole: 'DESCARGA_HORIZ',
        topologyRegime: 'NCH3371',
        topologyRole: 'RAMAL_CONEXION',
        isTrunk,
        reason: `MIXTO${trunkSuffix} => NCH3371/RAMAL_CONEXION (auto)`,
        normativeRegime: 'NCH3371',
        normativeRole: 'DESCARGA_HORIZ'
    };
}

export function resolveAllEdgeRoles(
    nodes: SourceNode[],
    edges: SourceEdge[],
    uehAccumulated?: Map<string, number>
): Map<string, NetworkRoleResult> {
    const network = buildGraph(nodes, edges, uehAccumulated);
    const results = new Map<string, NetworkRoleResult>();

    for (const edge of edges) {
        const graphEdge = network.edges.get(edge.id);
        const isTrunk = graphEdge?.isTrunk ?? false;
        const fromNode = network.nodes.get(edge.from);
        const toNode = network.nodes.get(edge.to);

        const roleResult = inferEdgeRole(edge, fromNode, toNode, isTrunk);
        results.set(edge.id, roleResult);

        logDebug(`Edge ${edge.id}: ${roleResult.reason}`);
    }

    return results;
}

export function classifyPipeWithNetworkResolver(
    edge: SourceEdge,
    nodes: SourceNode[],
    network: ResolvedNetwork
): void {
    const graphEdge = network.edges.get(edge.id);
    const isTrunk = graphEdge?.isTrunk ?? false;
    const fromNode = network.nodes.get(edge.from);
    const toNode = network.nodes.get(edge.to);

    const roleResult = inferEdgeRole(edge, fromNode, toNode, isTrunk);

    edge.auto = {
        sources: [...edge.sources],
        pipeRole: roleResult.pipeRole,
        topologyRegime: roleResult.topologyRegime,
        topologyRole: roleResult.topologyRole,
        normativeRegime: roleResult.normativeRegime,
        normativeRole: roleResult.normativeRole
    };

    if (!edge.override) {
        edge.override = { enabled: false };
    }

    // [NUEVO] Eliminada la persistencia de effective. Toda la app leerá de resolveNormativeState(pipe).
    edge.effective = undefined;
    
    // Fallback sync para componentes que aun lean properties directas (opcional)
    edge.topologyRegime = roleResult.topologyRegime;
    edge.topologyRole = roleResult.topologyRole;
    edge.pipeRole = roleResult.pipeRole;
}

export function classifyAllPipesWithNetworkResolver(
    nodes: SourceNode[],
    edges: SourceEdge[],
    uehAccumulated?: Map<string, number>
): void {
    const network = buildGraph(nodes, edges, uehAccumulated);

    for (const edge of edges) {
        classifyPipeWithNetworkResolver(edge, nodes, network);
    }
}
