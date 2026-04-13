import React from 'react';
import * as XLSX from 'xlsx';
import { Check, Copy, FileSpreadsheet } from 'lucide-react';
import { Chamber, useProject } from '../../context/ProjectContext';
import { getUEHForFixtureByClass } from '../common/ArtifactCalculator';
import { ChamberFixtureLoad, NCH3371_TABLE_B1 } from '../../hydraulics/qwwTables';

interface FixtureSummaryRow {
    fixtureKey: string;
    fixtureName: string;
    usageClass: number;
    uehUnit: number;
    quantity: number;
    subtotalUEH: number;
}

interface ChamberFixtureSummaryBlock {
    chamberId: string;
    chamberName: string;
    rows: FixtureSummaryRow[];
    totalUEH: number;
}

const fmt2 = (value: number) => value.toLocaleString('es-CL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

const fixtureDisplayNameByKey = (fixtureKey: string) => {
    return (NCH3371_TABLE_B1 as Record<string, { name: string } | undefined>)[fixtureKey]?.name ?? fixtureKey;
};

const buildFixtureSummaryRows = (fixtureLoads: ChamberFixtureLoad[]): FixtureSummaryRow[] => {
    const grouped = new Map<string, FixtureSummaryRow>();

    fixtureLoads.forEach((fixtureLoad) => {
        const fixtureKey = String(fixtureLoad.fixtureKey || '').trim();
        const usageClass = Number(fixtureLoad.usageClass);
        const quantity = Number(fixtureLoad.quantity);

        if (!fixtureKey || !Number.isFinite(usageClass) || !Number.isFinite(quantity) || quantity <= 0) {
            return;
        }

        const groupKey = `${fixtureKey}__${usageClass}`;
        const current = grouped.get(groupKey);
        if (current) {
            const nextQuantity = current.quantity + quantity;
            grouped.set(groupKey, {
                ...current,
                quantity: nextQuantity,
                subtotalUEH: current.uehUnit * nextQuantity
            });
            return;
        }

        const uehUnit = getUEHForFixtureByClass(fixtureKey, usageClass);
        grouped.set(groupKey, {
            fixtureKey,
            fixtureName: fixtureDisplayNameByKey(fixtureKey),
            usageClass,
            uehUnit,
            quantity,
            subtotalUEH: uehUnit * quantity
        });
    });

    return Array.from(grouped.values()).sort((a, b) => {
        const fixtureCmp = a.fixtureName.localeCompare(b.fixtureName, 'es', { sensitivity: 'base' });
        if (fixtureCmp !== 0) return fixtureCmp;
        return a.usageClass - b.usageClass;
    });
};

export const buildFixtureSummaryFromChambers = (chambers: Chamber[], chamberIds: string[]): ChamberFixtureSummaryBlock[] => {
    const selectedIds = new Set(chamberIds);
    const selectedChambers = chambers.filter((chamber) => selectedIds.has(chamber.id));

    return selectedChambers.map((chamber) => {
        const rows = buildFixtureSummaryRows(chamber.fixtureLoads ?? []);
        const totalUEH = rows.reduce((sum, row) => sum + row.subtotalUEH, 0);

        return {
            chamberId: chamber.id,
            chamberName: chamber.userDefinedId || chamber.id,
            rows,
            totalUEH
        };
    });
};

const applyBold = (worksheet: XLSX.WorkSheet, cellAddress: string) => {
    const cell = worksheet[cellAddress] as (XLSX.CellObject & { s?: unknown }) | undefined;
    if (!cell) return;
    cell.s = { font: { bold: true } };
};

export const exportFixtureSummaryToExcel = (summaryData: ChamberFixtureSummaryBlock[]) => {
    const header = ['Cámara', 'Artefacto', 'Clase', 'UEH unitario', 'Cantidad', 'Subtotal UEH'];
    const aoa: Array<Array<string | number>> = [header];
    const boldRows = new Set<number>([0]);

    summaryData.forEach((block) => {
        block.rows.forEach((row) => {
            aoa.push([
                block.chamberName,
                row.fixtureName,
                row.usageClass,
                Number(row.uehUnit.toFixed(2)),
                Number(row.quantity.toFixed(2)),
                Number(row.subtotalUEH.toFixed(2))
            ]);
        });

        const subtotalRowIndex = aoa.length;
        aoa.push(['', '', '', '', `Subtotal ${block.chamberName}`, Number(block.totalUEH.toFixed(2))]);
        boldRows.add(subtotalRowIndex);
        aoa.push(['', '', '', '', '', '']);
    });

    if (aoa.length > 1) {
        const last = aoa[aoa.length - 1];
        if (last.every((value) => value === '')) {
            aoa.pop();
        }
    }

    const totalGeneral = summaryData.reduce((sum, block) => sum + block.totalUEH, 0);
    const totalGeneralRowIndex = aoa.length;
    aoa.push(['', '', '', '', 'TOTAL GENERAL', Number(totalGeneral.toFixed(2))]);
    boldRows.add(totalGeneralRowIndex);

    const worksheet = XLSX.utils.aoa_to_sheet(aoa);
    worksheet['!cols'] = [
        { wch: 20 },
        { wch: 34 },
        { wch: 11 },
        { wch: 14 },
        { wch: 10 },
        { wch: 16 }
    ];

    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:F1');
    for (let row = range.s.r; row <= range.e.r; row += 1) {
        const uehUnitCell = XLSX.utils.encode_cell({ r: row, c: 3 });
        const quantityCell = XLSX.utils.encode_cell({ r: row, c: 4 });
        const subtotalCell = XLSX.utils.encode_cell({ r: row, c: 5 });

        const uehUnitObj = worksheet[uehUnitCell];
        const quantityObj = worksheet[quantityCell];
        const subtotalObj = worksheet[subtotalCell];

        if (uehUnitObj && typeof uehUnitObj.v === 'number') uehUnitObj.z = '0.00';
        if (quantityObj && typeof quantityObj.v === 'number') quantityObj.z = '0.00';
        if (subtotalObj && typeof subtotalObj.v === 'number') subtotalObj.z = '0.00';
    }

    for (let col = 0; col < header.length; col += 1) {
        applyBold(worksheet, XLSX.utils.encode_cell({ r: 0, c: col }));
    }

    boldRows.forEach((rowIndex) => {
        applyBold(worksheet, XLSX.utils.encode_cell({ r: rowIndex, c: 4 }));
        applyBold(worksheet, XLSX.utils.encode_cell({ r: rowIndex, c: 5 }));
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Resumen Artefactos UEH');
    XLSX.writeFile(workbook, 'resumen_artefactos_ueh.xlsx');
};

export const copyFixtureSummary = (summaryData: ChamberFixtureSummaryBlock[]) => {
    const lines: string[] = [];

    summaryData.forEach((block) => {
        lines.push(`Cámara: ${block.chamberName}`);

        if (block.rows.length === 0) {
            lines.push('  - Sin artefactos registrados');
        } else {
            block.rows.forEach((row) => {
                lines.push(
                    `  - ${row.fixtureName} | Clase ${row.usageClass} | UEH ${fmt2(row.uehUnit)} | Cantidad ${fmt2(row.quantity)} | Subtotal ${fmt2(row.subtotalUEH)}`
                );
            });
        }

        lines.push(`  Subtotal UEH: ${fmt2(block.totalUEH)}`);
        lines.push('');
    });

    const totalGeneral = summaryData.reduce((sum, block) => sum + block.totalUEH, 0);
    lines.push(`TOTAL GENERAL UEH: ${fmt2(totalGeneral)}`);

    return lines.join('\n');
};

export const FixtureSummaryCard: React.FC = () => {
    const { chambers } = useProject();

    const [selectedChamberIdsForSummary, setSelectedChamberIdsForSummary] = React.useState<string[]>([]);
    const [appliedChamberIds, setAppliedChamberIds] = React.useState<string[]>([]);
    const [summaryData, setSummaryData] = React.useState<ChamberFixtureSummaryBlock[] | null>(null);
    const [copied, setCopied] = React.useState(false);

    React.useEffect(() => {
        const chamberIdSet = new Set(chambers.map(chamber => chamber.id));

        setSelectedChamberIdsForSummary((prev) => prev.filter((id) => chamberIdSet.has(id)));
        setAppliedChamberIds((prev) => prev.filter((id) => chamberIdSet.has(id)));
    }, [chambers]);

    const hasGeneratedSummary = summaryData !== null;

    React.useEffect(() => {
        if (!hasGeneratedSummary) return;
        setSummaryData(buildFixtureSummaryFromChambers(chambers, appliedChamberIds));
    }, [chambers, appliedChamberIds, hasGeneratedSummary]);

    const hasSelectionToApply = selectedChamberIdsForSummary.length > 0;
    const canExportAndCopy = hasGeneratedSummary && appliedChamberIds.length > 0;

    const totalGeneral = React.useMemo(() => {
        if (!summaryData) return 0;
        return summaryData.reduce((sum, block) => sum + block.totalUEH, 0);
    }, [summaryData]);

    const toggleChamberSelection = React.useCallback((chamberId: string) => {
        setSelectedChamberIdsForSummary((prev) => {
            if (prev.includes(chamberId)) {
                return prev.filter((id) => id !== chamberId);
            }
            return [...prev, chamberId];
        });
    }, []);

    const handleSelectAll = React.useCallback(() => {
        setSelectedChamberIdsForSummary(chambers.map((chamber) => chamber.id));
    }, [chambers]);

    const handleClearSelection = React.useCallback(() => {
        setSelectedChamberIdsForSummary([]);
    }, []);

    const handleApply = React.useCallback(() => {
        if (!hasSelectionToApply) return;
        setCopied(false);
        setAppliedChamberIds(selectedChamberIdsForSummary);
        setSummaryData(buildFixtureSummaryFromChambers(chambers, selectedChamberIdsForSummary));
    }, [chambers, hasSelectionToApply, selectedChamberIdsForSummary]);

    const handleExport = React.useCallback(() => {
        if (!canExportAndCopy || !summaryData) return;
        exportFixtureSummaryToExcel(summaryData);
    }, [canExportAndCopy, summaryData]);

    const handleCopySummary = React.useCallback(async () => {
        if (!canExportAndCopy || !summaryData) return;

        const text = copyFixtureSummary(summaryData);
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
        } catch {
            setCopied(false);
        }
    }, [canExportAndCopy, summaryData]);

    const selectedSignature = React.useMemo(
        () => [...selectedChamberIdsForSummary].sort().join('|'),
        [selectedChamberIdsForSummary]
    );

    const appliedSignature = React.useMemo(
        () => [...appliedChamberIds].sort().join('|'),
        [appliedChamberIds]
    );

    const hasPendingChanges = hasGeneratedSummary && selectedSignature !== appliedSignature;

    return (
        <div className="results-dock-card" style={{ marginTop: '12px' }}>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '10px',
                    flexWrap: 'wrap',
                    marginBottom: '10px'
                }}
            >
                <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)' }}>Resumen de artefactos por cámaras</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Seleccione cámaras, aplique y luego copie o exporte el resumen.</div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <button
                        onClick={handleApply}
                        disabled={!hasSelectionToApply}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '5px',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: '1px solid var(--accent)',
                            background: hasSelectionToApply ? 'var(--accent-soft)' : 'rgba(100, 116, 139, 0.08)',
                            color: hasSelectionToApply ? 'var(--accent)' : '#64748b',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: hasSelectionToApply ? 'pointer' : 'not-allowed',
                            opacity: hasSelectionToApply ? 1 : 0.6
                        }}
                    >
                        Aplicar
                    </button>

                    <button
                        onClick={handleCopySummary}
                        disabled={!canExportAndCopy}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: '1px solid var(--accent)',
                            background: canExportAndCopy ? 'var(--accent-soft)' : 'rgba(100, 116, 139, 0.08)',
                            color: canExportAndCopy ? 'var(--accent)' : '#64748b',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: canExportAndCopy ? 'pointer' : 'not-allowed',
                            opacity: canExportAndCopy ? 1 : 0.6
                        }}
                    >
                        {copied ? <Check size={13} /> : <Copy size={13} />}
                        {copied ? 'Copiado' : 'Copiar resumen'}
                    </button>

                    <button
                        onClick={handleExport}
                        disabled={!canExportAndCopy}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: '1px solid var(--success)',
                            background: canExportAndCopy ? 'var(--success-bg)' : 'rgba(100, 116, 139, 0.08)',
                            color: canExportAndCopy ? 'var(--success)' : '#64748b',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: canExportAndCopy ? 'pointer' : 'not-allowed',
                            opacity: canExportAndCopy ? 1 : 0.6
                        }}
                    >
                        <FileSpreadsheet size={13} />
                        Exportar a Excel
                    </button>
                </div>
            </div>

            {chambers.length === 0 ? (
                <div className="results-empty-state">No hay cámaras disponibles en el proyecto.</div>
            ) : (
                <>
                    <div
                        style={{
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            padding: '8px',
                            background: 'var(--surface-elevated)',
                            marginBottom: '10px'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                Cámaras seleccionadas: {selectedChamberIdsForSummary.length} de {chambers.length}
                            </span>

                            <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                    onClick={handleSelectAll}
                                    style={{
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--surface)',
                                        color: 'var(--text-main)',
                                        borderRadius: '6px',
                                        fontSize: '0.7rem',
                                        fontWeight: 600,
                                        padding: '4px 8px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Seleccionar todas
                                </button>
                                <button
                                    onClick={handleClearSelection}
                                    style={{
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--surface)',
                                        color: 'var(--text-main)',
                                        borderRadius: '6px',
                                        fontSize: '0.7rem',
                                        fontWeight: 600,
                                        padding: '4px 8px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Limpiar
                                </button>
                            </div>
                        </div>

                        <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'grid', gap: '6px' }}>
                            {chambers.map((chamber) => {
                                const isSelected = selectedChamberIdsForSummary.includes(chamber.id);
                                const fixtureCount = chamber.fixtureLoads?.length ?? 0;
                                return (
                                    <label
                                        key={chamber.id}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '10px',
                                            fontSize: '0.75rem',
                                            color: 'var(--text-main)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '6px',
                                            padding: '6px 8px',
                                            background: isSelected ? 'var(--accent-soft)' : 'transparent'
                                        }}
                                    >
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => toggleChamberSelection(chamber.id)}
                                            />
                                            {chamber.userDefinedId || chamber.id}
                                        </span>
                                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{fixtureCount} artefactos</span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>

                    {!hasGeneratedSummary ? (
                        <div className="results-empty-state">
                            Seleccione una o más cámaras y presione Aplicar para generar el resumen.
                        </div>
                    ) : (
                        <>
                            {hasPendingChanges && (
                                <div className="results-empty-state" style={{ marginBottom: '10px' }}>
                                    Hay cambios en la selección que todavía no se aplican. Presione Aplicar para actualizar el resumen.
                                </div>
                            )}

                            {summaryData.length === 0 ? (
                                <div className="results-empty-state">No hay cámaras aplicadas para mostrar.</div>
                            ) : (
                                <>
                                    {summaryData.map((block) => (
                                        <div
                                            key={block.chamberId}
                                            style={{
                                                marginBottom: '10px',
                                                borderRadius: '8px',
                                                border: '1px solid var(--border-color)',
                                                overflow: 'hidden'
                                            }}
                                        >
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    padding: '8px 10px',
                                                    background: 'var(--accent-soft)',
                                                    borderBottom: '1px solid var(--accent)'
                                                }}
                                            >
                                                <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-main)' }}>{block.chamberName}</span>
                                                <span style={{ fontSize: '0.72rem', color: 'var(--text-main)' }}>Subtotal UEH: {fmt2(block.totalUEH)}</span>
                                            </div>

                                            <div style={{ overflowX: 'auto' }}>
                                                <table className="table-pro compact zebra hover">
                                                    <thead>
                                                        <tr>
                                                            <th>Cámara</th>
                                                            <th>Artefacto</th>
                                                            <th className="center">Clase</th>
                                                            <th className="numeric">UEH unitario</th>
                                                            <th className="numeric">Cantidad</th>
                                                            <th className="numeric">Subtotal UEH</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {block.rows.length === 0 ? (
                                                            <tr>
                                                                <td colSpan={6} style={{ fontStyle: 'italic' }}>
                                                                    Sin artefactos registrados en esta cámara.
                                                                </td>
                                                            </tr>
                                                        ) : (
                                                            block.rows.map((row, index) => (
                                                                <tr key={`${row.fixtureKey}-${row.usageClass}-${index}`}>
                                                                    <td>{block.chamberName}</td>
                                                                    <td>{row.fixtureName}</td>
                                                                    <td className="center">{row.usageClass}</td>
                                                                    <td className="numeric">{fmt2(row.uehUnit)}</td>
                                                                    <td className="numeric">{fmt2(row.quantity)}</td>
                                                                    <td className="numeric" style={{ fontWeight: 700 }}>{fmt2(row.subtotalUEH)}</td>
                                                                </tr>
                                                            ))
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    ))}

                                    <div
                                        style={{
                                            marginTop: '8px',
                                            padding: '10px',
                                            borderRadius: '8px',
                                            background: 'var(--success-bg)',
                                            border: '1px solid var(--success-border)',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}
                                    >
                                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#10b981' }}>TOTAL GENERAL UEH</span>
                                        <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#10b981' }}>{fmt2(totalGeneral)}</span>
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    );
};
