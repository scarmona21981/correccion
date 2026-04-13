import { Chamber, Pipe } from '../context/ProjectContext';
import { TopologyRole, TopologyRegime } from './topology/roleMapping';
import { PipeRole } from '../utils/pipeRole';
import { resolveNormativeState } from '../utils/resolveNormativeState';
import { classifyAllPipesWithNetworkResolver } from './topology/networkRoleResolver';

export interface SourceNode {
    id: string;
    type: 'CHAMBER' | 'PTAS' | 'FOSA' | 'OTHER';
    chamberClass: 'DOMICILIARIA' | 'PUBLICA' | 'NONE';
    uehLocal: number;
    installationGroupId?: string;
    sources: string[];
    isOrigin: boolean;
    nodeRole: 'INSTALACION' | 'CONFLUENCIA' | 'PASADA';
}

export interface PipeAutoClassification {
    sources: string[];
    pipeRole: PipeRole;
    topologyRegime: TopologyRegime;
    topologyRole: TopologyRole;
    Q_design_Lps_acc?: number;
    normativeRegime?: string;
    normativeRole?: string;
}

export interface PipeOverride {
    enabled: boolean;
    pipeRole?: PipeRole;
    reason?: string;
    changedAt?: string;
    normativeRegime?: string;
    normativeRole?: string;
    norma?: string;
    role1105?: string;
    role3371?: string;
}

export interface PipeEffective {
    pipeRole: PipeRole;
    topologyRegime: TopologyRegime;
    topologyRole: TopologyRole;
}

export type DesignMethod = 'NCH3371_A' | 'NCH3371_B';

export interface SourceEdge {
    id: string;
    from: string;
    to: string;
    dn_mm: number;
    slope_percent: number;
    length_m: number;
    sources: string[];
    topologyRole: TopologyRole;
    topologyRegime: TopologyRegime;
    pipeRole: PipeRole;
    UEH_upstream?: number;
    auto?: PipeAutoClassification;
    override?: PipeOverride;
    effective?: PipeEffective;
    gravityRole_manual?: 'NACIENTE' | 'LATERAL' | 'COLECTOR' | null;
    designMethod?: DesignMethod;
}

export interface SourcePropagationResult {
    nodes: SourceNode[];
    edges: SourceEdge[];
    errors: string[];
    warnings: string[];
}

function getSourceIdForNode(node: SourceNode): string {
    if (node.installationGroupId && node.installationGroupId.trim() !== '') {
        return node.installationGroupId;
    }
    return node.id;
}

export function detectOrigins(nodes: SourceNode[]): string[] {
    const origins: string[] = [];
    for (const node of nodes) {
        if (node.isOrigin) {
            origins.push(node.id);
        }
    }
    return origins;
}

function buildAdjacency(nodes: SourceNode[], edges: SourceEdge[]): {
    inEdges: Map<string, SourceEdge[]>;
    outEdges: Map<string, SourceEdge[]>;
} {
    const inEdges = new Map<string, SourceEdge[]>();
    const outEdges = new Map<string, SourceEdge[]>();

    for (const node of nodes) {
        inEdges.set(node.id, []);
        outEdges.set(node.id, []);
    }

    for (const e of edges) {
        const outList = outEdges.get(e.from) || [];
        outList.push(e);
        outEdges.set(e.from, outList);

        const inList = inEdges.get(e.to) || [];
        inList.push(e);
        inEdges.set(e.to, inList);
    }

    return { inEdges, outEdges };
}

export function propagateSourcesFixpoint(
    nodes: SourceNode[],
    edges: SourceEdge[]
): SourcePropagationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const nodeMap = new Map<string, SourceNode>();
    for (const node of nodes) {
        nodeMap.set(node.id, { ...node, sources: [...node.sources] });
    }

    const edgeMap = new Map<string, SourceEdge>();
    for (const edge of edges) {
        edgeMap.set(edge.id, { ...edge, sources: [...edge.sources] });
    }

    const { inEdges, outEdges } = buildAdjacency(
        Array.from(nodeMap.values()),
        Array.from(edgeMap.values())
    );

    for (const node of nodeMap.values()) {
        node.sources = [];
        if (node.isOrigin) {
            node.sources = [getSourceIdForNode(node)];
        }
    }

    let changed = true;
    let iter = 0;
    const maxIter = 1000;

    while (changed && iter < maxIter) {
        changed = false;
        iter += 1;

        for (const node of nodeMap.values()) {
            const newSources = new Set<string>(node.sources);
            const nodeInEdges = inEdges.get(node.id) || [];

            for (const e of nodeInEdges) {
                const upNode = nodeMap.get(e.from);
                if (upNode) {
                    for (const s of upNode.sources) {
                        newSources.add(s);
                    }
                }
            }

            const newSourcesArr = Array.from(newSources).sort();
            if (newSourcesArr.length !== node.sources.length ||
                !newSourcesArr.every((v, i) => v === node.sources[i])) {
                node.sources = newSourcesArr;
                changed = true;
            }
        }
    }

    if (iter === maxIter) {
        warnings.push('Propagación no convergió. Revisa ciclos o direcciones de flujo.');
    }

    for (const edge of edgeMap.values()) {
        const fromNode = nodeMap.get(edge.from);
        if (fromNode) {
            edge.sources = [...fromNode.sources];
        }
    }

    for (const node of nodeMap.values()) {
        const inCount = (inEdges.get(node.id) || []).length;
        const outCount = (outEdges.get(node.id) || []).length;
        
        if (node.isOrigin) {
            node.nodeRole = 'INSTALACION';
        } else if (node.sources.length >= 2) {
            node.nodeRole = 'CONFLUENCIA';
        } else if (inCount > 0 && outCount > 0) {
            node.nodeRole = 'PASADA';
        } else {
            node.nodeRole = 'INSTALACION';
        }
    }

    return {
        nodes: Array.from(nodeMap.values()),
        edges: Array.from(edgeMap.values()),
        errors,
        warnings
    };
}

function classifyPipe(
    edge: SourceEdge,
    fromNode: SourceNode | undefined,
    toNode: SourceNode | undefined,
    isTrunk: boolean = false
): void {
    const k = edge.sources.length;
    let autoPipeRole: PipeRole;
    let autoTopologyRegime: TopologyRegime;
    let autoTopologyRole: TopologyRole;

    if (isTrunk) {
        if (
            toNode?.chamberClass === 'PUBLICA' ||
            fromNode?.chamberClass === 'PUBLICA'
        ) {
            autoTopologyRegime = 'NCH1105';
            autoTopologyRole = 'COLECTOR';
            autoPipeRole = 'COLECTOR_EXTERIOR';
        } else if (k >= 2) {
            autoTopologyRegime = 'NCH1105';
            autoTopologyRole = 'LATERAL';
            autoPipeRole = 'COLECTOR_EXTERIOR';
        } else if (
            fromNode?.chamberClass === 'DOMICILIARIA' &&
            toNode?.chamberClass === 'DOMICILIARIA' &&
            edge.dn_mm < 100 &&
            k <= 1
        ) {
            autoTopologyRegime = 'NCH3371';
            autoTopologyRole = 'RAMAL_INTERIOR';
            autoPipeRole = 'INTERIOR_RAMAL';
        } else {
            autoTopologyRegime = 'NCH3371';
            autoTopologyRole = 'RAMAL_CONEXION';
            autoPipeRole = 'DESCARGA_HORIZ';
        }
    } else {
        if (k >= 2) {
            autoTopologyRegime = 'NCH1105';
            autoTopologyRole = 'LATERAL';
            autoPipeRole = 'COLECTOR_EXTERIOR';
        } else if (
            toNode?.chamberClass === 'PUBLICA' ||
            fromNode?.chamberClass === 'PUBLICA'
        ) {
            autoTopologyRegime = 'NCH1105';
            autoTopologyRole = 'LATERAL';
            autoPipeRole = 'COLECTOR_EXTERIOR';
        } else if (
            fromNode?.chamberClass === 'DOMICILIARIA' &&
            toNode?.chamberClass === 'DOMICILIARIA' &&
            edge.dn_mm < 100 &&
            k <= 1
        ) {
            autoTopologyRegime = 'NCH3371';
            autoTopologyRole = 'RAMAL_INTERIOR';
            autoPipeRole = 'INTERIOR_RAMAL';
        } else {
            autoTopologyRegime = 'NCH3371';
            autoTopologyRole = 'RAMAL_CONEXION';
            autoPipeRole = 'DESCARGA_HORIZ';
        }
    }

    edge.auto = {
        sources: [...edge.sources],
        pipeRole: autoPipeRole,
        topologyRegime: autoTopologyRegime,
        topologyRole: autoTopologyRole,
        normativeRegime: autoTopologyRegime as any,
        normativeRole: autoTopologyRole === 'RAMAL_INTERIOR' ? 'INTERIOR_RAMAL' : (autoTopologyRole === 'RAMAL_CONEXION' ? 'DESCARGA_HORIZ' : autoTopologyRole) as any
    } as any;

    if (!edge.override) {
        edge.override = { enabled: false };
    }

    // Explicitly un-set effective as source of truth
    if (edge.effective) {
        edge.effective = undefined;
    }
}

export function classifyAllPipes(
    nodes: SourceNode[],
    edges: SourceEdge[]
): SourceEdge[] {
    classifyAllPipesWithNetworkResolver(nodes, edges);
    return edges;
}

export function ensureDirectedGraph(
    chambers: Chamber[],
    pipes: Pipe[]
): SourceEdge[] {
    const chamberMap = new Map<string, Chamber>();
    for (const c of chambers) {
        chamberMap.set(c.id, c);
    }

    const edges: SourceEdge[] = pipes.map(p => {
        let from = p.startNodeId || '';
        let to = p.endNodeId || '';

        const startChamber = chamberMap.get(from);
        const endChamber = chamberMap.get(to);

        const startCT = Number(startChamber?.CT?.value ?? startChamber?.CT ?? 0);
        const endCT = Number(endChamber?.CT?.value ?? endChamber?.CT ?? 0);

        if (startCT > 0 && endCT > 0 && startCT < endCT) {
            [from, to] = [to, from];
        }

        return {
            id: p.id,
            from,
            to,
            dn_mm: Number(p.diameter?.value ?? p.diameter ?? 0),
            slope_percent: Number(p.slope?.value ?? p.slope ?? 0),
            length_m: Number(p.length?.value ?? p.length ?? 0),
            sources: [],
            topologyRole: (p.topologyRole ?? 'RAMAL_CONEXION') as TopologyRole,
            topologyRegime: (p.topologyRegime ?? 'NCH3371') as TopologyRegime,
            pipeRole: (p.pipeRole ?? 'DESCARGA_HORIZ') as PipeRole,
            auto: p.auto ? {
                ...p.auto,
                sources: [...(p.auto.sources ?? [])],
                pipeRole: (p.auto.pipeRole ?? p.pipeRole ?? 'DESCARGA_HORIZ') as PipeRole,
                topologyRegime: (p.auto.topologyRegime ?? p.topologyRegime ?? 'NCH3371') as TopologyRegime,
                topologyRole: (p.auto.topologyRole ?? p.topologyRole ?? 'RAMAL_CONEXION') as TopologyRole
            } : undefined,
            override: p.override ? { ...p.override } : { enabled: false },
            effective: undefined, // Removed usage of effective as source of truth
            gravityRole_manual: p.gravityRole_manual ?? null,
            // Pass down to help resolveNormativeState
            startChamberType: startChamber?.chamberType,
            endChamberType: endChamber?.chamberType,
            gravityRole_auto: p.gravityRole_auto
        } as any;
    });

    return edges;
}

export function convertToSourceNodes(chambers: Chamber[]): SourceNode[] {
    return chambers.map(c => {
        const uehLocal = Number(c.uehPropias?.value ?? 0);
        const isOrigin = uehLocal > 0;
        
        let chamberClass: 'DOMICILIARIA' | 'PUBLICA' | 'NONE' = 'NONE';
        if (c.chamberType === 'Domiciliaria') {
            chamberClass = 'DOMICILIARIA';
        } else if (c.chamberType === 'Pública') {
            chamberClass = 'PUBLICA';
        }

        return {
            id: c.id,
            type: 'CHAMBER' as const,
            chamberClass,
            uehLocal,
            installationGroupId: c.installationGroupId,
            sources: [],
            isOrigin,
            nodeRole: 'INSTALACION' as const
        };
    });
}

export function executeSourcePropagation(
    chambers: Chamber[],
    pipes: Pipe[]
): SourcePropagationResult {
    const sourceNodes = convertToSourceNodes(chambers);
    const directedEdges = ensureDirectedGraph(chambers, pipes);

    const result = propagateSourcesFixpoint(sourceNodes, directedEdges);

    classifyAllPipes(result.nodes, result.edges);

    return result;
}

export function getSourcesForPipe(
    pipeId: string,
    result: SourcePropagationResult
): string[] {
    const edge = result.edges.find(e => e.id === pipeId);
    return edge?.sources || [];
}

export function getRegimeForPipe(
    pipeId: string,
    result: SourcePropagationResult
): TopologyRegime | null {
    const edge = result.edges.find(e => e.id === pipeId);
    if (!edge) return null;
    return resolveNormativeState(edge).regime as TopologyRegime;
}

export function getRoleForPipe(
    pipeId: string,
    result: SourcePropagationResult
): TopologyRole | null {
    const edge = result.edges.find(e => e.id === pipeId);
    if (!edge) return null;
    const role = resolveNormativeState(edge).role;
    return role === 'INTERIOR_RAMAL' ? 'RAMAL_INTERIOR' : (role === 'DESCARGA_HORIZ' ? 'RAMAL_CONEXION' : role) as TopologyRole;
}

export function getPipeRoleForPipe(
    pipeId: string,
    result: SourcePropagationResult
): PipeRole | null {
    const edge = result.edges.find(e => e.id === pipeId);
    if (!edge) return null;
    const role = resolveNormativeState(edge).role;
    if (role === 'LATERAL' || role === 'COLECTOR') return 'COLECTOR_EXTERIOR';
    return role as PipeRole;
}

export function getNodeSources(
    nodeId: string,
    result: SourcePropagationResult
): string[] {
    const node = result.nodes.find(n => n.id === nodeId);
    return node?.sources || [];
}

export function getNodeRole(
    nodeId: string,
    result: SourcePropagationResult
): 'INSTALACION' | 'CONFLUENCIA' | 'PASADA' | null {
    const node = result.nodes.find(n => n.id === nodeId);
    return node?.nodeRole || null;
}

export interface UEHWeightedInfo {
    UEH_total: number;
    UEH_upstream: number;
    sourceIds: string[];
    missingUEH: string[];
}

export function getTotalUEHFromSources(sourceNodes: SourceNode[]): number {
    let totalUEH = 0;
    for (const node of sourceNodes) {
        if (node.isOrigin && node.uehLocal > 0) {
            totalUEH += node.uehLocal;
        }
    }
    return totalUEH;
}

export function getUEHUpstreamForEdge(
    edge: SourceEdge,
    sourceNodes: SourceNode[]
): UEHWeightedInfo {
    const missingUEH: string[] = [];
    const sourceIds = edge.sources || [];
    
    const sourceNodeMap = new Map<string, SourceNode>();
    for (const node of sourceNodes) {
        if (node.isOrigin) {
            const sourceId = getSourceIdForNode(node);
            sourceNodeMap.set(sourceId, node);
        }
    }
    
    let UEH_upstream = 0;
    for (const sourceId of sourceIds) {
        const node = sourceNodeMap.get(sourceId);
        if (node) {
            if (node.uehLocal > 0) {
                UEH_upstream += node.uehLocal;
            } else {
                missingUEH.push(sourceId);
            }
        } else {
            missingUEH.push(sourceId);
        }
    }
    
    const UEH_total = getTotalUEHFromSources(sourceNodes);
    
    return {
        UEH_total,
        UEH_upstream,
        sourceIds,
        missingUEH
    };
}
