import { Chamber, Pipe, PipeAutoClassification, PipeOverride, PipeEffective } from '../../context/ProjectContext';
import { resolveNormativeState } from '../../utils/resolveNormativeState';
import { executeSourcePropagation, SourcePropagationResult, SourceNode, SourceEdge } from '../sourcePropagationEngine';
import { applyAllPipeOverrides, migrateLegacyEdge } from './pipeOverrideEngine';
import { PipeRole, resolveEffectivePipeRole } from '../../utils/pipeRole';

export interface TopologyPipelineConfig {
    hasPopulation?: boolean;
    populationTotal?: number;
    D_L_per_hab_day?: number;
    R_recovery?: number;
    C_capacity?: number;
    flowDesignMode?: 'POPULATION_NCH1105' | 'DIRECT_Q';
}

export interface TopologyPipelineResult {
    propagationResult: SourcePropagationResult;
    summary: {
        totalPipes: number;
        totalNodes: number;
        originsCount: number;
        ramalInteriorCount: number;
        ramalConexionCount: number;
        lateralCount: number;
        colectorCount: number;
        nch3371Count: number;
        nch1105Count: number;
    };
}

export interface UpdatedProjectElements {
    chambers: Chamber[];
    pipes: Pipe[];
}

function getSourceIdForNode(node: SourceNode): string {
    if (node.installationGroupId && node.installationGroupId.trim() !== '') {
        return node.installationGroupId;
    }
    return node.id;
}

export function runTopologyPipeline(
    chambers: Chamber[],
    pipes: Pipe[],
    _config: TopologyPipelineConfig = {}
): TopologyPipelineResult {
    const propagationResult = executeSourcePropagation(chambers, pipes);
    
    for (let i = 0; i < propagationResult.edges.length; i++) {
        propagationResult.edges[i] = migrateLegacyEdge(propagationResult.edges[i]);
    }

    applyAllPipeOverrides(propagationResult.edges);

    const sourceUEH = new Map<string, number>();
    for (const node of propagationResult.nodes) {
        if (!node.isOrigin || node.uehLocal <= 0) continue;
        const sourceId = getSourceIdForNode(node);
        sourceUEH.set(sourceId, (sourceUEH.get(sourceId) || 0) + node.uehLocal);
    }

    for (const edge of propagationResult.edges) {
        edge.UEH_upstream = (edge.sources || []).reduce((sum, sourceId) => {
            return sum + (sourceUEH.get(sourceId) || 0);
        }, 0);
    }
    
    const originsCount = propagationResult.nodes.filter(n => n.isOrigin).length;
    const ramalInteriorCount = propagationResult.edges.filter(e => e.topologyRole === 'RAMAL_INTERIOR').length;
    const ramalConexionCount = propagationResult.edges.filter(e => e.topologyRole === 'RAMAL_CONEXION').length;
    const lateralCount = propagationResult.edges.filter(e => e.topologyRole === 'LATERAL').length;
    const colectorCount = propagationResult.edges.filter(e => e.topologyRole === 'COLECTOR').length;
    const nch3371Count = propagationResult.edges.filter(e => e.topologyRegime === 'NCH3371').length;
    const nch1105Count = propagationResult.edges.filter(e => e.topologyRegime === 'NCH1105').length;
    
    return {
        propagationResult,
        summary: {
            totalPipes: propagationResult.edges.length,
            totalNodes: propagationResult.nodes.length,
            originsCount,
            ramalInteriorCount,
            ramalConexionCount,
            lateralCount,
            colectorCount,
            nch3371Count,
            nch1105Count
        }
    };
}

export function applyTopologyToProject(
    chambers: Chamber[],
    pipes: Pipe[],
    topologyResult: TopologyPipelineResult,
    _config?: TopologyPipelineConfig
): UpdatedProjectElements {
    const edgeMap = new Map<string, SourceEdge>();
    for (const edge of topologyResult.propagationResult.edges) {
        edgeMap.set(edge.id, edge);
    }
    
    const nodeMap = new Map<string, SourceNode>();
    for (const node of topologyResult.propagationResult.nodes) {
        nodeMap.set(node.id, node);
    }
    
    const updatedPipes = pipes.map(pipe => {
        const topologyEdge = edgeMap.get(pipe.id);
        if (!topologyEdge) return pipe;
        
        // Use the common utility to determine state
        const normativeState = resolveNormativeState(topologyEdge);

        const auto: PipeAutoClassification | undefined = topologyEdge.auto ? {
            ...topologyEdge.auto,
            sources: topologyEdge.auto.sources,
            pipeRole: topologyEdge.auto.pipeRole,
            topologyRegime: topologyEdge.auto.topologyRegime,
            topologyRole: topologyEdge.auto.topologyRole,
            Q_design_Lps_acc: topologyEdge.auto.Q_design_Lps_acc,
            normativeRegime: topologyEdge.auto.normativeRegime,
            normativeRole: topologyEdge.auto.normativeRole
        } : undefined;

        const override: PipeOverride | undefined = topologyEdge.override;

        // Sync legacy properties for components that still read them direct from Pipe
        // mapping back from normativeState.role
        const legacyRole = (normativeState.role === 'LATERAL' || normativeState.role === 'COLECTOR') 
            ? 'COLECTOR_EXTERIOR' 
            : normativeState.role as PipeRole;
        
        const pipeWithFlow: any = {
            ...pipe,
            pipeRole: legacyRole,
            hasUpstreamInput: (topologyEdge.sources || []).length > 0,
            sources: topologyEdge.sources,
            UEH_upstream: topologyEdge.UEH_upstream,
            topologyRole: normativeState.role === 'INTERIOR_RAMAL' ? 'RAMAL_INTERIOR' : normativeState.role,
            topologyRegime: normativeState.regime,
            auto,
            override,
            effective: undefined // Explicitly un-set to avoid using it as source of truth
        };
        
        return pipeWithFlow;
    });
    
    const updatedChambers = chambers.map(chamber => {
        const topologyNode = nodeMap.get(chamber.id);
        if (!topologyNode) return chamber;
        
        return {
            ...chamber,
            sources: topologyNode.sources,
            topologyRole: topologyNode.nodeRole
        };
    });
    
    return {
        chambers: updatedChambers,
        pipes: updatedPipes
    };
}

export function runTopologyAndApply(
    chambers: Chamber[],
    pipes: Pipe[],
    config: TopologyPipelineConfig = {}
): UpdatedProjectElements & { topologyResult: TopologyPipelineResult } {
    const topologyResult = runTopologyPipeline(chambers, pipes, config);
    const updated = applyTopologyToProject(chambers, pipes, topologyResult, config);
    
    return {
        ...updated,
        topologyResult
    };
}

export function getTopologyInfoForPipe(
    pipeId: string,
    result: TopologyPipelineResult
): {
    sources: string[];
    topologyRole: string;
    topologyRegime: string;
    pipeRole: PipeRole;
    UEH_upstream?: number;
} | null {
    const edge = result.propagationResult.edges.find(e => e.id === pipeId);
    if (!edge) return null;
    
    const normativeState = resolveNormativeState(edge);
    
    return {
        sources: edge.sources,
        topologyRole: normativeState.role === 'INTERIOR_RAMAL' ? 'RAMAL_INTERIOR' : (normativeState.role === 'DESCARGA_HORIZ' ? 'RAMAL_CONEXION' : normativeState.role),
        topologyRegime: normativeState.regime,
        pipeRole: (normativeState.role === 'LATERAL' || normativeState.role === 'COLECTOR') ? 'COLECTOR_EXTERIOR' : normativeState.role as PipeRole,
        UEH_upstream: edge.UEH_upstream
    };
}

export function getTopologyInfoForChamber(
    chamberId: string,
    result: TopologyPipelineResult
): {
    sources: string[];
    isOrigin: boolean;
    nodeRole: string;
    uehLocal: number;
} | null {
    const node = result.propagationResult.nodes.find(n => n.id === chamberId);
    if (!node) return null;
    
    return {
        sources: node.sources,
        isOrigin: node.isOrigin,
        nodeRole: node.nodeRole,
        uehLocal: node.uehLocal
    };
}

export function shouldReclassifyPipe(
    pipe: Pipe,
    newSourcesCount: number,
    fromChamberClass?: 'DOMICILIARIA' | 'PUBLICA' | 'NONE',
    toChamberClass?: 'DOMICILIARIA' | 'PUBLICA' | 'NONE'
): boolean {
    const currentRole = resolveEffectivePipeRole(pipe);
    
    if (newSourcesCount >= 2 && currentRole !== 'COLECTOR_EXTERIOR') {
        return true;
    }
    
    if (newSourcesCount === 1 && currentRole === 'COLECTOR_EXTERIOR') {
        return true;
    }
    
    return false;
}
