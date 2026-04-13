import type { Pump, PumpingSystem, WetWell } from '../hydraulics/types';

interface PumpingSystemWithSelectionAliases extends PumpingSystem {
    selectedPumpId?: string;
    selectedWetWellId?: string;
}

export interface ActivePumpingSelection {
    activeSystem: PumpingSystem | null;
    selectedPumpId: string;
    selectedWetWellId: string;
    pump: Pump | null;
    wetWell: WetWell | null;
    pumpNotFound: boolean;
    wetWellNotFound: boolean;
}

const readId = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export function resolveActivePumpingSelection(params: {
    pumpingSystems: PumpingSystem[];
    activePumpingSystemId?: string | null;
    pumps: Pump[];
    wetWells?: WetWell[];
}): ActivePumpingSelection {
    const systems = Array.isArray(params.pumpingSystems) ? params.pumpingSystems : [];
    const activeId = readId(params.activePumpingSystemId);
    const activeSystem = (activeId ? systems.find(system => system.id === activeId) : undefined) || systems[0] || null;
    const systemWithAliases = (activeSystem || undefined) as PumpingSystemWithSelectionAliases | undefined;

    const selectedPumpId = readId(systemWithAliases?.selectedPumpId) || readId(systemWithAliases?.pumpId);
    const selectedWetWellId = readId(systemWithAliases?.selectedWetWellId) || readId(systemWithAliases?.wetWellId);

    const pump = selectedPumpId
        ? (params.pumps.find(item => item.id === selectedPumpId) || null)
        : null;

    const wetWell = selectedWetWellId
        ? ((params.wetWells || []).find(item => item.id === selectedWetWellId) || null)
        : null;

    return {
        activeSystem,
        selectedPumpId,
        selectedWetWellId,
        pump,
        wetWell,
        pumpNotFound: selectedPumpId.length > 0 && !pump,
        wetWellNotFound: selectedWetWellId.length > 0 && !wetWell
    };
}
