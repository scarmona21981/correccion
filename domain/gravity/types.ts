import { GravityRole } from './mapTopologyRoleToGravityRole';

export type { GravityRole };

export interface SegmentInput {
    id: string;              // ID_TRAMO
    cIni: string;            // cámara inicial
    cFin: string;            // cámara final
    role: GravityRole;       // rol efectivo calculado (para compatibilidad hacia atrás)
    /** Rol calculado automáticamente por topología */
    gravityRole_auto?: 'NACIENTE' | 'LATERAL' | 'COLECTOR';
    /** Override manual del usuario (null = sin override) */
    gravityRole_manual?: 'NACIENTE' | 'LATERAL' | 'COLECTOR' | null;
    L_m: number;
    DN_mm: number;
    Dint_mm?: number;
    internalDiameterResolved?: number;
    slope_permille?: number; // I_EVAL
    material?: string;
    isInitial?: boolean;     // Para determinar I_min
    sdr?: string;
    manning_n?: number;
    manning_origin?: string;
    /** Población acumulada por tramo (de populationAccumulator). Usado como fallback para Qmd en Público. */
    P_edge?: number;
    /** Dotación D (L/hab/día) — necesario para calcular Qmd desde P_edge */
    D_Lphd?: number;
    /** Coeficiente R — necesario para calcular Qmd desde P_edge */
    R?: number;
    /** Coeficiente C — necesario para calcular Qmd desde P_edge */
    C?: number;
}

export interface QminMethodTrace {
    basis: "BSCE" | "QMD" | "0_60_QMD" | "0_60_QMD (fallback)";
    formula: string;         // string math-friendly
    values: Record<string, number | string>;
    notes?: string[];
}

export interface SegmentMinHydraulicResult {
    id: string;
    tramoLabel: string;      // "C2-C3"
    role: GravityRole;       // rol efectivo (puede ser manual)
    /** Rol calculado automáticamente por topología */
    role_auto?: GravityRole;
    /** true si el rol fue sobreescrito manualmente */
    role_isManual?: boolean;
    L_m: number;
    DN_mm: number;
    Dint_mm: number;
    I_eval_permille: number;

    Qmin_Ls: number;
    Qcap_Ls: number;
    h_over_D: number;
    V_ms: number;
    manning: number;
    manning_origin: string;
    velocityStatus?: 'CUMPLE' | 'ACEPTABLE' | 'REVISAR';

    trace: QminMethodTrace;

    limits: {
        I_min_permille: number;
        h_over_D_min: number;   // 0.30
        V_ref_lim_ms: number;   // 0.60 (nuevo standard)
        DN_min_mm?: number;
    };

    checks: {
        I: boolean;
        hD: boolean;
        Vref: boolean;  // "Cumple Velocidad"
        Qcap: boolean;
        DN: boolean;
    };

    status: "APTO" | "REVISAR" | "NO_CUMPLE" | "INCOMPLETO" | "NO_APTO";
    missing?: string[];
}
