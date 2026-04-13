import { PipeRole } from '../../utils/pipeRole';

export type TopologyRole = 'RAMAL_INTERIOR' | 'RAMAL_CONEXION' | 'NACIENTE' | 'LATERAL' | 'COLECTOR';
export type TopologyRegime = 'NCH3371' | 'NCH1105';

export const TOPOLOGY_ROLE_LABELS: Record<TopologyRole, string> = {
    RAMAL_INTERIOR: 'Ramal Interior',
    RAMAL_CONEXION: 'Ramal Conexión',
    NACIENTE: 'Naciente',
    LATERAL: 'Lateral',
    COLECTOR: 'Colector'
};

export const TOPOLOGY_REGIME_LABELS: Record<TopologyRegime, string> = {
    NCH3371: 'NCh3371 (Interior)',
    NCH1105: 'NCh1105 (Colectores)'
};

export function mapTopologyRoleToPipeRole(topologyRole: TopologyRole): PipeRole {
    switch (topologyRole) {
        case 'RAMAL_INTERIOR':
            return 'INTERIOR_RAMAL';
        case 'RAMAL_CONEXION':
            return 'DESCARGA_HORIZ';
        case 'NACIENTE':
        case 'LATERAL':
        case 'COLECTOR':
            return 'COLECTOR_EXTERIOR';
        default:
            return 'DESCARGA_HORIZ';
    }
}

export function getRegimeForTopologyRole(topologyRole: TopologyRole): TopologyRegime {
    switch (topologyRole) {
        case 'RAMAL_INTERIOR':
        case 'RAMAL_CONEXION':
            return 'NCH3371';
        case 'NACIENTE':
        case 'LATERAL':
        case 'COLECTOR':
            return 'NCH1105';
        default:
            return 'NCH3371';
    }
}

export function inferTopologyRoleFromSources(
    sourcesCount: number,
    fromChamberClass?: 'DOMICILIARIA' | 'PUBLICA' | 'NONE',
    toChamberClass?: 'DOMICILIARIA' | 'PUBLICA' | 'NONE',
    isMainCollector?: boolean
): TopologyRole {
    if (sourcesCount >= 2) {
        return isMainCollector ? 'COLECTOR' : 'LATERAL';
    }

    if (fromChamberClass === 'DOMICILIARIA' && toChamberClass === 'DOMICILIARIA') {
        return 'RAMAL_INTERIOR';
    }

    return 'RAMAL_CONEXION';
}

export type AutoNormativeRole = 'INTERIOR_RAMAL' | 'DESCARGA_HORIZ' | 'LATERAL' | 'COLECTOR';

interface AutoNormativeNodeLike {
    type?: string | null;
    chamberClass?: string | null;
    chamberType?: string | null;
}

function normalizeText(value: unknown): string {
    return String(value ?? '')
        .trim()
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function resolveNodeType(node?: AutoNormativeNodeLike | null): 'PUBLICA' | 'DOMICILIARIA' | 'NONE' {
    const candidates = [node?.type, node?.chamberClass, node?.chamberType];

    for (const candidate of candidates) {
        const normalized = normalizeText(candidate);
        if (normalized === 'PUBLICA') return 'PUBLICA';
        if (normalized === 'DOMICILIARIA') return 'DOMICILIARIA';
    }

    return 'NONE';
}

export function inferAutoNormative(
    startNode?: AutoNormativeNodeLike | null,
    endNode?: AutoNormativeNodeLike | null
): { regime: TopologyRegime; role: AutoNormativeRole } {
    const startType = resolveNodeType(startNode);
    const endType = resolveNodeType(endNode);

    if (startType === 'PUBLICA' && endType === 'PUBLICA') {
        return {
            regime: 'NCH1105',
            role: 'COLECTOR'
        };
    }

    if (startType === 'DOMICILIARIA' && endType === 'DOMICILIARIA') {
        return {
            regime: 'NCH3371',
            role: 'INTERIOR_RAMAL'
        };
    }

    return {
        regime: 'NCH3371',
        role: 'DESCARGA_HORIZ'
    };
}
