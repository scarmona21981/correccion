import React, { createContext, useContext, useMemo, useState } from 'react';

export type AnalysisViewMode = 'normativo' | 'tecnico';

interface AnalysisViewModeContextType {
    mode: AnalysisViewMode;
    setMode: (mode: AnalysisViewMode) => void;
}

const STORAGE_KEY = 'smcalc.analysis-view-mode.v1';

const AnalysisViewModeContext = createContext<AnalysisViewModeContextType | undefined>(undefined);

const getInitialMode = (): AnalysisViewMode => {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        return raw === 'tecnico' ? 'tecnico' : 'normativo';
    } catch {
        return 'normativo';
    }
};

export const AnalysisViewModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [mode, setModeState] = useState<AnalysisViewMode>(() => getInitialMode());

    const setMode = (nextMode: AnalysisViewMode) => {
        setModeState(nextMode);
        try {
            window.localStorage.setItem(STORAGE_KEY, nextMode);
        } catch {
            // ignore storage failures
        }
    };

    const value = useMemo<AnalysisViewModeContextType>(() => ({
        mode,
        setMode
    }), [mode]);

    return (
        <AnalysisViewModeContext.Provider value={value}>
            {children}
        </AnalysisViewModeContext.Provider>
    );
};

export const useAnalysisViewMode = (): AnalysisViewModeContextType => {
    const context = useContext(AnalysisViewModeContext);
    if (!context) {
        throw new Error('useAnalysisViewMode must be used within AnalysisViewModeProvider');
    }
    return context;
};
