import React from 'react';
import type { GravityRouteProfileData } from '../hydraulics/routeEngineGravity';
import { exportProfileToPDF, exportProfileToDXF } from '../utils/exportProfilePDF';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ExportProfileDialogProps {
    /** Datos del perfil a exportar. */
    data: GravityRouteProfileData | null;
    /** Referencia al SVG vivo (para captura PNG → PDF). Puede ser null. */
    svgElement: SVGSVGElement | null;
    /** Texto descriptivo de la ruta, p. ej. "C1 -> C2 -> C3". */
    routeLabel?: string;
    /** Callback para cerrar el modal. */
    onClose: () => void;
}

// ---------------------------------------------------------------------------
// Estilos reutilizables (CSS variables del tema)
// ---------------------------------------------------------------------------

const DIALOG_STYLE: React.CSSProperties = {
    background: 'var(--surface-elevated)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '22px 24px',
    width: '400px',
    maxWidth: '95vw',
    boxShadow: 'var(--shadow-elevated)',
};

const LABEL_STYLE: React.CSSProperties = {
    display: 'block',
    fontSize: '0.76rem',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: '4px',
};

const INPUT_STYLE: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '7px 10px',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text-primary)',
    fontSize: '0.82rem',
    outline: 'none',
};

const BTN_CANCEL_STYLE: React.CSSProperties = {
    padding: '8px 16px',
    borderRadius: '7px',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text-primary)',
    fontSize: '0.82rem',
    fontWeight: 600,
    cursor: 'pointer',
};

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export const ExportProfileDialog: React.FC<ExportProfileDialogProps> = ({
    data,
    svgElement,
    routeLabel = '',
    onClose,
}) => {
    const [format,         setFormat]         = React.useState<'pdf' | 'dxf'>('pdf');
    const [projectName,    setProjectName]    = React.useState('');
    const [includeDiagram, setIncludeDiagram] = React.useState(true);
    const [includeTable,   setIncludeTable]   = React.useState(true);
    const [isExporting,    setIsExporting]    = React.useState(false);
    const [error,          setError]          = React.useState('');

    const handleExport = async () => {
        if (!data) return;
        setIsExporting(true);
        setError('');
        try {
            const opts = { projectName, routeLabel, includeDiagram, includeTable };
            if (format === 'pdf') {
                await exportProfileToPDF(data, svgElement, opts);
            } else {
                exportProfileToDXF(data, opts);
            }
            onClose();
        } catch {
            setError('Error al exportar. Verifique los datos e intente nuevamente.');
        } finally {
            setIsExporting(false);
        }
    };

    // Cerrar al hacer click en el backdrop
    const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) onClose();
    };

    const formatBtnStyle = (active: boolean): React.CSSProperties => ({
        flex: 1,
        padding: '8px 0',
        borderRadius: '7px',
        border: active ? '2px solid var(--accent)' : '1px solid var(--border)',
        background: active ? 'rgba(59,130,246,0.15)' : 'var(--surface)',
        color: active ? '#bfdbfe' : 'var(--text-secondary)',
        fontWeight: active ? 700 : 500,
        fontSize: '0.83rem',
        cursor: 'pointer',
        transition: 'border 0.12s, background 0.12s, color 0.12s',
    });

    const exportBtnStyle: React.CSSProperties = {
        padding: '8px 20px',
        borderRadius: '7px',
        border: '1px solid rgba(59,130,246,0.5)',
        background: isExporting ? 'rgba(30,64,175,0.08)' : 'rgba(30,64,175,0.22)',
        color: '#bfdbfe',
        fontSize: '0.83rem',
        fontWeight: 700,
        cursor: isExporting || !data ? 'not-allowed' : 'pointer',
        opacity: isExporting || !data ? 0.6 : 1,
    };

    return (
        <div
            onClick={handleBackdrop}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.55)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999,
            }}
        >
            <div style={DIALOG_STYLE}>

                {/* ── Cabecera ─────────────────────────────────────────────── */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        Exportar Perfil Longitudinal
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Cerrar"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '1rem', padding: '2px 6px', lineHeight: 1 }}
                    >
                        ✕
                    </button>
                </div>

                {/* ── Ruta (informativa) ───────────────────────────────────── */}
                {routeLabel && (
                    <div style={{
                        fontSize: '0.74rem',
                        color: 'var(--text-secondary)',
                        marginBottom: '16px',
                        padding: '6px 10px',
                        background: 'var(--surface)',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}>
                        Ruta: {routeLabel}
                    </div>
                )}

                {/* ── Selector de formato ──────────────────────────────────── */}
                <div style={{ marginBottom: '16px' }}>
                    <span style={LABEL_STYLE}>Formato de exportación</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button type="button" style={formatBtnStyle(format === 'pdf')} onClick={() => setFormat('pdf')}>
                            PDF
                        </button>
                        <button type="button" style={formatBtnStyle(format === 'dxf')} onClick={() => setFormat('dxf')}>
                            DXF (AutoCAD)
                        </button>
                    </div>
                </div>

                {/* ── Nombre del proyecto ──────────────────────────────────── */}
                <div style={{ marginBottom: '14px' }}>
                    <label style={LABEL_STYLE}>Nombre del proyecto (opcional)</label>
                    <input
                        type="text"
                        value={projectName}
                        onChange={e => setProjectName(e.target.value)}
                        placeholder="Ej: Urbanización Norte"
                        style={INPUT_STYLE}
                    />
                </div>

                {/* ── Opciones PDF ─────────────────────────────────────────── */}
                {format === 'pdf' && (
                    <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                            <input
                                type="checkbox"
                                checked={includeDiagram}
                                onChange={e => setIncludeDiagram(e.target.checked)}
                                style={{ width: '14px', height: '14px', accentColor: 'var(--accent)' }}
                            />
                            Incluir diagrama del perfil (imagen vectorial)
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                            <input
                                type="checkbox"
                                checked={includeTable}
                                onChange={e => setIncludeTable(e.target.checked)}
                                style={{ width: '14px', height: '14px', accentColor: 'var(--accent)' }}
                            />
                            Incluir tablas de datos (cámaras y tramos)
                        </label>
                        {!svgElement && includeDiagram && (
                            <div style={{ fontSize: '0.73rem', color: '#fca5a5', paddingLeft: '22px' }}>
                                Vista SVG no disponible — el diagrama se omitirá.
                            </div>
                        )}
                    </div>
                )}

                {/* ── Nota DXF ─────────────────────────────────────────────── */}
                {format === 'dxf' && (
                    <div style={{
                        marginBottom: '16px',
                        padding: '9px 11px',
                        background: 'rgba(59,130,246,0.07)',
                        borderRadius: '7px',
                        border: '1px solid rgba(59,130,246,0.2)',
                        fontSize: '0.74rem',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.5,
                    }}>
                        <strong style={{ color: 'var(--text-primary)' }}>Capas incluidas:</strong> TERRAIN (cotas de tapa),
                        PIPE_INV (radier de tuberías), GRID (referencias verticales),
                        LABELS (cotas y cámaras), NOTES (L, DN, pendiente).<br />
                        Formato R12 · Coordenadas en metros reales (X = chainage, Y = cota).
                    </div>
                )}

                {/* ── Error ────────────────────────────────────────────────── */}
                {error && (
                    <div style={{ marginBottom: '12px', fontSize: '0.77rem', color: '#fca5a5', fontWeight: 600 }}>
                        {error}
                    </div>
                )}

                {/* ── Acciones ─────────────────────────────────────────────── */}
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button type="button" style={BTN_CANCEL_STYLE} onClick={onClose}>
                        Cancelar
                    </button>
                    <button
                        type="button"
                        style={exportBtnStyle}
                        onClick={handleExport}
                        disabled={isExporting || !data}
                    >
                        {isExporting ? 'Exportando…' : `Exportar ${format.toUpperCase()}`}
                    </button>
                </div>

            </div>
        </div>
    );
};
