import React from 'react';
import { BlockMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import { DataTable, DataTableColumn } from './common/DataTable';
import { StatusBadge, StatusType } from './common/StatusBadge';
import { useProject } from '../context/ProjectContext';
import { getEffectivePipe } from '../utils/getEffectivePipe';
import { computeDomesticVerification } from '../domain/gravity/domesticEngine';
import { DomesticResult, DomesticSegmentInput, DomesticRole } from '../domain/gravity/domesticTypes';
import { CheckCircle2, XCircle, Info, FileText, X, ShieldCheck, Home, FileSpreadsheet } from 'lucide-react';
import { getManningAndDiMm } from '../hydraulics/hydraulicCalculationEngine';
import { resolveHydraulicDiMm } from '../utils/diameterMapper';
import { buildDatedExcelFileName, exportSingleSheetToExcel } from '../utils/excelExport';

const fmt = (val: number | undefined, dec = 2) => {
    if (val === undefined || val === null || !Number.isFinite(val)) return '—';
    return val.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
};

const CheckIcon: React.FC<{ ok: boolean | null | undefined }> = ({ ok }) => {
    if (ok === null || ok === undefined) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
    return ok ? <CheckCircle2 size={16} color="var(--success)" /> : <XCircle size={16} color="var(--danger)" />;
};

function mapEffectiveToDomesticRole(effectiveRole: string): DomesticRole {
    const r = effectiveRole.toUpperCase();
    if (r === 'DESCARGA_HORIZ' || r === 'RAMAL_CONEXION' || r === 'CAÑERIA' || r === 'CANERIA') return 'RAMAL_PRINCIPAL';
    if (r === 'INTERIOR_RAMAL' || r === 'RAMAL_INTERIOR' || r === 'NACIENTE') return 'RAMAL';
    if (r === 'LATERAL' || r === 'COLECTOR') return 'LATERAL';
    return 'OTRO';
}

// --- MODAL TRAZABILIDAD ---
interface TraceModalProps {
    result: DomesticResult;
    onClose: () => void;
}

const DomesticTraceModal: React.FC<TraceModalProps> = ({ result, onClose }) => {
    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <div className="modal-header">
                    <h3>Trazabilidad NCh3371: {result.id} ({result.tramoLabel})</h3>
                    <button onClick={onClose} className="btn-close"><X size={20} /></button>
                </div>
                <div className="modal-body">
                    <section className="trace-section">
                        <h4>1. Capacidad UEH (Tabla A.3)</h4>
                        <div className="lookup-grid">
                            <div className="lookup-item">
                                <span className="label">DN Original:</span>
                                <span className="value">{result.DN_mm} mm</span>
                            </div>
                            <div className="lookup-item">
                                <span className="label">DN Usado (lookup):</span>
                                <span className="value">{result.trace.DN_used_mm} mm</span>
                            </div>
                            <div className="lookup-item">
                                <span className="label">I eval:</span>
                                <span className="value">{result.I_eval_pct.toFixed(2)} %</span>
                            </div>
                            <div className="lookup-item">
                                <span className="label">I tabulada:</span>
                                <span className="value">{result.trace.I_used_pct} %</span>
                            </div>
                        </div>

                        <p className="mt-12"><strong>Criterio:</strong> {result.trace.uehRule}</p>

                        <div className="math-box">
                            <BlockMath math={`UEH_{acum} = ${result.ueh_acum.toFixed(0)} \\leq UEH_{max} = ${result.ueh_max_a3 !== null ? result.ueh_max_a3.toFixed(0) : 'N/A'}`} />
                        </div>
                    </section>

                    <section className="trace-section">
                        <h4>2. Reglas Geométricas</h4>
                        <div className="rules-grid">
                            <div className="rule-card">
                                <h5>Pendiente Mínima</h5>
                                <BlockMath math={`I_{eval} = ${result.I_eval_pct.toFixed(2)}\\% \\geq I_{min} = ${result.I_min_pct.toFixed(2)}\\%`} />
                                <span className={`rule-status ${result.checks.I ? 'ok' : 'error'}`}>
                                    {result.checks.I ? 'CUMPLE' : 'NO CUMPLE'}
                                </span>
                            </div>
                            <div className="rule-card">
                                <h5>Longitud Máxima</h5>
                                <BlockMath math={`L = ${result.L_m.toFixed(2)}m \\leq L_{max} = ${result.L_max_m}m`} />
                                <span className={`rule-status ${result.checks.L ? 'ok' : 'error'}`}>
                                    {result.checks.L ? 'CUMPLE' : 'NO CUMPLE'}
                                </span>
                            </div>
                        </div>
                    </section>

                    <section className="trace-section">
                        <h4>Notas Adicionales</h4>
                        <ul className="trace-notes">
                            {result.trace.notes?.map((n, i) => <li key={i}>{n}</li>)}
                            <li>Referencia: NCh3371:2017 - RIDAA (Anexo A).</li>
                        </ul>
                    </section>
                </div>
                <div className="modal-footer">
                    <button onClick={onClose} className="btn-primary">Cerrar</button>
                </div>
            </div>
            <style>{`
                .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 2000; backdrop-filter: blur(4px); }
                .modal-content { background: var(--surface); width: 650px; max-width: 90%; border-radius: var(--radius-lg); border: 1px solid var(--border); box-shadow: var(--shadow-xl); max-height: 85vh; display: flex; flex-direction: column; }
                .modal-header { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; background: var(--surface-alt); }
                .modal-header h3 { margin: 0; font-size: 1.1rem; color: var(--accent); }
                .modal-body { padding: 24px; overflow-y: auto; color: var(--text-primary); }
                .modal-footer { padding: 16px 20px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; }
                .trace-section { margin-bottom: 32px; }
                .trace-section h4 { margin: 0 0 16px; font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-secondary); border-left: 3px solid var(--accent); padding-left: 10px; }
                .math-box { background: var(--surface-alt); padding: 16px; border-radius: var(--radius-md); border: 1px solid var(--border-soft); margin: 8px 0; }
                .lookup-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 12px; }
                .lookup-item { display: flex; flex-direction: column; gap: 4px; padding: 10px; background: var(--surface-alt); border-radius: 8px; border: 1px solid var(--border-soft); }
                .lookup-item .label { font-size: 11px; color: var(--text-muted); font-weight: 500; text-transform: uppercase; }
                .lookup-item .value { font-size: 14px; color: var(--accent); font-weight: 700; }
                .mt-12 { margin-top: 12px; }
                .rules-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 12px; }
                .rule-card { background: var(--surface-alt); padding: 16px; border-radius: var(--radius-md); border: 1px solid var(--border-soft); position: relative; }
                .rule-card h5 { margin: 0 0 12px; font-size: 0.85rem; color: var(--text-secondary); text-align: center; }
                .rule-status { position: absolute; top: 12px; right: 12px; font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 4px; }
                .rule-status.ok { color: var(--success); background: rgba(var(--success-rgb), 0.1); }
                .rule-status.error { color: var(--danger); background: rgba(var(--danger-rgb), 0.1); }
                .trace-notes { font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5; }
                .btn-close { background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; transition: color 0.2s; }
                .btn-close:hover { color: var(--danger); }
                .btn-primary { background: var(--accent); color: white; border: none; padding: 10px 24px; border-radius: var(--radius-md); font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(var(--accent-rgb), 0.3); }
                .btn-primary:hover { filter: brightness(1.1); transform: translateY(-1px); }
            `}</style>
        </div>
    );
};

export const NCh3371VerificationTable: React.FC = () => {
    const { chambers, pipes, settings } = useProject();
    const [selectedResult, setSelectedResult] = React.useState<DomesticResult | null>(null);

    const isNCh3371 = React.useCallback((p: any) => {
        return getEffectivePipe(p).regime === 'NCH3371';
    }, []);

    const pipes3371 = React.useMemo(() => pipes.filter(isNCh3371), [pipes, isNCh3371]);

    const results = React.useMemo(() => {
        if (!pipes3371 || pipes3371.length === 0) return [];

        const inputs: DomesticSegmentInput[] = pipes3371.map(p => {
            const up = chambers.find(c => c.id === p.startNodeId);
            const dw = chambers.find(c => c.id === p.endNodeId);
            const eff = getEffectivePipe(p);
            const role = mapEffectiveToDomesticRole(eff.role);
            const slope_pct = p.isSlopeManual && p.manualSlope
                ? Number(p.manualSlope.value)
                : Number(p.slope?.value || 0);

            const material = String(p.material?.value || 'PVC');
            const { di_mm: diTable } = getManningAndDiMm(material, Number(p.diameter?.value || 110), p.sdr?.value ? String(p.sdr.value) : undefined);
            const di_mm = resolveHydraulicDiMm(p, diTable);

            return {
                id: p.userDefinedId || p.id,
                cIni: up?.userDefinedId || '?',
                cFin: dw?.userDefinedId || '?',
                role,
                L_m: Number(p.length?.value || 0),
                DN_mm: Number(p.diameter?.value || 110),
                Dint_mm: di_mm,
                slope_pct,
                ueh_acum: Number(p.hydraulics?.inputs?.UEH_upstream || p.uehTransportadas?.value || 0)
            };
        });

        return computeDomesticVerification(inputs);
    }, [pipes3371, chambers]);

    const isEmpty3371 = pipes3371.length === 0;
    const isPublico = settings.projectType === 'Público';

    const columns: DataTableColumn<DomesticResult>[] = [
        { key: 'id', header: 'ID_TRAMO', width: 100, align: 'left', sticky: 'left' },
        { key: 'tramoLabel', header: 'C_INI-C_FIN', width: 120, align: 'left' },
        {
            key: 'role',
            header: 'ROL',
            width: 130,
            align: 'left',
            format: v => String(v).replace('_', ' '),
            exportValue: r => String(r.role).replace(/_/g, ' ')
        },
        { key: 'L_m', header: 'L (m)', width: 70, align: 'right', format: v => fmt(v as number, 2) },
        { key: 'DN_mm', header: 'DN (mm)', width: 70, align: 'right' },
        { key: 'Dint_mm', header: 'D_INT (mm)', width: 85, align: 'right', format: v => fmt(v as number, 1) },
        { key: 'I_eval_pct', header: 'I_EVAL (%)', width: 85, align: 'right', format: v => fmt(v as number, 2) },
        { key: 'I_min_pct', header: 'I_MIN (%)', width: 80, align: 'right', format: v => fmt(v as number, 1) },
        {
            key: 'checks',
            header: 'CHECK I',
            width: 75,
            align: 'center',
            format: v => <CheckIcon ok={(v as any).I} />,
            exportValue: r => r.checks.I
        },
        { key: 'L_max_m', header: 'L_MAX (m)', width: 80, align: 'right' },
        {
            key: 'checks',
            header: 'CHECK L',
            width: 75,
            align: 'center',
            format: v => <CheckIcon ok={(v as any).L} />,
            exportValue: r => r.checks.L
        },
        { key: 'DN_min_mm', header: 'DN_MIN (mm)', width: 90, align: 'right', format: v => v ? v : '—' },
        {
            key: 'checks',
            header: 'CHECK DN',
            width: 85,
            align: 'center',
            format: v => <CheckIcon ok={(v as any).DN} />,
            exportValue: r => r.checks.DN
        },
        { key: 'ueh_acum', header: 'UEH_ACUM', width: 90, align: 'right', format: v => (v as number).toFixed(0) },
        { key: 'ueh_max_a3', header: 'UEH_MAX_A3', width: 100, align: 'right', format: v => v !== null ? (v as number).toFixed(0) : '—' },
        {
            key: 'checks',
            header: 'CHECK UEH',
            width: 95,
            align: 'center',
            format: v => <CheckIcon ok={(v as any).UEH} />,
            exportValue: r => r.checks.UEH
        },
        {
            key: 'status', header: 'ESTADO', width: 120, align: 'center', sticky: 'right',
            format: (v, r) => {
                const tooltip = r.missing && r.missing.length > 0 ? `Falta: ${r.missing.join(', ')}` : undefined;
                return <span title={tooltip}><StatusBadge status={v as StatusType} /></span>;
            },
            exportValue: r => r.status
        },
        {
            key: 'id', header: 'TRACE', width: 70, align: 'center',
            format: (_, r) => (
                <button className="btn-icon" onClick={() => setSelectedResult(r)} title="Ver Trazabilidad">
                    <FileText size={16} />
                </button>
            )
        }
    ];

    const handleExportExcel = React.useCallback(() => {
        if (results.length === 0) return;

        exportSingleSheetToExcel({
            fileName: buildDatedExcelFileName('nch3371_verificacion'),
            sheetName: 'NCh3371',
            title: 'Verificación NCh3371',
            subtitle: 'Criterios RIDAA - Anexo A (Tabla A.3)',
            columns,
            rows: results,
            includeColumn: (column) => column.header !== 'TRACE'
        });
    }, [columns, results]);

    return (
        <div className="nch3371-container">
            {isPublico ? (
                <div className="results-empty-state" style={{ padding: '80px 20px' }}>
                    <ShieldCheck size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
                    <p>El Proyecto es de tipo <strong>PÚBLICO</strong>.<br />
                        La verificación normativa se realiza mediante NCh1105.</p>
                </div>
            ) : isEmpty3371 ? (
                <div className="results-empty-state" style={{ padding: '80px 20px' }}>
                    <Home size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
                    <p>No existen tramos domiciliarios (NCh3371) para verificación.</p>
                </div>
            ) : (
                <>
                    <div className="header-pro-main">
                        <div className="title-group">
                            <Home className="icon-main" />
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <h2>VERIFICACIÓN NCh3371</h2>
                                    <span className="norma-badge domestic">Instalación Domiciliaria</span>
                                </div>
                                <p>Criterios RIDAA - Anexo A (Capacidad de Tuberías Horizontales)</p>
                            </div>
                        </div>
                    </div>

                    <section className="gravity-section">
                        <DataTable
                            title="Cumplimiento RIDAA (Anexo A - Tabla A.3)"
                            columns={columns}
                            rows={results}
                            rowKey={r => r.id}
                            density="compact"
                            maxHeight="600px"
                            headerActions={
                                <button
                                    className="btn-export-excel"
                                    onClick={handleExportExcel}
                                    disabled={results.length === 0}
                                    title="Exportar Excel"
                                >
                                    <FileSpreadsheet size={14} />
                                    <span>Exportar Excel</span>
                                </button>
                            }
                        />
                    </section>

                    {selectedResult && (
                        <DomesticTraceModal
                            result={selectedResult}
                            onClose={() => setSelectedResult(null)}
                        />
                    )}

                    <div className="footer-info mt-32">
                        <Info size={16} />
                        <p>
                            <strong>Nota:</strong> I_MIN basada en DN (1.0% para DN {'>'}= 100, 1.5% para DN {'<'}= 100). Capacidad UEH según Tabla A.3 (RIDAA). L_MAX según D_INT.
                        </p>
                    </div>
                </>
            )}

            <style>{`
                .nch3371-container { padding: 24px; color: var(--text-primary); }
                .results-empty-state { text-align: center; color: var(--text-secondary); background: var(--surface-alt); border-radius: var(--radius-lg); border: 1px dashed var(--border); margin: 20px 0; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; }
                .results-empty-state p { font-size: 1.1rem; max-width: 400px; line-height: 1.5; margin-top: 16px; }
                .header-pro-main { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; border-bottom: 2px solid var(--success); padding-bottom: 16px; }
                .header-pro-main h2 { margin: 0; font-size: 1.4rem; font-weight: 800; color: var(--success); }
                .header-pro-main p { margin: 4px 0 0; color: var(--text-secondary); font-size: 0.9rem; }
                .title-group { display: flex; align-items: center; gap: 16px; }
                .icon-main { color: var(--success); width: 28px; height: 28px; }
                .norma-badge.domestic { background: var(--success); color: white; font-size: 10px; padding: 2px 8px; border-radius: 4px; font-weight: 600; text-transform: uppercase; margin-left: 8px; }

                .gravity-section { background: rgba(var(--surface-rgb), 0.5); border-radius: var(--radius-lg); padding: 24px; border: 1px solid var(--border); margin-bottom: 32px; box-shadow: var(--shadow-sm); }
                
                .btn-icon { background: var(--surface-alt); border: 1px solid var(--border-soft); color: var(--success); padding: 5px; border-radius: var(--radius-sm); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
                .btn-icon:hover { background: rgba(var(--success-rgb), 0.1); border-color: var(--success); transform: scale(1.05); }

                .btn-export-excel { display: inline-flex; align-items: center; gap: 6px; border: 1px solid rgba(16, 185, 129, 0.35); background: rgba(16, 185, 129, 0.12); color: #059669; border-radius: 6px; font-size: 0.78rem; font-weight: 600; padding: 6px 10px; cursor: pointer; transition: all 0.2s; }
                .btn-export-excel:hover:not(:disabled) { background: rgba(16, 185, 129, 0.2); border-color: rgba(16, 185, 129, 0.55); }
                .btn-export-excel:disabled { opacity: 0.45; cursor: not-allowed; }

                .footer-info { display: flex; align-items: center; gap: 12px; padding: 14px 22px; background: rgba(var(--success-rgb), 0.05); border-radius: var(--radius-md); color: var(--success); font-size: 0.9rem; border: 1px solid rgba(var(--success-rgb), 0.2); }
                .mt-32 { margin-top: 32px; }
            `}</style>
        </div>
    );
};

