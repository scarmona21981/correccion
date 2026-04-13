import React, { useState, useEffect } from 'react';
import { X, HelpCircle, Maximize, AlertTriangle } from 'lucide-react';
import { useProject, ProjectUnits, FlowDesignModeCollectors, NCh1105PeakMode } from '../context/ProjectContext';
import { useView } from '../context/ViewContext';
import { PropertyInput } from './common/PropertyInput';

interface MapDimensionsDialogProps {
    isOpen: boolean;
    onClose: () => void;
}

export const MapDimensionsDialog: React.FC<MapDimensionsDialogProps> = ({ isOpen, onClose }) => {
    const { settings, setSettings, chambers, pipes } = useProject();
    const { backdrop, layers, isLocked } = useView();

    const [minX, setMinX] = useState(0);
    const [minY, setMinY] = useState(0);
    const [maxX, setMaxX] = useState(1000);
    const [maxY, setMaxY] = useState(1000);
    const [units, setUnits] = useState<ProjectUnits>('Meters');
    const [showHelp, setShowHelp] = useState(false);
    const [hasPopulation, setHasPopulation] = useState(false);
    const [populationTotal, setPopulationTotal] = useState(0);
    const [D_L_per_hab_day, setD_L_per_hab_day] = useState(150);
    const [R_recovery, setR_recovery] = useState(0.8);
    const [C_capacity, setC_capacity] = useState(1.0);
    const [flowDesignModeCollectors, setFlowDesignModeCollectors] = useState<FlowDesignModeCollectors>('DIRECT_Q');
    const [nch1105PeakMode, setNch1105PeakMode] = useState<NCh1105PeakMode>('AUTO');
    const [habPorCasaInput, setHabPorCasaInput] = useState('');
    // Keep project type local to avoid committing invalid/partial settings while the dialog is open.
    const [projectType, setProjectType] = useState<import('../context/ProjectContext').ProjectType>(settings.projectType);
    const [manningGlobal, setManningGlobal] = useState(0.013);
    const [isManningGlobalManual, setIsManningGlobalManual] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setMinX(settings.mapDimensions.minX);
            setMinY(settings.mapDimensions.minY);
            setMaxX(settings.mapDimensions.maxX);
            setMaxY(settings.mapDimensions.maxY);
            setUnits(settings.units);
            setHasPopulation(settings.hasPopulation);
            setPopulationTotal(settings.populationTotal);
            setD_L_per_hab_day(settings.D_L_per_hab_day);
            setR_recovery(settings.R_recovery);
            setC_capacity(settings.C_capacity);
            setFlowDesignModeCollectors(settings.flowDesignModeCollectors ?? 'DIRECT_Q');
            setNch1105PeakMode(settings.nch1105?.peakMode ?? 'AUTO');
            setHabPorCasaInput(settings.nch1105?.habPorCasa && settings.nch1105.habPorCasa > 0 ? String(settings.nch1105.habPorCasa) : '');
            setProjectType(settings.projectType);
            setManningGlobal(settings.manning.value ?? 0.013);
            setIsManningGlobalManual(settings.manning.source === 'manual');
            setShowHelp(false);
        }
    }, [isOpen, settings]);

    if (!isOpen) return null;

    const handleAutoSize = () => {
        if (isLocked) return;
        if (chambers.length === 0 && pipes.length === 0 && !(backdrop.url && layers.backdrop)) {
            alert("No elements or backdrop to auto-size to.");
            return;
        }

        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;

        chambers.forEach(c => {
            x1 = Math.min(x1, c.x);
            y1 = Math.min(y1, c.y);
            x2 = Math.max(x2, c.x);
            y2 = Math.max(y2, c.y);
        });

        pipes.forEach(p => {
            x1 = Math.min(x1, p.x1, p.x2);
            y1 = Math.min(y1, p.y1, p.y2);
            x2 = Math.max(x2, p.x1, p.x2);
            y2 = Math.max(y2, p.y1, p.y2);
        });

        if (backdrop.url && layers.backdrop) {
            x1 = Math.min(x1, backdrop.x);
            y1 = Math.min(y1, backdrop.y);
            x2 = Math.max(x2, backdrop.x + 1000 * backdrop.scale);
            y2 = Math.max(y2, backdrop.y + 1000 * backdrop.scale);
        }

        const padX = (x2 - x1) * 0.1 + 50;
        const padY = (y2 - y1) * 0.1 + 50;

        setMinX(Math.floor(x1 - padX));
        setMinY(Math.floor(y1 - padY));
        setMaxX(Math.ceil(x2 + padX));
        setMaxY(Math.ceil(y2 + padY));
    };

    const handleOk = () => {
        if (maxX <= minX) {
            alert("Upper Right X must be greater than Lower Left X");
            return;
        }
        if (maxY <= minY) {
            alert("Upper Right Y must be greater than Lower Left Y");
            return;
        }

        const habPorCasaText = habPorCasaInput.trim();
        const habPorCasaParsed = Number(habPorCasaText.replace(',', '.'));
        const habPorCasaValue = habPorCasaText === ''
            ? null
            : (Number.isFinite(habPorCasaParsed) && habPorCasaParsed > 0 ? habPorCasaParsed : null);

        if (habPorCasaText !== '' && habPorCasaValue === null) {
            alert('hab/casa debe ser mayor a 0');
            return;
        }

        const isDomiciliario = projectType === 'Domiciliario';
        const isPublico = projectType === 'Público';

        let finalFlowMode = isDomiciliario ? 'DIRECT_Q' : flowDesignModeCollectors;
        let finalHasPopulation = isDomiciliario ? false : (finalFlowMode === 'POPULATION_NCH1105' ? hasPopulation : false);
        let finalPeakMode = nch1105PeakMode;

        if (isPublico) {
            finalFlowMode = 'POPULATION_NCH1105';
            finalHasPopulation = true;
            finalPeakMode = 'STRICT';
            // Guard: OK button should already be disabled, but block here too
            if (populationTotal <= 0 || D_L_per_hab_day <= 0) return;
        } else {
            if (finalFlowMode === 'POPULATION_NCH1105' && finalHasPopulation) {
                if (populationTotal <= 0) {
                    alert("Población total debe ser mayor a 0 cuando está activado");
                    return;
                }
                if (D_L_per_hab_day <= 0) {
                    alert("Dotación debe ser mayor a 0 cuando está activado");
                    return;
                }
            }
        }

        setSettings({
            ...settings,
            projectType,
            mapDimensions: { minX, minY, maxX, maxY },
            units,
            hasPopulation: finalHasPopulation,
            populationTotal: finalHasPopulation ? populationTotal : 0,
            D_L_per_hab_day: finalHasPopulation ? D_L_per_hab_day : 0,
            R_recovery,
            C_capacity,
            manning: {
                value: manningGlobal,
                source: isManningGlobalManual ? 'manual' : 'global'
            },
            flowDesignModeCollectors: finalFlowMode,
            nch1105: {
                enabled: finalFlowMode === 'POPULATION_NCH1105' && finalHasPopulation,
                peakMode: finalPeakMode,
                habPorCasa: habPorCasaValue
            }
        });
        onClose();
    };

    const getRWarning = (): string | null => {
        if (!hasPopulation && !isPublico) return null;
        if (R_recovery < 0.7) return "R < 0.7: valor inusualmente bajo";
        if (R_recovery > 1.0) return "R > 1.0: verificar si corresponde";
        return null;
    };

    const getCWarning = (): string | null => {
        if (!hasPopulation && !isPublico) return null;
        if (C_capacity < 1.0) return "C < 1.0: factor de capacidad menor al recomendado";
        return null;
    };

    const isPublico = projectType === 'Público';
    const isDomiciliario = projectType === 'Domiciliario';
    const isMandatoryManning = isPublico || projectType === 'Mixto';
    const isInvalidManning = isMandatoryManning && (manningGlobal <= 0 || isNaN(manningGlobal));
    const isInvalidPublico = isPublico && (populationTotal <= 0 || D_L_per_hab_day <= 0);

    const renderPopulationInputs = () => (
        <>
            <div style={{ marginBottom: '10px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '3px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    hab/casa (opcional)
                </label>
                <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={habPorCasaInput}
                    placeholder="hab/casa (para BSCE)"
                    onChange={(e) => setHabPorCasaInput(e.target.value)}
                    disabled={isLocked || (!hasPopulation && !isPublico)}
                    style={{
                        width: '100%',
                        padding: '6px',
                        borderRadius: '4px',
                        border: '1px solid var(--border)',
                        background: (!hasPopulation && !isPublico) ? 'var(--locked-bg)' : 'var(--surface)',
                        color: 'var(--text-primary)'
                    }}
                />
                {hasPopulation && habPorCasaInput.trim() === '' && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Si no define hab/casa, BSCE usa fallback explícito de 5 hab/casa.
                    </div>
                )}
                {habPorCasaInput.trim() !== '' && !(Number(habPorCasaInput.replace(',', '.')) > 0) && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: '4px' }}>
                        Valor inválido: debe ser mayor a 0.
                    </div>
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '3px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        Población total (hab) *
                    </label>
                    <PropertyInput
                        isNumber={true}
                        value={populationTotal}
                        onChange={(val) => setPopulationTotal(val as number)}
                        disabled={isLocked || (!hasPopulation && !isPublico)}
                        style={{ width: '100%', padding: '4px', background: (!hasPopulation && !isPublico) ? 'var(--locked-bg)' : 'var(--surface)', color: 'var(--text-primary)' }}
                    />
                    {isPublico && populationTotal <= 0 && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: '2px', fontWeight: 600 }}>Requiere P &gt; 0</div>
                    )}
                </div>
                <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '3px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        Dotación D (L/hab/d) *
                    </label>
                    <PropertyInput
                        isNumber={true}
                        value={D_L_per_hab_day}
                        onChange={(val) => setD_L_per_hab_day(val as number)}
                        disabled={isLocked || (!hasPopulation && !isPublico)}
                        style={{ width: '100%', padding: '4px', background: (!hasPopulation && !isPublico) ? 'var(--locked-bg)' : 'var(--surface)', color: 'var(--text-primary)' }}
                    />
                    {isPublico && D_L_per_hab_day <= 0 && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: '2px', fontWeight: 600 }}>Requiere D &gt; 0</div>
                    )}
                    {!isPublico && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>Default: 150</span>}
                </div>
                <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '3px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        R (coef. recuperación)
                        {getRWarning() && (
                            <span style={{ color: 'var(--warning)', marginLeft: '4px', fontSize: '0.75rem' }}>
                                <AlertTriangle size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />
                                {getRWarning()}
                            </span>
                        )}
                    </label>
                    <PropertyInput
                        isNumber={true}
                        value={R_recovery}
                        onChange={(val) => setR_recovery(val as number)}
                        disabled={isLocked || (!hasPopulation && !isPublico)}
                        style={{ width: '100%', padding: '4px', background: (!hasPopulation && !isPublico) ? 'var(--locked-bg)' : 'var(--surface)', color: 'var(--text-primary)' }}
                    />
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>Default: 0.8</span>
                </div>
                <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '3px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        C (factor capacidad)
                        {getCWarning() && (
                            <span style={{ color: 'var(--warning)', marginLeft: '4px', fontSize: '0.75rem' }}>
                                <AlertTriangle size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />
                                {getCWarning()}
                            </span>
                        )}
                    </label>
                    <PropertyInput
                        isNumber={true}
                        value={C_capacity}
                        onChange={(val) => setC_capacity(val as number)}
                        disabled={isLocked || (!hasPopulation && !isPublico)}
                        style={{ width: '100%', padding: '4px', background: (!hasPopulation && !isPublico) ? 'var(--locked-bg)' : 'var(--surface)', color: 'var(--text-primary)' }}
                    />
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>Default: 1.0</span>
                </div>
            </div>
        </>
    );

    return (
        <div className="modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'var(--modal-backdrop)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000
        }}>
            <div className="modal-content" style={{
                background: 'var(--surface-elevated)', padding: '20px', borderRadius: '8px',
                width: '400px', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--modal-shadow)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Project Settings</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                        <X size={20} />
                    </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                    <fieldset style={{ border: '1px solid var(--border)', padding: '10px', borderRadius: '4px' }}>
                        <legend style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>Lower Left</legend>
                        <div style={{ marginBottom: '8px' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem' }}>X-coordinate</label>
                            <PropertyInput
                                isNumber={true}
                                value={minX}
                                onChange={(val) => setMinX(val as number)}
                                disabled={isLocked}
                                style={{ width: '100%', padding: '4px' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem' }}>Y-coordinate</label>
                            <PropertyInput
                                isNumber={true}
                                value={minY}
                                onChange={(val) => setMinY(val as number)}
                                disabled={isLocked}
                                style={{ width: '100%', padding: '4px' }}
                            />
                        </div>
                    </fieldset>

                    <fieldset style={{ border: '1px solid var(--border)', padding: '10px', borderRadius: '4px' }}>
                        <legend style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>Upper Right</legend>
                        <div style={{ marginBottom: '8px' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem' }}>X-coordinate</label>
                            <PropertyInput
                                isNumber={true}
                                value={maxX}
                                onChange={(val) => setMaxX(val as number)}
                                disabled={isLocked}
                                style={{ width: '100%', padding: '4px' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem' }}>Y-coordinate</label>
                            <PropertyInput
                                isNumber={true}
                                value={maxY}
                                onChange={(val) => setMaxY(val as number)}
                                disabled={isLocked}
                                style={{ width: '100%', padding: '4px' }}
                            />
                        </div>
                    </fieldset>
                </div>

                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>Map Units</label>
                    <select
                        value={units}
                        onChange={e => setUnits(e.target.value as ProjectUnits)}
                        disabled={isLocked}
                        style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)' }}
                    >
                        <option value="Meters">Meters</option>
                        <option value="Feet">Feet</option>
                        <option value="Degrees">Degrees</option>
                        <option value="None">None</option>
                    </select>
                </div>

                {showHelp && (
                    <div style={{ background: 'var(--hover-bg)', padding: '10px', borderRadius: '4px', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '15px', border: '1px solid var(--border)' }}>
                        <p><strong>Map Area:</strong> Defines the spatial limits of the project.</p>
                        <p><strong>Caudal Colectores:</strong> Configura cómo se calcula el caudal para tramos COLECTOR_EXTERIOR según NCh1105.</p>
                    </div>
                )}

                <div style={{ marginBottom: '15px', border: '1px solid var(--border)', padding: '10px', borderRadius: '4px' }}>
                    <legend style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-secondary)', marginBottom: '8px' }}>Project Configuration</legend>

                    <div style={{ marginBottom: '12px' }}>
                        <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '6px', fontWeight: 600, color: 'var(--text-primary)' }}>Project Type</label>
                        <div style={{ display: 'flex', gap: '15px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem' }}>
                                <input
                                    type="radio"
                                    name="projectType"
                                    checked={projectType === 'Domiciliario'}
                                    onChange={() => {
                                        setProjectType('Domiciliario');
                                        setFlowDesignModeCollectors('DIRECT_Q');
                                        setHasPopulation(false);
                                        setNch1105PeakMode('AUTO');
                                    }}
                                    disabled={isLocked}
                                /> Domiciliario
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem' }}>
                                <input
                                    type="radio"
                                    name="projectType"
                                    checked={projectType === 'Público'}
                                    onChange={() => {
                                        setProjectType('Público');
                                        setFlowDesignModeCollectors('POPULATION_NCH1105');
                                        setHasPopulation(true);
                                        setNch1105PeakMode('STRICT');
                                    }}
                                    disabled={isLocked}
                                /> Público
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem' }}>
                                <input
                                    type="radio"
                                    name="projectType"
                                    checked={projectType === 'Mixto'}
                                    onChange={() => setProjectType('Mixto')}
                                    disabled={isLocked}
                                /> Mixto
                            </label>
                        </div>
                    </div>

                    <div style={{ marginTop: '12px' }}>
                        <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '3px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            Manning global gravedad {isMandatoryManning ? '*' : ''}
                        </label>
                        <PropertyInput
                            isNumber={true}
                            value={manningGlobal}
                            onChange={(val) => setManningGlobal(val as number)}
                            disabled={isLocked}
                            style={{
                                width: '100%',
                                padding: '6px',
                                background: isLocked ? 'var(--locked-bg)' : 'var(--surface)',
                                color: 'var(--text-primary)',
                                border: isInvalidManning ? '1px solid var(--danger)' : '1px solid var(--border)'
                            }}
                        />
                        {isInvalidManning && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: '2px', fontWeight: 600 }}>
                                Manning global es obligatorio para este tipo de proyecto.
                            </div>
                        )}
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Eje: 0.013. Se usará por defecto en tramos.</span>
                    </div>
                </div>

                {!isDomiciliario && (
                    <div style={{ marginBottom: '15px', border: '1px solid var(--accent)', padding: '12px', borderRadius: '6px', background: 'var(--info-bg)' }}>
                        <legend style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent)', marginBottom: '10px' }}>
                            Diseño poblacional (NCh1105)
                        </legend>

                        {isPublico ? (
                            <>
                                <div style={{ fontSize: '0.9rem', color: 'var(--accent)', padding: '8px', background: 'var(--accent-soft)', borderRadius: '4px', fontWeight: 600, border: '1px solid var(--accent)', marginBottom: '12px' }}>
                                    Modo obligatorio: Estricto NCh1105 (BSCE + Interpolación + Harmon)
                                </div>

                                {renderPopulationInputs()}
                            </>
                        ) : (
                            <>
                                <div style={{ marginBottom: '12px' }}>
                                    <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '6px', fontWeight: 600, color: 'var(--text-primary)' }}>Modo de diseño de caudal</label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                                            <input
                                                type="radio"
                                                name="flowDesignModeCollectors"
                                                checked={flowDesignModeCollectors === 'POPULATION_NCH1105'}
                                                onChange={() => setFlowDesignModeCollectors('POPULATION_NCH1105')}
                                                disabled={isLocked}
                                            />
                                            <span>Con población (NCh1105 - Harmon/BSCE)</span>
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                                            <input
                                                type="radio"
                                                name="flowDesignModeCollectors"
                                                checked={flowDesignModeCollectors === 'DIRECT_Q'}
                                                onChange={() => setFlowDesignModeCollectors('DIRECT_Q')}
                                                disabled={isLocked}
                                            />
                                            <span>Sin población (Caudal directo por instalación)</span>
                                        </label>
                                    </div>
                                </div>

                                {flowDesignModeCollectors === 'POPULATION_NCH1105' && (
                                    <>
                                        <div style={{ marginBottom: '10px', padding: '10px', background: 'var(--info-bg)', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--accent)', border: '1px solid var(--info-border)' }}>
                                            <strong style={{ fontWeight: 600 }}>Fórmula Harmon (NCh1105:2019):</strong><br />
                                            M = 1 + 14 / (4 + √(P/1000))<br />
                                            <em>P = población en habitantes</em>
                                        </div>

                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', marginBottom: '10px', color: 'var(--text-primary)' }}>
                                            <input
                                                type="checkbox"
                                                checked={hasPopulation}
                                                onChange={(e) => setHasPopulation(e.target.checked)}
                                                disabled={isLocked}
                                            />
                                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Configurar población</span>
                                        </label>

                                        <div style={{ marginBottom: '10px' }}>
                                            <label style={{ display: 'block', fontSize: '0.82rem', marginBottom: '5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                Regla de punta (NCh1105)
                                            </label>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                                                    <input
                                                        type="radio"
                                                        name="nch1105PeakMode"
                                                        checked={nch1105PeakMode === 'AUTO'}
                                                        onChange={() => setNch1105PeakMode('AUTO')}
                                                        disabled={isLocked || !hasPopulation}
                                                    />
                                                    <span>AUTO (recomendado)</span>
                                                </label>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                                                    <input
                                                        type="radio"
                                                        name="nch1105PeakMode"
                                                        checked={nch1105PeakMode === 'FORCE_HARMON'}
                                                        onChange={() => setNch1105PeakMode('FORCE_HARMON')}
                                                        disabled={isLocked || !hasPopulation}
                                                    />
                                                    <span>Forzar Harmon</span>
                                                </label>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                                                    <input
                                                        type="radio"
                                                        name="nch1105PeakMode"
                                                        checked={nch1105PeakMode === 'STRICT'}
                                                        onChange={() => setNch1105PeakMode('STRICT')}
                                                        disabled={isLocked || !hasPopulation}
                                                    />
                                                    <span>Estricto NCh1105 (BSCE + Interpolación + Harmon)</span>
                                                </label>
                                            </div>
                                        </div>

                                        {hasPopulation && renderPopulationInputs()}

                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '10px', marginBottom: 0, fontWeight: 500 }}>
                                            <strong style={{ color: 'var(--text-primary)' }}>Selección normativa (NCh1105:2019 6.6.1.1):</strong><br />
                                            • P {'<'} 100 → BSCE (Anexo A)<br />
                                            • 100 ≤ P ≤ 1000 → Interpolación<br />
                                            • P {'>'} 1000 → Harmon oficial<br />
                                            • Si no hay hab/casa, BSCE usa fallback explícito de 5 hab/casa.<br />
                                            <span style={{ fontSize: '0.75rem', fontStyle: 'italic', color: 'var(--text-muted)' }}>Solo aplica a tramos COLECTOR_EXTERIOR.</span>
                                        </p>
                                    </>
                                )}

                                {flowDesignModeCollectors === 'DIRECT_Q' && (
                                    <p style={{ fontSize: '0.85rem', color: 'var(--accent)', marginTop: '8px', marginBottom: 0, fontStyle: 'italic', fontWeight: 500 }}>
                                        Defina el caudal Q (L/s) en cada instalación o fuente usando el inspector de propiedades.
                                        Se acumula hacia el colector.
                                    </p>
                                )}
                            </>
                        )}
                    </div>
                )}

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <button
                        onClick={() => setShowHelp(!showHelp)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}
                        title="Help"
                    >
                        <HelpCircle size={18} />
                    </button>

                    <div style={{ flex: 1 }} />

                    <button
                        onClick={handleAutoSize}
                        disabled={isLocked}
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', background: 'var(--hover-bg)', border: '1px solid var(--border)', borderRadius: '4px', cursor: isLocked ? 'not-allowed' : 'pointer', opacity: isLocked ? 0.6 : 1, color: 'var(--text-primary)' }}
                    >
                        <Maximize size={14} /> Auto-Size
                    </button>

                    <button
                        onClick={onClose}
                        style={{ padding: '6px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-primary)' }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleOk}
                        disabled={isLocked || isInvalidPublico || isInvalidManning}
                        style={{ padding: '6px 16px', background: 'var(--accent)', color: '#ffffff', border: 'none', borderRadius: '4px', cursor: (isLocked || isInvalidPublico || isInvalidManning) ? 'not-allowed' : 'pointer', opacity: (isLocked || isInvalidPublico || isInvalidManning) ? 0.6 : 1 }}
                    >
                        OK
                    </button>
                </div>
            </div>
        </div>
    );
};
