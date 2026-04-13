import { resolveNormativeState, inferNormativeAuto } from './resolveNormativeState';

export type PipeRole = 'INTERIOR_RAMAL' | 'DESCARGA_HORIZ' | 'COLECTOR_EXTERIOR' | 'CAÑERIA';

export type DesignMethod = 'NCH3371_A' | 'NCH3371_B';

export type DescargaHorizVerificationMethod = 'A3_TABLA' | 'B25_MANNING';

export const DESCARGA_HORIZ_VERIFICATION_METHOD_OPTIONS: DescargaHorizVerificationMethod[] = ['A3_TABLA', 'B25_MANNING'];

export const DESCARGA_HORIZ_VERIFICATION_METHOD_LABELS: Record<DescargaHorizVerificationMethod, string> = {
    A3_TABLA: 'Anexo A – Tabla A.3 (recomendado)',
    B25_MANNING: 'Anexo B – B.2.5 (Manning)'
};

export const DESCARGA_HORIZ_VERIFICATION_SHORT_LABELS: Record<DescargaHorizVerificationMethod, string> = {
    A3_TABLA: 'A3_TABLA',
    B25_MANNING: 'B25_MANNING'
};

export function getDefaultVerificationMethodForDescarga(): DescargaHorizVerificationMethod {
    return 'A3_TABLA';
}

export interface PipeWithVerificationMethod {
    verificationMethod?: DescargaHorizVerificationMethod;
}

export function resolveDescargaHorizVerificationMethod(
    pipe: PipeWithVerificationMethod | undefined | null
): DescargaHorizVerificationMethod {
    return pipe?.verificationMethod ?? 'A3_TABLA';
}

export const PIPE_ROLE_OPTIONS: PipeRole[] = [
    'INTERIOR_RAMAL',
    'DESCARGA_HORIZ',
    'COLECTOR_EXTERIOR',
    'CAÑERIA'
];

export const PIPE_ROLE_LABELS: Record<PipeRole, string> = {
    INTERIOR_RAMAL: 'INTERIOR_RAMAL',
    DESCARGA_HORIZ: 'DESCARGA_HORIZ',
    COLECTOR_EXTERIOR: 'COLECTOR_EXTERIOR',
    CAÑERIA: 'CAÑERIA'
};

export const PIPE_ROLE_METHOD_LABELS: Record<PipeRole, string> = {
    INTERIOR_RAMAL: 'UEH (NCh3371 Anexo A)',
    DESCARGA_HORIZ: 'Manning (NCh3371 Anexo B.2.5)',
    COLECTOR_EXTERIOR: 'Manning (NCh1105)',
    CAÑERIA: 'Flujo Simple (NCh1105)'
};

export const DESIGN_METHOD_LABELS: Record<DesignMethod, string> = {
    NCH3371_A: 'NCh3371 · Anexo A (Tabla 3)',
    NCH3371_B: 'NCh3371 · Anexo B.2.5 (Manning)'
};

export const DESIGN_METHOD_OPTIONS: { value: DesignMethod | 'AUTO'; label: string }[] = [
    { value: 'AUTO', label: 'AUTO' },
    { value: 'NCH3371_B', label: 'Anexo B (B.2.5 / Manning)' },
    { value: 'NCH3371_A', label: 'Anexo A (Tabla 3)' }
];

export interface PipeWithRole {
    pipeRole?: PipeRole;
    topologyRegime?: string;
    topologyRole?: string;
    auto?: {
        pipeRole?: PipeRole;
        topologyRegime?: string;
        topologyRole?: string;
        sources?: string[];
    };
    override?: {
        enabled?: boolean;
        pipeRole?: PipeRole;
        norma?: string;
        role1105?: string;
        role3371?: string;
        normativeRegime?: string;
        normativeRole?: string;
    };
    effective?: {
        pipeRole?: PipeRole;
        topologyRegime?: string;
        topologyRole?: string;
    };
}

function getRegimeForResolvedPipeRole(pipeRole: PipeRole): string {
    return (pipeRole === 'COLECTOR_EXTERIOR' || pipeRole === 'CAÑERIA') ? 'NCH1105' : 'NCH3371';
}

function getTopologyRoleForResolvedPipeRole(pipeRole: PipeRole): string {
    if (pipeRole === 'COLECTOR_EXTERIOR') return 'COLECTOR';
    if (pipeRole === 'CAÑERIA') return 'CAÑERIA';
    if (pipeRole === 'DESCARGA_HORIZ') return 'LATERAL';
    return 'RAMAL_INTERIOR';
}

export function resolveEffectivePipeRole(pipe: PipeWithRole | undefined | null): PipeRole {
    if (!pipe) return 'DESCARGA_HORIZ';
    const state = resolveNormativeState(pipe);
    if (state.role === 'LATERAL' || state.role === 'COLECTOR') {
        return 'COLECTOR_EXTERIOR';
    }
    return state.role as PipeRole;
}

export function resolveEffectiveTopologyRegime(pipe: PipeWithRole | undefined | null): string {
    if (!pipe) return 'NCH3371';
    return resolveNormativeState(pipe).regime;
}

export function resolveEffectiveTopologyRole(pipe: PipeWithRole | undefined | null): string {
    if (!pipe) return 'RAMAL_CONEXION';
    const role = resolveNormativeState(pipe).role;
    if (role === 'INTERIOR_RAMAL') return 'RAMAL_INTERIOR';
    if (role === 'DESCARGA_HORIZ') return 'RAMAL_CONEXION';
    return role;
}

export function isPipeRole(value: unknown): value is PipeRole {
    return value === 'INTERIOR_RAMAL' || value === 'DESCARGA_HORIZ' || value === 'COLECTOR_EXTERIOR' || value === 'CAÑERIA';
}

export function normalizePipeRole(value: unknown): PipeRole | undefined {
    if (isPipeRole(value)) return value;
    if (typeof value === 'string') {
        const trimmed = value.trim().toUpperCase();
        if (isPipeRole(trimmed)) return trimmed;
        if (trimmed === 'INTERIOR' || trimmed === 'RAMAL_INTERIOR') return 'INTERIOR_RAMAL';
        if (trimmed === 'DESCARGA' || trimmed === 'HORIZONTAL') return 'DESCARGA_HORIZ';
        if (trimmed === 'COLECTOR' || trimmed === 'EXTERIOR') return 'COLECTOR_EXTERIOR';
        if (trimmed === 'CANERIA') return 'CAÑERIA';
    }
    return undefined;
}

export function mapLegacyPipeTypeToRole(pipeType: unknown): PipeRole | undefined {
    if (typeof pipeType !== 'string') return undefined;
    const normalized = pipeType.toLowerCase();

    if (normalized.includes('colector') || normalized.includes('public')) {
        return 'COLECTOR_EXTERIOR';
    }

    if (normalized.includes('domiciliario')) {
        return 'INTERIOR_RAMAL';
    }

    return undefined;
}

export function inferPipeRoleFromNodeTypes(
    startChamberType?: string,
    endChamberType?: string
): PipeRole {
    const autoInf = inferNormativeAuto(startChamberType, endChamberType);
    if (autoInf.regime === 'NCH1105') {
        if (autoInf.role === 'LATERAL' || autoInf.role === 'COLECTOR') return 'COLECTOR_EXTERIOR';
        return autoInf.role as PipeRole;
    }
    return autoInf.role as PipeRole;
}

export function getDefaultDesignMethodForRole(pipeRole: PipeRole): DesignMethod | null {
    switch (pipeRole) {
        case 'DESCARGA_HORIZ':
            return 'NCH3371_B';
        case 'INTERIOR_RAMAL':
        case 'COLECTOR_EXTERIOR':
        case 'CAÑERIA':
        default:
            return null;
    }
}

export interface PipeWithDesignMethod {
    designMethod?: DesignMethod;
}

export function resolveDesignMethod(
    pipe: PipeWithDesignMethod | undefined | null,
    pipeRole: PipeRole
): DesignMethod | null {
    if (pipe?.designMethod) {
        return pipe.designMethod;
    }
    return getDefaultDesignMethodForRole(pipeRole);
}

export function getDesignMethodLabel(method: DesignMethod | null): string {
    if (!method) return 'N/D';
    return DESIGN_METHOD_LABELS[method];
}

export function isDesignMethod(value: unknown): value is DesignMethod {
    return value === 'NCH3371_A' || value === 'NCH3371_B';
}
