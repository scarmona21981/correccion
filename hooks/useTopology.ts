import { useMemo } from 'react';
import { Chamber, Pipe } from '../context/ProjectContext';
import { runTopologyPipeline, TopologyPipelineResult, TopologyPipelineConfig } from '../sanitary/topology/runTopologyPipeline';
import { executeSourcePropagation, SourcePropagationResult } from '../sanitary/sourcePropagationEngine';

export interface UseTopologyResult {
    result: TopologyPipelineResult | null;
    propagation: SourcePropagationResult | null;
    getSourcesForPipe: (pipeId: string) => string[];
    getSourcesForChamber: (chamberId: string) => string[];
    getRoleForPipe: (pipeId: string) => string | null;
    getRegimeForPipe: (pipeId: string) => string | null;
    getNodeRoleForChamber: (chamberId: string) => string | null;
    isOriginChamber: (chamberId: string) => boolean;
    isConfluenceChamber: (chamberId: string) => boolean;
}

export function useTopology(
    chambers: Chamber[],
    pipes: Pipe[],
    config?: TopologyPipelineConfig
): UseTopologyResult {
    const result = useMemo(() => {
        if (!chambers.length || !pipes.length) return null;
        return runTopologyPipeline(chambers, pipes, config);
    }, [chambers, pipes, config]);

    const propagation = useMemo(() => {
        if (!chambers.length) return null;
        return executeSourcePropagation(chambers, pipes);
    }, [chambers, pipes]);

    const getSourcesForPipe = (pipeId: string): string[] => {
        if (!propagation) return [];
        const edge = propagation.edges.find(e => e.id === pipeId);
        return edge?.sources || [];
    };

    const getSourcesForChamber = (chamberId: string): string[] => {
        if (!propagation) return [];
        const node = propagation.nodes.find(n => n.id === chamberId);
        return node?.sources || [];
    };

    const getRoleForPipe = (pipeId: string): string | null => {
        if (!propagation) return null;
        const edge = propagation.edges.find(e => e.id === pipeId);
        return edge?.topologyRole || null;
    };

    const getRegimeForPipe = (pipeId: string): string | null => {
        if (!propagation) return null;
        const edge = propagation.edges.find(e => e.id === pipeId);
        return edge?.topologyRegime || null;
    };

    const getNodeRoleForChamber = (chamberId: string): string | null => {
        if (!propagation) return null;
        const node = propagation.nodes.find(n => n.id === chamberId);
        return node?.nodeRole || null;
    };

    const isOriginChamber = (chamberId: string): boolean => {
        if (!propagation) return false;
        const node = propagation.nodes.find(n => n.id === chamberId);
        return node?.isOrigin || false;
    };

    const isConfluenceChamber = (chamberId: string): boolean => {
        if (!propagation) return false;
        const node = propagation.nodes.find(n => n.id === chamberId);
        return node?.nodeRole === 'CONFLUENCIA';
    };

    return {
        result,
        propagation,
        getSourcesForPipe,
        getSourcesForChamber,
        getRoleForPipe,
        getRegimeForPipe,
        getNodeRoleForChamber,
        isOriginChamber,
        isConfluenceChamber
    };
}

export function formatSourcesLabel(sources: string[]): string {
    if (sources.length === 0) return 'Sin aportes';
    if (sources.length === 1) return `Fuente: ${sources[0]}`;
    return `Fuentes: ${sources.join(', ')}`;
}

export function formatRoleLabel(role: string | null): string {
    if (!role) return 'Sin definir';
    
    const labels: Record<string, string> = {
        'RAMAL_INTERIOR': 'Ramal Interior',
        'RAMAL_CONEXION': 'Ramal Conexión',
        'LATERAL': 'Lateral',
        'COLECTOR': 'Colector',
        'INTERIOR_RAMAL': 'Ramal Interior',
        'DESCARGA_HORIZ': 'Descarga Horizontal',
        'COLECTOR_EXTERIOR': 'Colector Exterior'
    };
    
    return labels[role] || role;
}

export function formatRegimeLabel(regime: string | null): string {
    if (!regime) return 'Sin definir';
    
    const labels: Record<string, string> = {
        'NCH3371': 'NCh3371 (Interior)',
        'NCH1105': 'NCh1105 (Colectores)'
    };
    
    return labels[regime] || regime;
}
