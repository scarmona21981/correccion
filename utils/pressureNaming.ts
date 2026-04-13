// Pressure element naming utilities
// Generates automatic nomenclature for pressure network elements

import { WetWell, Pump, PressurePipe, OutfallPressure } from '../hydraulics/types';

/**
 * Generate automatic name for pressure elements following pattern:
 * - WetWells: CH-1, CH-2, CH-3... (Cámara Húmeda)
 * - Pumps: B-1, B-2, B-3... (Bomba)
 * - PressurePipes: P-1, P-2, P-3... (Presión)
 * - OutfallsPressure: D-1, D-2, D-3... (Descarga)
 */

export const generateWetWellName = (existingWetWells: WetWell[]): string => {
    const count = existingWetWells.length + 1;
    return `CH-${count}`;
};

export const generatePumpName = (existingPumps: Pump[]): string => {
    const count = existingPumps.length + 1;
    return `B-${count}`;
};

export const generatePressurePipeName = (existingPipes: PressurePipe[]): string => {
    const count = existingPipes.length + 1;
    return `P-${count}`;
};

export const generateOutfallPressureName = (existingOutfalls: OutfallPressure[]): string => {
    const count = existingOutfalls.length + 1;
    return `D-${count}`;
};

export const generatePressureJunctionName = (existingJunctions: any[]): string => {
    const count = existingJunctions.length + 1;
    return `N-${count}`;
};

/**
 * Get display name for any pressure element
 */
export const getPressureElementDisplayName = (
    element: WetWell | Pump | PressurePipe | OutfallPressure,
    type: 'wetwell' | 'pump' | 'pressurepipe' | 'outfall'
): string => {
    // If element has a name property, use it
    if ('name' in element && element.name) {
        return element.name;
    }

    // Otherwise fallback to ID
    return element.id;
};
