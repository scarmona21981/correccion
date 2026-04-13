import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FilaUnificada } from '../components/RolNormativoTableView';
import { RolNormativo } from '../hydraulics/test';

export interface TechnicalReportParams {
    projectName: string;
    projectDate: string;
    engineerName: string;
    company: string;
    sanitarySystemType: string;
}

export interface ReportData {
    filas: FilaUnificada[];
    params: TechnicalReportParams;
    traceMode: boolean;
    resumen: {
        totalTramos: number;
        tramosCumplen: number;
        tramosNoCumplen: number;
    };
}

const COLORS = {
    primary: [30, 58, 95] as [number, number, number],
    secondary: [59, 130, 246] as [number, number, number],
    success: [34, 197, 94] as [number, number, number],
    danger: [239, 68, 68] as [number, number, number],
    warning: [245, 158, 11] as [number, number, number],
    text: [51, 65, 85] as [number, number, number],
    lightGray: [241, 245, 249] as [number, number, number],
    darkGray: [71, 85, 105] as [number, number, number],
};

const ROL_LABELS: Record<RolNormativo, string> = {
    [RolNormativo.INTERIOR_RAMAL]: 'Interior / Ramal',
    [RolNormativo.DESCARGA_HORIZ]: 'Descarga Horizontal',
    [RolNormativo.COLECTOR_EXTERIOR]: 'Colector Exterior',
};

function addHeader(doc: jsPDF, title: string, pageNumber: number): number {
    const pageWidth = doc.internal.pageSize.getWidth();
    
    doc.setFillColor(...COLORS.primary);
    doc.rect(0, 0, pageWidth, 25, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 14, 16);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Pagina ${pageNumber}`, pageWidth - 14, 16, { align: 'right' });
    
    return 35;
}

function addFooter(doc: jsPDF): void {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    doc.setFillColor(...COLORS.lightGray);
    doc.rect(0, pageHeight - 15, pageWidth, 15, 'F');
    
    doc.setTextColor(...COLORS.darkGray);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('SMCALC ALC - Memoria de Cálculo Normativo - NCh3371:2017 / NCh1105:2019', pageWidth / 2, pageHeight - 6, { align: 'center' });
}

function addCoverPage(doc: jsPDF, params: TechnicalReportParams): void {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    doc.setFillColor(...COLORS.primary);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(32);
    doc.setFont('helvetica', 'bold');
    doc.text('MEMORIA DE CÁLCULO', pageWidth / 2, pageHeight * 0.3, { align: 'center' });
    
    doc.setFontSize(24);
    doc.text('SISTEMA DE ALCANTARILLADO', pageWidth / 2, pageHeight * 0.38, { align: 'center' });
    
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.5);
    doc.line(pageWidth * 0.2, pageHeight * 0.44, pageWidth * 0.8, pageHeight * 0.44);
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    
    const projectLabel = params.projectName || 'Proyecto sin nombre';
    doc.text(`Proyecto: ${projectLabel}`, pageWidth / 2, pageHeight * 0.52, { align: 'center' });
    
    doc.setFontSize(11);
    doc.text(`Tipo de sistema: ${params.sanitarySystemType || 'No especificado'}`, pageWidth / 2, pageHeight * 0.58, { align: 'center' });
    doc.text(`Fecha: ${params.projectDate || new Date().toLocaleDateString()}`, pageWidth / 2, pageHeight * 0.63, { align: 'center' });
    
    if (params.engineerName) {
        doc.text(`Ingeniero: ${params.engineerName}`, pageWidth / 2, pageHeight * 0.68, { align: 'center' });
    }
    
    if (params.company) {
        doc.text(`Empresa: ${params.company}`, pageWidth / 2, pageHeight * 0.73, { align: 'center' });
    }
    
    doc.setFontSize(10);
    doc.text('Conforme a:', pageWidth / 2, pageHeight * 0.82, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text('NCh3371:2017 - Instalaciones sanitarias', pageWidth / 2, pageHeight * 0.86, { align: 'center' });
    doc.text('NCh1105:2019 - Alcantarillado', pageWidth / 2, pageHeight * 0.90, { align: 'center' });
    
    addFooter(doc);
}

function addDescriptiveMemory(doc: jsPDF, data: ReportData, pageNumber: number): number {
    let y = addHeader(doc, '1. MEMORIA DESCRIPTIVA', pageNumber);
    
    doc.setTextColor(...COLORS.text);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    
    const introText = `La presente memoria de cálculo describe la verificacion normativa del sistema de alcantarillado del proyecto ${data.params.projectName || 'sin nombre'}, conforme a las normas chilenas NCh3371:2017 (Instalaciones sanitarias) y NCh1105:2019 (Alcantarillado).`;
    
    const lines = doc.splitTextToSize(introText, 180);
    doc.text(lines, 14, y);
    y += lines.length * 5 + 10;
    
    doc.setFont('helvetica', 'bold');
    doc.text('Alcance', 14, y);
    y += 6;
    
    doc.setFont('helvetica', 'normal');
    const alcanceText = `Se han analizado ${data.resumen.totalTramos} tramos de tuberia clasificados por rol normativo: Interior/Ramal (NCh3371 Anexo A - RIDAA), Descarga Horizontal (NCh3371 Anexo B.2.5) y Colector Exterior (NCh1105).`;
    const alcanceLines = doc.splitTextToSize(alcanceText, 180);
    doc.text(alcanceLines, 14, y);
    y += alcanceLines.length * 5 + 10;
    
    doc.setFont('helvetica', 'bold');
    doc.text('Métodología', 14, y);
    y += 6;
    
    doc.setFont('helvetica', 'normal');
    const methodText = `Para tramos INTERIOR_RAMAL se utiliza el método de Unidades de Equivalencia Hidráulica (UEH) según Anexo A de NCh3371. Para tramos DESCARGA_HORIZ y COLECTOR_EXTERIOR se aplica la ecuación de Manning con los límites de llenado y velocidad establecidos por normativa.`;
    const methodLines = doc.splitTextToSize(methodText, 180);
    doc.text(methodLines, 14, y);
    y += methodLines.length * 5 + 10;
    
    doc.setFont('helvetica', 'bold');
    doc.text('Criterios de verificación', 14, y);
    y += 6;
    
    doc.setFont('helvetica', 'normal');
    doc.text('- Diámetro mínimo normativo', 14, y);
    y += 5;
    doc.text('- Pendiente mínima normativa', 14, y);
    y += 5;
    doc.text('- Límite de llenado (h/D)', 14, y);
    y += 5;
    doc.text('- Velocidades mínima y máxima', 14, y);
    y += 5;
    doc.text('- Coherencia entre método y referencia normativa', 14, y);
    
    addFooter(doc);
    
    return pageNumber + 1;
}

function addGeneralParameters(doc: jsPDF, data: ReportData, pageNumber: number): number {
    let y = addHeader(doc, '2. PARÁMETROS GENERALES', pageNumber);
    
    doc.setTextColor(...COLORS.text);
    doc.setFontSize(10);
    
    const tableData = [
        ['Parámetro', 'Valor'],
        ['Proyecto', data.params.projectName || 'No especificado'],
        ['Tipo de sistema', data.params.sanitarySystemType || 'No especificado'],
        ['Fecha de cálculo', data.params.projectDate || new Date().toLocaleDateString()],
        ['Ingeniero responsable', data.params.engineerName || 'No especificado'],
        ['Empresa', data.params.company || 'No especificado'],
        ['Total de tramos', String(data.resumen.totalTramos)],
        ['Tramos conformes', String(data.resumen.tramosCumplen)],
        ['Tramos no conformes', String(data.resumen.tramosNoCumplen)],
    ];
    
    autoTable(doc, {
        startY: y,
        head: [tableData[0]],
        body: tableData.slice(1),
        theme: 'grid',
        headStyles: {
            fillColor: COLORS.primary,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
        },
        bodyStyles: {
            textColor: COLORS.text,
        },
        alternateRowStyles: {
            fillColor: COLORS.lightGray,
        },
        margin: { left: 14, right: 14 },
        columnStyles: {
            0: { cellWidth: 80, fontStyle: 'bold' },
            1: { cellWidth: 100 },
        },
    });
    
    addFooter(doc);
    
    return pageNumber + 1;
}

function addTramosTable(doc: jsPDF, data: ReportData, pageNumber: number): number {
    let currentPage = pageNumber;
    doc.addPage();
    let y = addHeader(doc, '3. TABLA DE TRAMOS', currentPage);
    
    doc.setTextColor(...COLORS.text);
    doc.setFontSize(9);
    doc.text('Relación de tramos verificados con su estado normativo:', 14, y);
    y += 8;
    
    const tableData = data.filas.map(f => [
        f.id,
        ROL_LABELS[f.rol] || f.rol,
        String(f.dn),
        f.pendiente.toFixed(2) + '%',
        f.qDiseno > 0 ? f.qDiseno.toFixed(3) : '-',
        f.metodo,
        f.estado,
        f.norma,
    ]);
    
    autoTable(doc, {
        startY: y,
        head: [['Tramo', 'Rol', 'DN', 'Pend.', 'Q (L/s)', 'Método', 'Estado', 'Norma']],
        body: tableData,
        theme: 'grid',
        headStyles: {
            fillColor: COLORS.primary,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 8,
        },
        bodyStyles: {
            textColor: COLORS.text,
            fontSize: 8,
        },
        alternateRowStyles: {
            fillColor: COLORS.lightGray,
        },
        margin: { left: 14, right: 14 },
        columnStyles: {
            0: { cellWidth: 25 },
            1: { cellWidth: 30 },
            2: { cellWidth: 15 },
            3: { cellWidth: 20 },
            4: { cellWidth: 20 },
            5: { cellWidth: 20 },
            6: { cellWidth: 20 },
            7: { cellWidth: 40 },
        },
        didParseCell: function(cellData: any) {
            if (cellData.section === 'body' && cellData.column.index === 6) {
                const estado = cellData.cell.raw;
                if (estado === 'NO APTO') {
                    cellData.cell.styles.textColor = COLORS.danger;
                    cellData.cell.styles.fontStyle = 'bold';
                } else if (estado === 'APTO') {
                    cellData.cell.styles.textColor = COLORS.success;
                } else if (estado === 'CONDICIONAL') {
                    cellData.cell.styles.textColor = COLORS.warning;
                }
            }
        },
        didDrawPage: function() {
            addFooter(doc);
        },
    });
    
    return currentPage + 1;
}

function addTraceabilitySection(doc: jsPDF, data: ReportData, pageNumber: number): number {
    let currentPage = pageNumber;
    doc.addPage();
    let y = addHeader(doc, '4. TRAZABILIDAD NORMATIVA', currentPage);
    
    doc.setTextColor(...COLORS.text);
    doc.setFontSize(9);
    doc.text('Detalle de referencias normativas por tramo:', 14, y);
    y += 8;
    
    const traceData = data.filas
        .filter(f => f.traceability)
        .map(f => [
            f.id,
            ROL_LABELS[f.rol] || f.rol,
            f.traceability!.method,
            f.traceability!.norma,
            f.traceability!.anexo || f.traceability!.articulo || '-',
            f.traceability!.formula,
            f.hasInconsistency ? 'SI' : 'NO',
        ]);
    
    autoTable(doc, {
        startY: y,
        head: [['Tramo', 'Rol', 'Método', 'Norma', 'Anexo', 'Fórmula', 'Alerta']],
        body: traceData,
        theme: 'grid',
        headStyles: {
            fillColor: COLORS.secondary,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 8,
        },
        bodyStyles: {
            textColor: COLORS.text,
            fontSize: 7,
        },
        alternateRowStyles: {
            fillColor: COLORS.lightGray,
        },
        margin: { left: 14, right: 14 },
        didParseCell: function(cellData: any) {
            if (cellData.section === 'body' && cellData.column.index === 6) {
                const hasAlert = cellData.cell.raw === 'SI';
                if (hasAlert) {
                    cellData.cell.styles.textColor = COLORS.danger;
                    cellData.cell.styles.fontStyle = 'bold';
                }
            }
        },
        didDrawPage: function() {
            addFooter(doc);
        },
    });
    
    const inconsistencies = data.filas.filter(f => f.hasInconsistency);
    if (inconsistencies.length > 0) {
        const finalY = (doc as any).lastAutoTable?.finalY || y + 20;
        doc.setTextColor(...COLORS.danger);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('ADVERTENCIA: Se detectaron inconsistencias normativas:', 14, finalY + 10);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        inconsistencies.forEach((f, idx) => {
            doc.text(`- ${f.id}: ${f.inconsistencyMessage}`, 14, finalY + 18 + idx * 6);
        });
    }
    
    return currentPage + 1;
}

function addConclusions(doc: jsPDF, data: ReportData, pageNumber: number): number {
    doc.addPage();
    let y = addHeader(doc, '5. CONCLUSIONES', pageNumber);
    
    doc.setTextColor(...COLORS.text);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    
    const pctCumple = data.resumen.totalTramos > 0 
        ? ((data.resumen.tramosCumplen / data.resumen.totalTramos) * 100).toFixed(1)
        : '0';
    
    const conclusionGeneral = data.resumen.tramosNoCumplen === 0
        ? 'El sistema de alcantarillado CUMPLE en su totalidad con los requisitos normativos establecidos en NCh3371:2017 y NCh1105:2019.'
        : `El sistema de alcantarillado presenta ${data.resumen.tramosNoCumplen} tramo(s) que NO CUMPLEN con los requisitos normativos.`;
    
    const lines = doc.splitTextToSize(conclusionGeneral, 180);
    doc.text(lines, 14, y);
    y += lines.length * 5 + 10;
    
    doc.setFont('helvetica', 'bold');
    doc.text('Resumen de verificacion:', 14, y);
    y += 8;
    
    doc.setFont('helvetica', 'normal');
    doc.text(`- Total de tramos analizados: ${data.resumen.totalTramos}`, 14, y);
    y += 6;
    doc.setTextColor(...COLORS.success);
    doc.text(`- Tramos conformes: ${data.resumen.tramosCumplen} (${pctCumple}%)`, 14, y);
    y += 6;
    doc.setTextColor(...COLORS.danger);
    doc.text(`- Tramos no conformes: ${data.resumen.tramosNoCumplen}`, 14, y);
    y += 10;
    
    doc.setTextColor(...COLORS.text);
    
    if (data.resumen.tramosNoCumplen > 0) {
        doc.setFont('helvetica', 'bold');
        doc.text('Tramos no conformes:', 14, y);
        y += 6;
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        data.filas.filter(f => f.estado === 'NO APTO').forEach(f => {
            const failChecks = f.checks.filter((c: any) => c.estado === 'FAIL').map((c: any) => c.id);
            doc.text(`- ${f.id}: Falla en ${failChecks.join(', ')}`, 14, y);
            y += 5;
        });
    }
    
    y += 10;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.text('Documento generado automaticamente por SMCALC ALC', 14, y);
    doc.text(`Fecha de generacion: ${new Date().toLocaleString()}`, 14, y + 6);
    
    addFooter(doc);
    
    return pageNumber + 1;
}

export function generateTechnicalReport(data: ReportData): void {
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
    });
    
    addCoverPage(doc, data.params);
    
    let pageNumber = 2;
    
    pageNumber = addDescriptiveMemory(doc, data, pageNumber);
    
    doc.addPage();
    pageNumber = addGeneralParameters(doc, data, pageNumber);
    
    pageNumber = addTramosTable(doc, data, pageNumber);
    
    if (data.traceMode) {
        pageNumber = addTraceabilitySection(doc, data, pageNumber);
    }
    
    addConclusions(doc, data, pageNumber);
    
    const fileName = `Memoria_Calculo_${data.params.projectName?.replace(/\s+/g, '_') || 'Proyecto'}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
}
