export type DomesticRole = "RAMAL_PRINCIPAL" | "RAMAL" | "LATERAL" | "DESCARGA" | "OTRO";

export interface DomesticSegmentInput {
    id: string;
    cIni: string;
    cFin: string;
    role: DomesticRole;
    L_m: number;
    DN_mm: number;
    Dint_mm: number;
    slope_pct: number;
    ueh_acum: number;
}

export interface DomesticResult {
    id: string;
    tramoLabel: string;
    role: DomesticRole;
    L_m: number;
    DN_mm: number;
    Dint_mm: number;
    I_eval_pct: number;
    I_min_pct: number;
    L_max_m: number;
    DN_min_mm: number | null;
    ueh_acum: number;
    ueh_max_a3: number | null;

    checks: {
        I: boolean;
        L: boolean;
        DN: boolean;
        UEH: boolean;
    };

    status: "APTO" | "NO APTO" | "INCOMPLETO";
    missing: string[];

    trace: {
        method: string;
        slopeRule: string;
        lengthRule: string;
        dnRule: string;
        uehRule: string;
        ueh_max_a3: number | null;
        I_used_pct: number;
        DN_used_mm: number;
        notes?: string[];
    };
}
