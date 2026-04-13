export type RecommendationType =
    | "INCREASE_SLOPE"
    | "DECREASE_DN"
    | "INCREASE_DN"
    | "FLOW_CAPACITY";

export interface Recommendation {
    tramoId: string; // ID visible (ej: T8)
    pipeId?: string; // ID interno
    norma: "NCh1105" | "NCh3371";
    falloLabel?: string; // Ej: "AUTOLAVADO (Condición mínima NCh1105)"
    tipo: RecommendationType;
    titulo: string;
    detalle: string;
    valores?: Record<string, number>;
    notas?: string[];
}
