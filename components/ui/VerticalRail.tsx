import React from 'react';
import { BarChart3, CircleDot, Gauge, PanelRight, Waves } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { DockSectionId, useView } from '../../context/ViewContext';
import { useProject } from '../../context/ProjectContext';
import { CURRENT_PROJECT_SCHEMA_VERSION, CURRENT_PROJECT_VERSION } from '../../context/projectSchema';

const railSections: Array<{ id: DockSectionId; label: string; shortLabel: string; icon: LucideIcon }> = [
    { id: 'gravedad', label: 'Gravedad', shortLabel: 'GRAV', icon: Waves },
    { id: 'impulsion', label: 'Impulsión', shortLabel: 'IMP', icon: Gauge },
    { id: 'camaras', label: 'Cámaras', shortLabel: 'CAM', icon: CircleDot },
    { id: 'resultados', label: 'Resultados', shortLabel: 'RES', icon: BarChart3 }
];

export const VerticalRail: React.FC = () => {
    const {
        chambers,
        pipes,
        settings,
        wetWells,
        pumps,
        pressurePipes,
        pressureJunctions,
        outfallsPressure,
        pumpingSystems,
        activePumpingSystemId,
        calculationMethod
    } = useProject();

    const {
        resultsDockTabId,
        isResultsDockCollapsed,
        isRightPanelCollapsed,
        openResultsDock,
        closeResultsDock,
        analysisResults,
        gravityResults,
        verification1105,
        toggleRightPanel
    } = useView();

    const openGravityFloatingWindow = React.useCallback(async () => {
        closeResultsDock();

        if (!window.electronAPI?.openPopout) return;

        const snapshotJson = JSON.stringify({
            fileType: 'SMCALC_ALC',
            version: CURRENT_PROJECT_VERSION,
            schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
            chambers,
            pipes,
            settings,
            wetWells: wetWells.length > 0 ? wetWells : undefined,
            pumps: pumps.length > 0 ? pumps : undefined,
            pressurePipes: pressurePipes.length > 0 ? pressurePipes : undefined,
            outfallsPressure: outfallsPressure.length > 0 ? outfallsPressure : undefined,
            pressureJunctions: pressureJunctions.length > 0 ? pressureJunctions : undefined,
            pumpingSystems: pumpingSystems.length > 0 ? pumpingSystems : undefined,
            activePumpingSystemId: activePumpingSystemId || undefined,
            calculationMethod: pumps.length > 0 ? calculationMethod : undefined
        });

        const analysisSnapshotJson = JSON.stringify({
            analysisResults,
            gravityResults,
            verification1105
        });

        try {
            await window.electronAPI.openPopout({
                view: 'gravedad',
                selection: { subtab: 'verificacion-nch1105' },
                snapshotJson,
                analysisSnapshotJson
            });
        } catch (error) {
            console.warn('No se pudo abrir la ventana flotante de gravedad.', error);
        }
    }, [
        closeResultsDock,
        chambers,
        pipes,
        settings,
        wetWells,
        pumps,
        pressurePipes,
        outfallsPressure,
        pressureJunctions,
        pumpingSystems,
        activePumpingSystemId,
        calculationMethod,
        analysisResults,
        gravityResults,
        verification1105
    ]);

    if (!isResultsDockCollapsed && !isRightPanelCollapsed) {
        return null;
    }

    return (
        <div className="vertical-rail" role="navigation" aria-label="Accesos laterales">
            <button className={`vertical-rail-tab ${!isRightPanelCollapsed ? 'active' : ''}`} onClick={toggleRightPanel} title="Inspector">
                <PanelRight size={16} />
                <span>INSP</span>
            </button>
            {railSections.map(section => {
                const Icon = section.icon;
                const active = !isResultsDockCollapsed && resultsDockTabId === section.id;
                return (
                    <button
                        key={section.id}
                        className={`vertical-rail-tab ${active ? 'active' : ''}`}
                        title={section.label}
                        onClick={() => {
                            if (section.id === 'gravedad') {
                                openGravityFloatingWindow();
                                return;
                            }
                            openResultsDock(section.id);
                        }}
                    >
                        <Icon size={16} />
                        <span>{section.shortLabel}</span>
                    </button>
                );
            })}
        </div>
    );
};
