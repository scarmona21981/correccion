import React from 'react';
import { useProject } from '../context/ProjectContext';
import { RouteProfileView } from '../components/RouteProfileView';
import {
    buildGraphFromPipes,
    buildProfileData,
    formatRouteText,
    RoutePathGravity
} from '../hydraulics/routeEngineGravity';
import { ExportProfileDialog } from './ExportProfileDialog';

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

const parseRoute = (value: unknown): RoutePathGravity | null => {
    if (!isRecord(value)) return null;
    const nodeIds = Array.isArray(value.nodeIds) ? value.nodeIds.filter((item): item is string => typeof item === 'string') : [];
    const legacyEdgeIds = Array.isArray(value.edgeIds) ? value.edgeIds.filter((item): item is string => typeof item === 'string') : [];
    const pipeIds = Array.isArray(value.pipeIds)
        ? value.pipeIds.filter((item): item is string => typeof item === 'string')
        : legacyEdgeIds;

    if (nodeIds.length === 0) return null;

    return {
        nodeIds,
        pipeIds,
        totalLength: Number.isFinite(Number(value.totalLength))
            ? Number(value.totalLength)
            : (Number.isFinite(Number(value.totalL)) ? Number(value.totalL) : 0)
    };
};

const downloadPngFromSvg = async (svgElement: SVGSVGElement, fileName: string) => {
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svgElement);

    if (!source.includes('xmlns="http://www.w3.org/2000/svg"')) {
        source = source.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = (error) => reject(error);
            img.src = svgUrl;
        });

        const viewBox = svgElement.viewBox.baseVal;
        const width = Math.max(800, Math.round(viewBox.width || svgElement.clientWidth || 1280));
        const height = Math.max(460, Math.round(viewBox.height || svgElement.clientHeight || 620));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext('2d');
        if (!context) throw new Error('No se pudo inicializar el contexto de canvas.');

        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);

        const pngUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = pngUrl;
        link.download = fileName;
        link.click();
    } finally {
        URL.revokeObjectURL(svgUrl);
    }
};

export const PopoutProfileWindow: React.FC = () => {
    const searchParams = React.useMemo(() => new URLSearchParams(window.location.search), []);
    const windowId = searchParams.get('windowId') || 'popout';

    const { chambers, pipes } = useProject();
    const svgRef = React.useRef<SVGSVGElement>(null);

    const [route, setRoute] = React.useState<RoutePathGravity | null>(null);
    const [routeLoaded, setRouteLoaded] = React.useState(false);
    const [errorMessage, setErrorMessage] = React.useState<string>('');
    const [showExportDialog, setShowExportDialog] = React.useState(false);

    React.useEffect(() => {
        let active = true;

        const applyPayload = (payload: { selection?: Record<string, unknown> | null } | null | undefined) => {
            if (!active) return;
            const nextRoute = parseRoute(payload?.selection?.route);
            setRoute(nextRoute);
            setRouteLoaded(true);
        };

        const fallbackTimer = window.setTimeout(() => {
            if (!active) return;
            setRouteLoaded(true);
        }, 1400);

        if (window.electronAPI?.getPopoutInit) {
            window.electronAPI.getPopoutInit(windowId)
                .then((payload) => {
                    if (!payload) return;
                    applyPayload(payload);
                    window.clearTimeout(fallbackTimer);
                })
                .catch(() => {
                    // best effort
                });
        }

        let unsub: (() => void) | undefined;
        if (window.electronAPI?.onPopoutInit) {
            unsub = window.electronAPI.onPopoutInit((payload) => {
                applyPayload(payload);
                window.clearTimeout(fallbackTimer);
            });
        }

        return () => {
            active = false;
            window.clearTimeout(fallbackTimer);
            if (typeof unsub === 'function') {
                unsub();
            }
        };
    }, [windowId]);

    const graph = React.useMemo(() => {
        return buildGraphFromPipes(chambers, pipes);
    }, [chambers, pipes]);

    const profileData = React.useMemo(() => {
        if (!route) return null;
        return buildProfileData(route, chambers, pipes);
    }, [route, chambers, pipes]);

    const routeText = React.useMemo(() => {
        if (!route) return '';
        return formatRouteText(route, graph.chamberById);
    }, [route, graph]);

    const handleCloseWindow = React.useCallback(() => {
        if (window.electronAPI?.closePopout) {
            window.electronAPI.closePopout(windowId).catch(() => window.close());
            return;
        }
        window.close();
    }, [windowId]);

    const handleExportPng = React.useCallback(async () => {
        if (!svgRef.current) {
            setErrorMessage('No se pudo exportar: vista SVG no disponible.');
            return;
        }

        try {
            await downloadPngFromSvg(svgRef.current, 'perfil-longitudinal-ruta.png');
            setErrorMessage('');
        } catch {
            setErrorMessage('No se pudo exportar PNG.');
        }
    }, []);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden', background: 'var(--surface)' }}>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--border)',
                    background: 'var(--surface-elevated)'
                }}
            >
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        Perfil Longitudinal - Ruta gravedad seleccionada
                    </div>
                    {routeText && (
                        <div style={{ marginTop: '2px', fontSize: '0.74rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {routeText}
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                        type="button"
                        onClick={() => setShowExportDialog(true)}
                        style={{
                            border: '1px solid rgba(59,130,246,0.45)',
                            borderRadius: '8px',
                            background: 'rgba(30,64,175,0.16)',
                            color: '#bfdbfe',
                            padding: '6px 10px',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                        }}
                    >
                        Exportar PDF / DXF
                    </button>

                    <button
                        type="button"
                        onClick={handleExportPng}
                        style={{
                            border: '1px solid rgba(59,130,246,0.45)',
                            borderRadius: '8px',
                            background: 'rgba(30,64,175,0.16)',
                            color: '#bfdbfe',
                            padding: '6px 10px',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                        }}
                    >
                        Exportar PNG
                    </button>

                    <button
                        type="button"
                        onClick={handleCloseWindow}
                        style={{
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            background: 'var(--surface)',
                            color: 'var(--text-primary)',
                            padding: '6px 10px',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                        }}
                    >
                        Cerrar
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, padding: '12px', overflow: 'auto' }}>
                {!route && routeLoaded && (
                    <div className="results-empty-state">No se recibio una ruta para mostrar el perfil.</div>
                )}
                {!routeLoaded && (
                    <div className="results-empty-state">Cargando ruta seleccionada...</div>
                )}
                {route && <RouteProfileView data={profileData} svgRef={svgRef} />}
            </div>

            {errorMessage && (
                <div style={{ padding: '0 12px 10px', color: '#fca5a5', fontSize: '0.77rem', fontWeight: 700 }}>
                    {errorMessage}
                </div>
            )}

            {showExportDialog && (
                <ExportProfileDialog
                    data={profileData}
                    svgElement={svgRef.current}
                    routeLabel={routeText}
                    onClose={() => setShowExportDialog(false)}
                />
            )}
        </div>
    );
};
