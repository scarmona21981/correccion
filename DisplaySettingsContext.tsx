import React, { createContext, useContext, useMemo, useState } from 'react';
import { FlowUnit } from './hydraulics/flowUnits';

const STORAGE_KEY = 'smcalc.display-settings.v1';

export interface DisplaySettingsState {
    flowUnit: FlowUnit;
    flowDecimals: number;
    valueDecimals: number;
}

interface DisplaySettingsContextType {
    settings: DisplaySettingsState;
    setFlowUnit: (unit: FlowUnit) => void;
    setFlowDecimals: (decimals: number) => void;
    setValueDecimals: (decimals: number) => void;
}

const DEFAULT_SETTINGS: DisplaySettingsState = {
    flowUnit: 'L/s',
    flowDecimals: 2,
    valueDecimals: 2
};

const clampDecimals = (value: number): number => {
    if (!Number.isFinite(value)) return 2;
    return Math.max(0, Math.min(6, Math.round(value)));
};

const sanitizeSettings = (raw: Partial<DisplaySettingsState> | null | undefined): DisplaySettingsState => {
    if (!raw) return DEFAULT_SETTINGS;

    const flowUnit = raw.flowUnit === 'm3/s' || raw.flowUnit === 'L/s' || raw.flowUnit === 'L/min'
        ? raw.flowUnit
        : DEFAULT_SETTINGS.flowUnit;

    return {
        flowUnit,
        flowDecimals: clampDecimals(raw.flowDecimals ?? DEFAULT_SETTINGS.flowDecimals),
        valueDecimals: clampDecimals(raw.valueDecimals ?? DEFAULT_SETTINGS.valueDecimals)
    };
};

const loadInitialSettings = (): DisplaySettingsState => {
    try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (!saved) return DEFAULT_SETTINGS;
        return sanitizeSettings(JSON.parse(saved));
    } catch {
        return DEFAULT_SETTINGS;
    }
};

const DisplaySettingsContext = createContext<DisplaySettingsContextType | undefined>(undefined);

export const DisplaySettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [settings, setSettings] = useState<DisplaySettingsState>(() => loadInitialSettings());

    const persist = (next: DisplaySettingsState) => {
        setSettings(next);
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
            // ignore storage failures
        }
    };

    const contextValue = useMemo<DisplaySettingsContextType>(() => ({
        settings,
        setFlowUnit: (flowUnit: FlowUnit) => persist({ ...settings, flowUnit }),
        setFlowDecimals: (flowDecimals: number) => persist({ ...settings, flowDecimals: clampDecimals(flowDecimals) }),
        setValueDecimals: (valueDecimals: number) => persist({ ...settings, valueDecimals: clampDecimals(valueDecimals) })
    }), [settings]);

    return (
        <DisplaySettingsContext.Provider value={contextValue}>
            {children}
        </DisplaySettingsContext.Provider>
    );
};

export const useDisplaySettings = (): DisplaySettingsContextType => {
    const context = useContext(DisplaySettingsContext);
    if (!context) {
        throw new Error('useDisplaySettings must be used within a DisplaySettingsProvider');
    }
    return context;
};
