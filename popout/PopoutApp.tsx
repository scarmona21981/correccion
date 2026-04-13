import React from 'react';
import { ResultsDockLite } from '../components/ResultsDockLite';
import { ProjectProvider } from '../context/ProjectContext';
import {
    DockSectionId,
    DockSubTabId,
    ViewProvider,
    useView
} from '../context/ViewContext';
import { PopoutProfileWindow } from './PopoutProfileWindow';

const DEFAULT_SUBTAB_BY_SECTION: Record<DockSectionId, DockSubTabId> = {
    gravedad: 'verificacion-nch1105',
    impulsion: 'tabla',
    camaras: 'tabla',
    resultados: 'tabla'
};

const normalizeSection = (value: unknown): DockSectionId => {
    if (value === 'gravedad' || value === 'impulsion' || value === 'camaras' || value === 'resultados') {
        return value;
    }
    return 'resultados';
};

const normalizeSubTab = (value: unknown): DockSubTabId | null => {
    if (value === 'tabla'
        || value === 'perfil'
        || value === 'trazabilidad'
        || value === 'curva'
        || value === 'verificacion'
        || value === 'verificacion-nch1105'
        || value === 'verificacion-nch3371'
        || value === 'rol-normativo'
        || value === 'camara-humeda') {
        return value;
    }
    return null;
};

const titleBySection: Record<DockSectionId, string> = {
    gravedad: 'Gravedad',
    impulsion: 'Impulsión',
    camaras: 'Cámaras',
    resultados: 'Resultados'
};

const resolveSelectionSubTab = (selection: Record<string, unknown> | null | undefined): DockSubTabId | null => {
    if (!selection || typeof selection !== 'object') return null;
    return normalizeSubTab(selection.subtab ?? selection.subTab);
};

const PopoutShell: React.FC = () => {
    const searchParams = React.useMemo(() => new URLSearchParams(window.location.search), []);
    const windowId = searchParams.get('windowId') || 'popout';
    const initialSection = normalizeSection(searchParams.get('view'));
    const initialSubTab = normalizeSubTab(searchParams.get('subtab'));

    const {
        resultsDockTabId,
        setActiveSection,
        setActiveSubTab,
        setDockCollapsed,
        setResultsDockOpen,
        setIsCanvasExpanded
    } = useView();

    React.useEffect(() => {
        setResultsDockOpen(true);
        setDockCollapsed(false);
        setIsCanvasExpanded(false);
    }, [setDockCollapsed, setIsCanvasExpanded, setResultsDockOpen]);

    React.useEffect(() => {
        setActiveSection(initialSection);
        setActiveSubTab(initialSubTab || DEFAULT_SUBTAB_BY_SECTION[initialSection]);
    }, [initialSection, initialSubTab, setActiveSection, setActiveSubTab]);

    React.useEffect(() => {
        if (!window.electronAPI?.onPopoutInit) return;

        const unsub = window.electronAPI.onPopoutInit((payload) => {
            const nextSection = normalizeSection(payload?.view);
            const nextSubTab = resolveSelectionSubTab(payload?.selection);
            setActiveSection(nextSection);
            setActiveSubTab(nextSubTab || DEFAULT_SUBTAB_BY_SECTION[nextSection]);
        });

        return () => {
            if (typeof unsub === 'function') {
                unsub();
            }
        };
    }, [setActiveSection, setActiveSubTab]);

    const closeWindow = React.useCallback(() => {
        if (window.electronAPI?.closePopout) {
            window.electronAPI.closePopout(windowId).catch(() => window.close());
            return;
        }
        window.close();
    }, [windowId]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--border-color)',
                    background: 'var(--sidebar-bg)'
                }}
            >
                <strong style={{ color: 'var(--text-main)', fontSize: '0.9rem' }}>
                    Ventana flotante - {titleBySection[resultsDockTabId]}
                </strong>
                <button
                    onClick={closeWindow}
                    style={{
                        border: '1px solid var(--border-color)',
                        borderRadius: '10px',
                        padding: '6px 10px',
                        cursor: 'pointer',
                        background: 'var(--bg-color)',
                        color: 'var(--text-main)',
                        fontWeight: 600
                    }}
                >
                    Cerrar X
                </button>
            </div>

            <div style={{ flex: 1, minHeight: 0 }}>
                <ResultsDockLite />
            </div>
        </div>
    );
};

export const PopoutApp: React.FC = () => {
    const searchParams = React.useMemo(() => new URLSearchParams(window.location.search), []);
    const view = searchParams.get('view');
    const isProfileRouteView = view === 'PROFILE_ROUTE_GRAVITY' || view === 'PROFILE_ROUTE';

    return (
        <ProjectProvider>
            <ViewProvider>
                {isProfileRouteView ? <PopoutProfileWindow /> : <PopoutShell />}
            </ViewProvider>
        </ProjectProvider>
    );
};
