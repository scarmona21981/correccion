
import { PipeMaterial } from '../hydraulics/types';

export interface DiameterMapping {
    nominal: number;
    internal: number;
}

const DIAMETERS_PVC: Record<string, number> = {
    "110": 104,
    "125": 118,
    "160": 152,
    "200": 188,
    "250": 236,
    "315": 298,
    "355": 336,
    "400": 379,
    "450": 426,
    "500": 474,
    "630": 598
};

const DIAMETERS_HDPE_CORRUGADO: Record<string, number> = {
    "160": 135,
    "200": 170,
    "250": 215,
    "315": 270,
    "400": 340,
    "500": 425,
    "630": 535
};

const DIAMETERS_HORMIGON: Record<string, number> = {
    "200": 200,
    "250": 250,
    "300": 300,
    "400": 400,
    "500": 500,
    "600": 600,
    "700": 700,
    "800": 800,
    "900": 900,
    "1000": 1000
};

const DIAMETERS_HDPE_LISO: Record<string, Record<string, number>> = {
    "SDR17": {
        "110": 96.8, "125": 110.2, "160": 141.0, "200": 176.2, "250": 220.4,
        "315": 277.6, "355": 312.8, "400": 352.6, "450": 396.6, "500": 440.6, "630": 555.2
    },
    "SDR21": {
        "160": 144.6, "200": 180.8, "250": 226.2, "315": 285.0, "400": 361.8, "500": 452.2, "630": 570.0
    },
    "SDR26": {
        "160": 147.6, "200": 184.6, "250": 230.8, "315": 290.8, "400": 369.2, "500": 461.6, "630": 581.6
    }
};

/**
 * Result of internal diameter resolution
 */
export interface InternalDiameterResult {
    di_mm: number;
    source: 'AUTO' | 'MANUAL' | 'FALLBACK_DN';
    warning?: string;
}

export function isValidDiameterMm(value: unknown): boolean {
    const n = Number(value);
    return Number.isFinite(n) && n > 0;
}

/**
 * Prioridad hidráulica obligatoria:
 * 1) pipe.internalDiameterResolved válido
 * 2) diámetro automático/tabla (si se entrega)
 * 3) DN nominal
 */
export function resolveHydraulicDiMm(pipe: any, autoDiMm?: number): number {
    const resolved = Number(pipe?.internalDiameterResolved);
    if (isValidDiameterMm(resolved)) return resolved;

    if (isValidDiameterMm(autoDiMm)) return Number(autoDiMm);

    const dn = Number(pipe?.diameter?.value ?? pipe?.diameter ?? 0);
    return isValidDiameterMm(dn) ? dn : 0;
}

/**
 * Maps nominal diameter (DN) to accurate internal diameter (Di)
 * @param material Pipe material name
 * @param dn Nominal diameter in mm
 * @param sdr Standard Dimension Ratio (optional, for HDPE LISO)
 * @returns Internal diameter in mm. Returns DN if no mapping found.
 */
export function getInternalDiameter(material: string, dn: number, sdr: string = 'SDR17'): number {
    const dnStr = dn.toString();

    // Normalize material name to match keys
    const mat = material.toUpperCase().trim();

    if (mat.includes('PVC')) {
        return DIAMETERS_PVC[dnStr] || dn;
    }

    if (mat === 'HDPE_LISO' || mat === 'HDPE LISO') {
        const sdrTable = DIAMETERS_HDPE_LISO[sdr] || DIAMETERS_HDPE_LISO['SDR17'];
        return sdrTable[dnStr] || dn;
    }

    if (mat === 'HDPE_CORRUGADO' || mat === 'HDPE CORRUGADO') {
        return DIAMETERS_HDPE_CORRUGADO[dnStr] || dn;
    }

    if (mat.includes('HORMIGON') || mat.includes('HCV')) {
        return DIAMETERS_HORMIGON[dnStr] || dn;
    }

    return dn;
}

/**
 * Centralizes the resolution of internal diameter for a pipe.
 * 
 * @param pipe A pipe object (partial or full)
 * @returns Resolved internal diameter data
 */
export function resolveInternalDiameter(pipe: any): InternalDiameterResult {
    const mode = pipe.internalDiameterMode || 'AUTO';
    const dn = Number(pipe.diameter?.value ?? pipe.diameter ?? 110);
    const material = String(pipe.material?.value ?? pipe.material ?? 'PVC');
    const sdr = String(pipe.sdr?.value ?? pipe.sdr ?? 'SDR17');

    if (mode === 'MANUAL') {
        const manualVal = Number(pipe.internalDiameterManual?.value ?? pipe.internalDiameterManual ?? 0);
        if (isValidDiameterMm(manualVal)) {
            return {
                di_mm: manualVal,
                source: 'MANUAL'
            };
        }
        // If manual is invalid, fallback to AUTO or DN? User said: "Si modo manual y valor <= 0 o vacío, mostrar error y no usarlo"
        // Here we just return AUTO as fallback for robustness but ideally UI handles errors.
    }

    // AUTO MODE
    const resolvedAuto = getInternalDiameter(material, dn, sdr);
    
    if (resolvedAuto === dn && dn > 0) {
        // Check if it was a true match in HORMIGON or just fallback
        // PVC 110 returns 104. If we got DN back, likely no table entry.
        const dnStr = dn.toString();
        const mat = material.toUpperCase().trim();
        let tableHasEntry = false;
        
        if (mat.includes('PVC')) tableHasEntry = !!DIAMETERS_PVC[dnStr];
        else if (mat === 'HDPE_LISO' || mat === 'HDPE LISO') tableHasEntry = !!(DIAMETERS_HDPE_LISO[sdr]?.[dnStr] || DIAMETERS_HDPE_LISO['SDR17']?.[dnStr]);
        else if (mat === 'HDPE_CORRUGADO' || mat === 'HDPE CORRUGADO') tableHasEntry = !!DIAMETERS_HDPE_CORRUGADO[dnStr];
        else if (mat.includes('HORMIGON') || mat.includes('HCV')) tableHasEntry = !!DIAMETERS_HORMIGON[dnStr];

        if (!tableHasEntry) {
            return {
                di_mm: dn,
                source: 'FALLBACK_DN',
                warning: `DINT no encontrado en tabla para ${material} DN${dn}; se usa DN como fallback.`
            };
        }
    }

    return {
        di_mm: resolvedAuto,
        source: 'AUTO'
    };
}
