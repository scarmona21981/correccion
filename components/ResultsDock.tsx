import React from 'react';
import { BarChart3, CircleDot, ExternalLink, Gauge, PanelRightClose, PanelRightOpen, Waves } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { DockSectionId, DockSubTabId, useView } from '../context/ViewContext';
import { useProject } from '../context/ProjectContext';
import { CURRENT_PROJECT_SCHEMA_VERSION, CURRENT_PROJECT_VERSION } from '../context/projectSchema';
import {
    GravityResults,
    PressureResults,
    PipeVerificationResult,
    Pump,
    PumpCurveMode,
    PumpCurvePoint
} from '../hydraulics/types';
import type { NormCheck } from '../hydraulics/normativeEvaluationEngine';
import { DataTable } from './common/DataTable';
import { StatusBadge, StatusType } from './common/StatusBadge';
import { ResultsView } from './ResultsView';
import { NewHydraulicCalculationTable } from './NewHydraulicCalculationTable';
import { PressureResultsView } from './PressureResultsView';
import { NchVerificationView } from './NchVerificationView';
import { RolNormativoTableView } from './RolNormativoTableView';
import { CameraTable } from './CameraTable';
import { NCh1105VerificationTables } from './NCh1105VerificationTables';
import { NCh3371VerificationTable } from './NCh3371VerificationTable';
import { LongitudinalProfile } from './LongitudinalProfile';
import type { LongitudinalProfileAirValveInsertPayload } from './LongitudinalProfile';
import { PumpCurveEditor } from './PumpCurveEditor';
import { CalcTraceDrawer } from './results/CalcTraceDrawer';
import { createPumpCurve, generateCurvePoints } from '../hydraulics/pumpModule';
import { getEffectivePipe } from '../utils/getEffectivePipe';
import { resolveActivePumpingSelection } from '../utils/pumpingSelection';
import type { AirValveNode } from '../hydraulics/types';
import { useNormativeChecks, useCalculateHydraulicForPipe } from '../application/hooks';

type SectionId = DockSectionId;

interface ResultsDockProps {
    mode?: 'full' | 'lite';
}

interface DockSection {
    id: SectionId;
    label: string;
    icon: LucideIcon;
}

const sections: DockSection[] = [
    { id: 'gravedad', label: 'Gravedad', icon: Waves },
    { id: 'impulsion', label: 'Impulsion', icon: Gauge },
    { id: 'camaras', label: 'Cámaras', icon: CircleDot },
    { id: 'resultados', label: 'Resultados', icon: BarChart3 }
];

const subTabsBySection: Record<SectionId, Array<{ id: DockSubTabId; label: string }>> = {
    gravedad: [
        { id: 'verificacion-nch1105', label: 'Verificación NCh 1105' },
        { id: 'verificacion-nch3371', label: 'Verificación NCh 3371' },
        { id: 'rol-normativo', label: 'Resumen' }
    ],
    impulsion: [
        { id: 'tabla', label: 'Tabla' },
        { id: 'curva', label: 'Curva Bomba' },
        { id: 'perfil', label: 'Perfil' },
        { id: 'trazabilidad', label: 'Trazabilidad' }
    ],
    camaras: [
        { id: 'tabla', label: 'Tabla' },
        { id: 'camara-humeda', label: 'Cámara húmeda' }
    ],
    resultados: [{ id: 'tabla', label: 'Tabla' }]
};

const isPressureResults = (results: unknown): results is PressureResults => {
    if (!results || typeof results !== 'object') return false;
    return 'operatingPoint' in results && 'pumpCurve' in results;
};

const mapGravityStatus = (verification?: PipeVerificationResult): StatusType => {
    if (!verification) return 'INFO';
    if (verification.status === 'NO_CONFORME') return 'NO APTO';
    if (verification.status === 'NO_EVALUADO') return 'INFO';
    return 'APTO';
};

const DockCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="results-dock-card">{children}</div>
);

const createCurveFromPump = (pump: Pump | null): PumpCurvePoint[] => {
    if (!pump) return [];

    if (pump.curveMode === 'TABLE' && Array.isArray(pump.curveTable) && pump.curveTable.length > 0) {
        return [...pump.curveTable]
            .filter(point => Number.isFinite(point?.Q) && Number.isFinite(point?.H))
            .sort((a, b) => a.Q - b.Q);
    }

    if (pump.curveMode === '3_POINTS' && pump.point0 && pump.pointNom && pump.pointMax) {
        return [pump.point0, pump.pointNom, pump.pointMax]
            .filter(point => Number.isFinite(point?.Q) && Number.isFinite(point?.H))
            .sort((a, b) => a.Q - b.Q);
    }

    try {
        const curve = createPumpCurve(pump);
        const qMax = Math.max(pump.Qnom || 0, pump.pointMax?.Q || 0.01, 0.01);
        return generateCurvePoints(curve, qMax, 36);
    } catch {
        return [];
    }
};

const getPumpCurveSignature = (pump: Pump | null): string => {
    if (!pump) return '';

    const points = (pump.curveMode === 'TABLE'
        ? (pump.curveTable || [])
        : [pump.point0, pump.pointNom, pump.pointMax]
    )
        .filter((point): point is PumpCurvePoint => Boolean(point && Number.isFinite(point.Q) && Number.isFinite(point.H)))
        .sort((a, b) => a.Q - b.Q);

    if (points.length === 0) return `${pump.id}|${pump.curveMode}|empty`;

    return `${pump.id}|${pump.curveMode}|${points.map(point => `${point.Q.toFixed(9)}:${point.H.toFixed(6)}`).join('|')}`;
};

const nearlyEqual = (left: number, right: number, eps = 1e-6): boolean => Math.abs(left - right) <= eps;

const WetWellChecksPanel: React.FC<{ pressureResults: PressureResults | null }> = ({ pressureResults }) => {
    const verification = pressureResults?.nchVerification;
    const wetWell = pressureResults?.wetWell;

    if (!verification || !wetWell) {
        return <div className="results-empty-state">Cámara húmeda: sin datos aún.</div>;
    }

    const mapNchStatus = (status: string): StatusType => {
        if (status === 'PASS') return 'APTO';
        if (status === 'FAIL') return 'NO APTO';
        if (status === 'WARN') return 'CONDICIONAL';
        return 'INFO';
    };

    const rows: Array<{ id: string; item: string; required: string; current: string; status: StatusType }> = verification.checks && verification.checks.length > 0
        ? verification.checks.map(check => ({
            id: check.id,
            item: check.label,
            required: check.limitValue !== undefined
                ? `${check.limitValue}${check.unit ? ` ${check.unit}` : ''}`
                : '—',
            current: check.measuredValue !== undefined && Number.isFinite(check.measuredValue)
                ? `${check.measuredValue.toFixed(2)}${check.unit ? ` ${check.unit}` : ''}`
                : '—',
            status: mapNchStatus(check.status)
        }))
        : [
            {
                id: 'vol',
                item: 'Volumen util',
                required: `${verification.usefulVolume.minimalRequired.toFixed(2)} m3`,
                current: `${verification.usefulVolume.current.toFixed(2)} m3`,
                status: verification.complianceChecklist.volume ? 'APTO' : 'NO APTO'
            },
            {
                id: 'ret',
                item: 'Tiempo de retencion',
                required: 'TR <= 30 min',
                current: `${verification.retentionTime.value.toFixed(1)} min`,
                status: verification.complianceChecklist.retention ? 'APTO' : 'NO APTO'
            },
            {
                id: 'cyc',
                item: 'Tiempo de ciclo',
                required: 'Tc >= 10 min',
                current: `${verification.cycleTime.value.toFixed(1)} min`,
                status: verification.complianceChecklist.cycle ? 'APTO' : 'NO APTO'
            },
            {
                id: 'vel',
                item: 'Velocidad en impulsion',
                required: '0.60 - 3.00 m/s',
                current: `${verification.velocity.current.toFixed(2)} m/s`,
                status: verification.complianceChecklist.velocity ? 'APTO' : 'NO APTO'
            },
            {
                id: 'red',
                item: 'Redundancia minima de bombas',
                required: '>= 2 bombas',
                current: verification.redundancy.current,
                status: verification.complianceChecklist.redundancy ? 'APTO' : 'NO APTO'
            },
            {
                id: 'sub',
                item: 'Sumergencia',
                required: `${verification.submergence.minimalRequired.toFixed(2)} m`,
                current: `${verification.submergence.current.toFixed(2)} m`,
                status: verification.complianceChecklist.submergence ? 'APTO' : 'NO APTO'
            },
            {
                id: 'mar',
                item: 'Margen de seguridad',
                required: `${verification.pumpMargin.required.toFixed(1)} %`,
                current: `${verification.pumpMargin.current.toFixed(1)} %`,
                status: verification.complianceChecklist.margin ? 'APTO' : 'NO APTO'
            }
        ];

    return (
        <DataTable
            title="Verificación Cámara Húmeda"
            columns={[
                { key: 'item', header: 'Chequeo', width: 220 },
                { key: 'required', header: 'Requerido', width: 150 },
                { key: 'current', header: 'Actual', width: 140, align: 'right' },
                {
                    key: 'status',
                    header: 'Estado',
                    width: 120,
                    align: 'center',
                    format: (v: any) => <StatusBadge status={v} />
                }
            ]}
            rows={rows}
            rowKey={(row) => row.id}
            density="compact"
            maxHeight="400px"
        />
    );
};

export const ResultsDock: React.FC<ResultsDockProps> = ({ mode = 'full' }) => {
    const isLite = mode === 'lite';
    const {
        resultsDockTabId,
        activeDockSubTab,
        setActiveSection,
        setActiveSubTab,
        setDockCollapsed,
        isCanvasExpanded,
        setIsCanvasExpanded,
        analysisResults,
        gravityResults,
        verification1105,
        setVerification1105,
        isVerif1105Running,
        setIsVerif1105Running,
        selectedIds,
        setEditingObjectId
    } = useView();

    const {
        pipes,
        chambers,
        settings,
        wetWells,
        pumps,
        pressurePipes,
        setPressurePipes,
        pressureJunctions,
        outfallsPressure,
        pumpingSystems,
        activePumpingSystemId,
        calculationMethod
    } = useProject();

    const pressureResults = isPressureResults(analysisResults) ? analysisResults : null;

    React.useEffect(() => {
        if (settings.projectType === 'Domiciliario' && activeDockSubTab === 'verificacion-nch1105') {
            setActiveSubTab('verificacion-nch3371');
        }
    }, [settings.projectType, activeDockSubTab, setActiveSubTab]);

    const { verification: normVerification, hasResults: hasNormResults } = useNormativeChecks({
        chambers,
        pipes,
        settings,
        enabled: activeDockSubTab === 'verificacion-nch1105' 
            && settings.projectType !== 'Domiciliario'
            && gravityResults !== null
            && chambers.length > 0
            && pipes.length > 0
    });

    React.useEffect(() => {
        if (normVerification) {
            setVerification1105(normVerification);
        }
    }, [normVerification, setVerification1105]);

    const pumpingSelection = React.useMemo(() => resolveActivePumpingSelection({
        pumpingSystems,
        activePumpingSystemId,
        pumps,
        wetWells
    }), [pumpingSystems, activePumpingSystemId, pumps, wetWells]);

    const activePump = pumpingSelection.pump;
    const selectedPumpId = pumpingSelection.selectedPumpId;
    const pumpSelectionError = pumpingSelection.pumpNotFound ? 'Bomba seleccionada no existe' : '';
    const isDevEnvironment = typeof window !== 'undefined'
        && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    React.useEffect(() => {
        if (!isDevEnvironment) return;
        const points = createCurveFromPump(activePump).length;
        console.log('[Pump] selectedPumpId=', selectedPumpId, 'pump.name=', activePump?.name || activePump?.userDefinedId || activePump?.id, 'points=', points);
    }, [isDevEnvironment, selectedPumpId, activePump]);

    const activePumpCurveSignature = React.useMemo(
        () => getPumpCurveSignature(activePump),
        [activePump]
    );

    const resultsPumpCurveSignature = React.useMemo(
        () => getPumpCurveSignature(pressureResults?.pump || null),
        [pressureResults]
    );

    const inflowMatchesSelection = React.useMemo(() => {
        if (!pressureResults) return false;
        const selectedWetWellId = pumpingSelection.selectedWetWellId;
        const resultWetWellId = pressureResults.wetWell?.id || '';
        if (!selectedWetWellId || selectedWetWellId !== resultWetWellId) return false;

        const currentInflow = Number(pumpingSelection.wetWell?.inflowRate);
        const resultInflow = Number(pressureResults.wetWell?.inflowRate);

        if (!Number.isFinite(currentInflow) && !Number.isFinite(resultInflow)) return true;
        if (!Number.isFinite(currentInflow) || !Number.isFinite(resultInflow)) return false;
        return nearlyEqual(currentInflow, resultInflow);
    }, [pressureResults, pumpingSelection]);

    const pressureResultsMatchesSelection = Boolean(
        pressureResults
        && selectedPumpId
        && pressureResults.pump?.id === selectedPumpId
        && inflowMatchesSelection
        && activePumpCurveSignature.length > 0
        && activePumpCurveSignature === resultsPumpCurveSignature
    );

    const systemCurveOutdatedByInflow = Boolean(
        pressureResults
        && selectedPumpId
        && pressureResults.pump?.id === selectedPumpId
        && !inflowMatchesSelection
    );

    const pumpMode: PumpCurveMode = activePump?.curveMode || 'TABLE';
    const pumpCurveData = React.useMemo(() => {
        if (pumpSelectionError) return [];
        return createCurveFromPump(activePump)
            .filter(point => Number.isFinite(point?.Q) && Number.isFinite(point?.H))
            .sort((a, b) => a.Q - b.Q);
    }, [pumpSelectionError, activePump]);

    const systemCurveData = React.useMemo(() => {
        if (!pressureResultsMatchesSelection) return [];
        return (pressureResults?.systemCurve || [])
            .filter(point => Number.isFinite(point?.Q) && Number.isFinite(point?.H))
            .sort((a, b) => a.Q - b.Q);
    }, [pressureResultsMatchesSelection, pressureResults]);

    const operationPoint = pressureResultsMatchesSelection ? (pressureResults?.operatingPoint || null) : null;
    const flowControl = pressureResultsMatchesSelection ? (pressureResults?.flowControl || null) : null;
    const npshSummary = React.useMemo(() => {
        if (!pressureResultsMatchesSelection || !pressureResults?.npsh) return '';
        const npsh = pressureResults.npsh;
        const right = npsh.npshRequired_m !== undefined
            ? ` / NPSHr ${npsh.npshRequired_m.toFixed(2)} m`
            : '';
        return `NPSHa ${npsh.npshAvailable_m.toFixed(2)} m${right}`;
    }, [pressureResultsMatchesSelection, pressureResults]);

    const pressureNodes = React.useMemo(() => {
        return [...wetWells, ...pumps, ...pressureJunctions, ...(outfallsPressure || [])] as any[];
    }, [wetWells, pumps, pressureJunctions, outfallsPressure]);

    const selectedGravityPipe = React.useMemo(() => {
        const selected = Array.from(selectedIds).find(id => pipes.some(pipe => pipe.id === id));
        return pipes.find(pipe => pipe.id === selected) || pipes[0] || null;
    }, [pipes, selectedIds]);

    const selectedPressurePipe = React.useMemo(() => {
        const selected = Array.from(selectedIds).find(id => pressurePipes.some(pipe => pipe.id === id));
        return pressurePipes.find(pipe => pipe.id === selected) || pressurePipes[0] || null;
    }, [pressurePipes, selectedIds]);

    const gravityTrace = React.useMemo(() => {
        if (!selectedGravityPipe || !gravityResults) {
            return { check: null as NormCheck | null, calculation: null as any, tramoId: '' };
        }

        const verification = gravityResults.verifications?.[selectedGravityPipe.id];
        const status = verification?.status === 'NO_CONFORME' ? 'FAIL' : (verification ? 'PASS' : 'INFO');
        const check: NormCheck = {
            id: 'CAPACIDAD',
            titulo: verification?.justification || 'Verificación hidráulica por tramo',
            estado: status,
            requerido: verification?.normativeReference || 'Cumplimiento normativo',
            actual: verification?.status || 'NO_EVALUADO',
            norma: verification?.normativeReference || 'NCh3371/NCh1105',
            evidencia: verification?.recommendations?.[0] || verification?.justification || 'Sin evidencia adicional.'
        };

        return {
            check,
            calculation: null,
            tramoId: selectedGravityPipe.userDefinedId || selectedGravityPipe.id
        };
    }, [selectedGravityPipe, gravityResults]);

    const { calculation: gravityCalc } = useCalculateHydraulicForPipe({
        pipe: selectedGravityPipe as any,
        settings: { populationTotal: settings.populationTotal },
        enabled: !!selectedGravityPipe && !!gravityResults
    });

    const pressureTrace = React.useMemo(() => {
        if (!selectedPressurePipe || !pressureResults) {
            return { check: null as NormCheck | null, tramoId: '' };
        }

        const verification = pressureResults.verifications?.[selectedPressurePipe.id];
        if (!verification) {
            return { check: null as NormCheck | null, tramoId: selectedPressurePipe.userDefinedId || selectedPressurePipe.id };
        }

        const nchChecks = pressureResults.nchVerification?.checks || [];
        const prioritizedNchCheck = nchChecks.find(item => item.status === 'FAIL')
            || nchChecks.find(item => item.status === 'WARN' || item.status === 'NA')
            || nchChecks[0];

        if (prioritizedNchCheck?.trace) {
            const status: 'PASS' | 'FAIL' | 'INFO' = prioritizedNchCheck.status === 'FAIL'
                ? 'FAIL'
                : (prioritizedNchCheck.status === 'PASS' ? 'PASS' : 'INFO');

            const required = prioritizedNchCheck.limitValue !== undefined
                ? `${prioritizedNchCheck.limitValue}${prioritizedNchCheck.unit ? ` ${prioritizedNchCheck.unit}` : ''}`
                : '—';

            const measured = prioritizedNchCheck.measuredValue !== undefined && Number.isFinite(prioritizedNchCheck.measuredValue)
                ? `${prioritizedNchCheck.measuredValue.toFixed(2)}${prioritizedNchCheck.unit ? ` ${prioritizedNchCheck.unit}` : ''}`
                : `${prioritizedNchCheck.trace.result}`;

            const check = {
                id: prioritizedNchCheck.id,
                titulo: prioritizedNchCheck.label,
                estado: status,
                requerido: required,
                actual: measured,
                norma: prioritizedNchCheck.clause
                    ? `Cláusula ${prioritizedNchCheck.clause}`
                    : 'Plantas Elevadoras',
                evidencia: prioritizedNchCheck.message,
                formula: prioritizedNchCheck.trace.formula,
                trace: prioritizedNchCheck.trace
            } as NormCheck & {
                trace: {
                    formula: string;
                    description: string;
                    inputs: Record<string, number | string>;
                    result: number | string;
                };
            };

            return {
                check: check as NormCheck,
                tramoId: selectedPressurePipe.userDefinedId || selectedPressurePipe.id
            };
        }

        const check = {
            id: 'CAPACIDAD',
            titulo: 'Verificación de impulsión',
            estado: verification.status === 'NO_CONFORME' ? 'FAIL' : 'PASS',
            requerido: 'Cumplir velocidad, presión y margen de seguridad',
            actual: `V=${verification.velocity.toFixed(2)} m/s, Pmax=${verification.maxPressure.toFixed(2)} bar`,
            norma: verification.normativeReference || 'Criterio de diseño',
            evidencia: verification.violations[0] || verification.recommendations[0] || 'Sin observaciones críticas.',
            trace: {
                formula: 'Verificación compuesta de impulsión',
                description: 'Resumen de velocidad, presión máxima y estado global del tramo.',
                inputs: {
                    velocity_ms: Number.isFinite(verification.velocity) ? verification.velocity : 0,
                    maxPressure_bar: Number.isFinite(verification.maxPressure) ? verification.maxPressure : 0,
                    pressurePoint_count: verification.pressurePoints?.length || 0
                },
                result: verification.status
            }
        } as NormCheck & {
            trace: {
                formula: string;
                description: string;
                inputs: Record<string, number | string>;
                result: number | string;
            };
        };

        return {
            check: check as NormCheck,
            tramoId: selectedPressurePipe.userDefinedId || selectedPressurePipe.id
        };
    }, [selectedPressurePipe, pressureResults]);

    const getSuggestedValveType = React.useCallback((type?: string): AirValveNode['airValveType'] => {
        if (type === 'AIR_RELEASE' || type === 'RECOMENDADA_INGRESO_AIRE' || type === 'PREVENTIVA_PENDIENTE') return 'SIMPLE';
        if (type === 'ANTI_SURGE' || type === 'EXPULSION_ANTI_GOLPE') return 'DOBLE';
        return 'TRIPLE';
    }, []);

    const insertSuggestedAirValveFromProfile = React.useCallback((payload: LongitudinalProfileAirValveInsertPayload) => {
        if (!payload?.pipeId) return;

        const currentPipe = pressurePipes.find(pipe => pipe.id === payload.pipeId);
        if (!currentPipe) return;

        const pipeLength = Number.isFinite(currentPipe.length) ? Math.max(currentPipe.length, 0) : 0;
        const chainage = Math.max(0, Math.min(pipeLength, Number(payload.chainageLocal) || 0));

        const existingOnPipe = (currentPipe.inlineNodes || []).find(node =>
            (payload.avId && node.id === payload.avId) || Math.abs(node.chainage - chainage) < 0.05
        );

        if (existingOnPipe) {
            setEditingObjectId({ id: existingOnPipe.id, type: 'air_valve' });
            return;
        }

        const preferredId = (payload.avId || '').trim();
        const existingIds = new Set(pressurePipes.flatMap(pipe => (pipe.inlineNodes || []).map(node => node.id)));
        let finalId = preferredId || `AV-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
        if (existingIds.has(finalId)) {
            let suffix = 2;
            while (existingIds.has(`${finalId}-${suffix}`)) suffix += 1;
            finalId = `${finalId}-${suffix}`;
        }

        const ratio = pipeLength > 0 ? chainage / pipeLength : 0;
        const x = currentPipe.x1 + (currentPipe.x2 - currentPipe.x1) * ratio;
        const y = currentPipe.y1 + (currentPipe.y2 - currentPipe.y1) * ratio;

        const newNode: AirValveNode = {
            id: finalId,
            pipeId: currentPipe.id,
            chainage,
            elevation: Number(payload.elevation) || 0,
            airValveType: getSuggestedValveType(payload.type),
            orificeDiameter: 50,
            pressureRating: 16,
            x,
            y
        };

        setPressurePipes(prev => prev.map(pipe => (
            pipe.id === currentPipe.id
                ? {
                    ...pipe,
                    inlineNodes: [...(pipe.inlineNodes || []), newNode]
                }
                : pipe
        )));

        setEditingObjectId({ id: newNode.id, type: 'air_valve' });
    }, [getSuggestedValveType, pressurePipes, setEditingObjectId, setPressurePipes]);

    const kpis = React.useMemo(() => {
        const counts: Record<StatusType, number> = {
            APTO: 0,
            'NO APTO': 0,
            CONDICIONAL: 0,
            INFO: 0,
            'FUERA ALCANCE': 0,
            'APTO CON OBSERVACIÓN': 0,
            'APTO CON ADVERTENCIA': 0,
            INCOMPLETO: 0,
            NO_APTO: 0,
            "SIN CAUDAL": 0,
            REVISAR: 0
        };

        if (gravityResults?.verifications) {
            Object.values(gravityResults.verifications).forEach(verification => {
                counts[mapGravityStatus(verification)] += 1;
            });
        }

        if (pressureResults?.verifications) {
            Object.values(pressureResults.verifications).forEach(verification => {
                if (verification.status === 'CONFORME') counts.APTO += 1;
                else counts['NO APTO'] += 1;
            });
        }

        if (pressureResults?.nchVerification) {
            const failed = Object.values(pressureResults.nchVerification.complianceChecklist).filter(value => !value).length;
            if (failed > 0) counts.CONDICIONAL += failed;
        }

        return counts;
    }, [gravityResults, pressureResults]);

    const activeSectionLabel = React.useMemo(
        () => sections.find(section => section.id === resultsDockTabId)?.label || 'Resultados',
        [resultsDockTabId]
    );

    const openFloatingWindow = React.useCallback(async () => {
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
                view: resultsDockTabId,
                selection: { subtab: activeDockSubTab },
                snapshotJson,
                analysisSnapshotJson
            });
        } catch (error) {
            console.warn('No se pudo abrir la ventana flotante.', error);
        }
    }, [
        resultsDockTabId,
        activeDockSubTab,
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
        analysisResults
    ]);

    const renderSectionBody = () => {
        if (resultsDockTabId === 'gravedad') {
            if (activeDockSubTab === 'tabla') return <NewHydraulicCalculationTable />;

            if (activeDockSubTab === 'verificacion-nch1105') {
                return <NCh1105VerificationTables />;
            }

            if (activeDockSubTab === 'verificacion-nch3371') {
                return <NCh3371VerificationTable />;
            }

            if (activeDockSubTab === 'rol-normativo') return <RolNormativoTableView />;

            if (activeDockSubTab === 'perfil') {
                if (chambers.length < 2 || pipes.length === 0) {
                    return <div className="results-empty-state">Sin datos para perfil por gravedad.</div>;
                }

                return (
                    <LongitudinalProfile
                        mode="gravedad"
                        nodes={chambers}
                        pipes={pipes}
                    />
                );
            }

            if (activeDockSubTab === 'trazabilidad') {
                if (!gravityTrace.check || !gravityCalc) {
                    return <div className="results-empty-state">Sin trazas disponibles para este tramo.</div>;
                }

                return (
                    <DockCard>
                        <CalcTraceDrawer
                            embedded
                            open
                            onClose={() => undefined}
                            check={gravityTrace.check}
                            calculation={gravityCalc}
                            tramoId={gravityTrace.tramoId}
                            rol={String(getEffectivePipe(selectedGravityPipe).role || 'N/A')}
                        />
                    </DockCard>
                );
            }

            return <div className="results-empty-state">Subtab no disponible en gravedad.</div>;
        }

        if (resultsDockTabId === 'impulsion') {
            if (activeDockSubTab === 'tabla') {
                if (!pressureResults) return <div className="results-empty-state">Sin resultados de impulsion.</div>;
                return <PressureResultsView results={pressureResults} mode="results" />;
            }

            if (activeDockSubTab === 'curva') {
                if (pumpSelectionError) {
                    return <div className="results-empty-state">{pumpSelectionError}</div>;
                }

                if (systemCurveOutdatedByInflow) {
                    return <div className="results-empty-state">Curva de sistema desactualizada por cambio de Q afluente. Ejecute nuevamente el cálculo.</div>;
                }

                if (pumpCurveData.length === 0) {
                    return <div className="results-empty-state">Curva de bomba: sin datos aun.</div>;
                }

                return (
                    <DockCard>
                        <PumpCurveEditor
                            mode={pumpMode}
                            curveData={pumpCurveData}
                            onModeChange={() => undefined}
                            onCurveChange={() => undefined}
                            disabled
                            readOnlyResults
                            systemCurveData={systemCurveData}
                            operatingPoint={operationPoint}
                            flowControl={flowControl}
                            npshSummary={npshSummary}
                        />
                    </DockCard>
                );
            }

            if (activeDockSubTab === 'perfil') {
                if (pressureNodes.length < 2 || pressurePipes.length === 0) {
                    return <div className="results-empty-state">Sin datos para perfil de impulsion.</div>;
                }

                return (
                    <LongitudinalProfile
                        mode="impulsion"
                        nodes={pressureNodes}
                        pipes={pressurePipes as any[]}
                        pressureVerifications={pressureResults?.verifications}
                        onInsertAirValve={insertSuggestedAirValveFromProfile}
                    />
                );
            }

            if (activeDockSubTab === 'trazabilidad') {
                if (!pressureTrace.check) {
                    return <div className="results-empty-state">Sin trazas disponibles para este tramo.</div>;
                }

                return (
                    <DockCard>
                        <CalcTraceDrawer
                            embedded
                            open
                            onClose={() => undefined}
                            check={pressureTrace.check}
                            calculation={null}
                            tramoId={pressureTrace.tramoId}
                            rol="IMPULSION"
                        />
                    </DockCard>
                );
            }

            return <div className="results-empty-state">Subtab no disponible en impulsion.</div>;
        }


        if (resultsDockTabId === 'camaras') {
            if (activeDockSubTab === 'camara-humeda') return <WetWellChecksPanel pressureResults={pressureResults} />;
            return <CameraTable />;
        }

        if (resultsDockTabId === 'resultados') {
            if (!gravityResults) return <div className="results-empty-state">Sin resultados por tramo.</div>;
            return <ResultsView results={gravityResults} pipes={pipes} settings={settings} />;
        }

        return <div className="results-empty-state">Seleccione una seccion.</div>;
    };

    return (
        <div className="results-dock-pro">
            <div className="results-dock-pro-header">
                <div className="results-dock-pro-titlewrap">
                    <span className="results-dock-pro-kicker">{isLite ? 'Ventana flotante' : 'Palette'}</span>
                    <div className="results-dock-pro-title-row">
                        <div className="results-dock-pro-title">{isLite ? `Dock - ${activeSectionLabel}` : 'Centro de Resultados'}</div>
                        <span className="results-dock-pro-code">{String(resultsDockTabId).toUpperCase()}</span>
                    </div>
                </div>
                {!isLite && (
                    <div className="results-dock-pro-actions">
                        <button onClick={openFloatingWindow} title="Abrir ventana flotante"><ExternalLink size={14} /></button>
                        <button onClick={() => setDockCollapsed(true)} title="Colapsar"><PanelRightClose size={14} /></button>
                        <button onClick={() => setIsCanvasExpanded(!isCanvasExpanded)} title="Expandir vista"><PanelRightOpen size={14} /></button>
                    </div>
                )}
            </div>

            <div className="results-dock-sections" role="tablist" aria-label="Secciones de resultados">
                {sections.map(section => {
                    const Icon = section.icon;
                    return (
                        <button
                            key={section.id}
                            className={resultsDockTabId === section.id ? 'active' : ''}
                            onClick={() => setActiveSection(section.id)}
                        >
                            <Icon size={13} />
                            <span>{section.label}</span>
                        </button>
                    );
                })}
            </div>

            <div className="results-dock-pro-subtabs">
                {(subTabsBySection[resultsDockTabId] || [])
                    .filter(subTab => {
                        if (settings.projectType === 'Domiciliario' && subTab.id === 'verificacion-nch1105') {
                            return false;
                        }
                        return true;
                    })
                    .map(subTab => (
                        <button
                            key={`${resultsDockTabId}-${subTab.id}`}
                            className={activeDockSubTab === subTab.id ? 'active' : ''}
                            onClick={() => setActiveSubTab(subTab.id)}
                        >
                            {subTab.label}
                        </button>
                    ))}
            </div>

            <div className="results-dock-pro-body">
                {renderSectionBody()}
            </div>

            {!isLite && (
                <div className="results-dock-pro-footer">
                    <span><StatusBadge status="APTO" /> {kpis.APTO}</span>
                    <span><StatusBadge status="NO APTO" /> {kpis['NO APTO']}</span>
                    <span><StatusBadge status="CONDICIONAL" /> {kpis.CONDICIONAL}</span>
                    <span><StatusBadge status="INFO" /> {kpis.INFO}</span>
                </div>
            )}
        </div>
    );
};
