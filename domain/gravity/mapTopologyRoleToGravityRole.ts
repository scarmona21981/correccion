// Normaliza roles provenientes de topología hacia roles hidráulicos NCh1105

export type GravityRole =
    | "COLECTOR"
    | "INTERCEPTOR"
    | "EMISARIO"
    | "LATERAL"
    | "NACIENTE"
    | "CAÑERIA";

export function mapTopologyRoleToGravityRole(input?: string): GravityRole {
    const raw = (input || "").toUpperCase().trim();

    // Normalización flexible
    if (raw.includes("COLECTOR")) return "COLECTOR";
    if (raw.includes("INTERCEPTOR")) return "INTERCEPTOR";
    if (raw.includes("EMISARIO")) return "EMISARIO";
    if (raw.includes("LATERAL")) return "LATERAL";
    if (raw.includes("NACIENTE")) return "NACIENTE";
    if (raw.includes("CAÑERIA")) return "CAÑERIA";

    // No log during render to avoid React hook violations
    return "LATERAL"; // Cambiado a LATERAL como default inteligente según UX
}
