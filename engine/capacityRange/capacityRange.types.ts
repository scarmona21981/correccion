export type CapacityStatus =
    | 'OPTIMO'
    | 'SUBUTILIZADO'
    | 'SOBRECARGADO'
    | 'INDETERMINADO'
    | 'INCOMPATIBLE';

export interface CapacityRangeResult {
    pipeId: string;
    label: string; // T2, T3, etc.
    rol: string;

    P_base: number;
    Q_base_lps: number;

    P_min_norm: number | null;
    P_max_norm: number | null;

    deltaP_up: number | null;   // P_max - P_base
    deltaP_down: number | null; // P_base - P_min

    status: CapacityStatus;

    limitingMax?: string;
    limitingMin?: string;

    // NUEVO: evaluación en P_base (para explicar la incoherencia)
    okMaxAtBase?: boolean;  // cumple condición máxima en P_base
    okMinAtBase?: boolean;  // cumple autolavado/condición mínima en P_base

    // NUEVO: limitante real resumida
    limitingReal?: 'Autolavado' | 'Capacidad máxima' | 'Ambas' | 'Ninguna' | 'Desconocido';

    // NUEVO: texto corto para UI (columna Limitante Real)
    limitingRealText?: string;

    detailsMax?: string;
    detailsMin?: string;

    norma: 'NCh1105' | 'NCh3371' | 'INDETERMINADA';
}

export interface CapacityConstraints {
    dn_mm: number;
    slope_pct: number;
    material: string;
    n: number;
    di_mm: number;
}
