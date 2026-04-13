import { DomesticSegmentInput, DomesticResult, DomesticRole } from './domesticTypes';

interface TableA3Row {
    dn: number;
    i_1: number;
    i_2: number;
    i_3: number;
    i_4: number;
}

const TABLE_A3_PRINCIPAL: TableA3Row[] = [
    { dn: 75, i_1: 90, i_2: 125, i_3: 150, i_4: 180 },
    { dn: 100, i_1: 450, i_2: 630, i_3: 780, i_4: 900 },
    { dn: 125, i_1: 850, i_2: 1200, i_3: 1430, i_4: 1700 },
    { dn: 150, i_1: 1350, i_2: 1900, i_3: 2300, i_4: 2700 },
    { dn: 175, i_1: 2100, i_2: 2900, i_3: 3500, i_4: 4150 },
    { dn: 200, i_1: 2800, i_2: 3900, i_3: 4750, i_4: 5600 },
    { dn: 250, i_1: 4900, i_2: 6800, i_3: 8300, i_4: 9800 },
    { dn: 300, i_1: 8000, i_2: 11200, i_3: 13600, i_4: 16800 }
];

const TABLE_A3_SECUNDARIA: TableA3Row[] = [
    { dn: 32, i_1: 1, i_2: 2, i_3: 3, i_4: 3 },
    { dn: 38, i_1: 3, i_2: 5, i_3: 6, i_4: 7 },
    { dn: 50, i_1: 6, i_2: 21, i_3: 23, i_4: 26 },
    { dn: 75, i_1: 36, i_2: 42, i_3: 47, i_4: 50 },
    { dn: 100, i_1: 180, i_2: 216, i_3: 230, i_4: 250 },
    { dn: 125, i_1: 400, i_2: 480, i_3: 520, i_4: 560 },
    { dn: 150, i_1: 600, i_2: 790, i_3: 570, i_4: 940 },
    { dn: 175, i_1: 1130, i_2: 1350, i_3: 1470, i_4: 1580 },
    { dn: 200, i_1: 1600, i_2: 1920, i_3: 2080, i_4: 2240 },
    { dn: 250, i_1: 2700, i_2: 3240, i_3: 3520, i_4: 3780 },
    { dn: 300, i_1: 4200, i_2: 5000, i_3: 5500, i_4: 6000 }
];

/**
 * Maps input DN to tabulated DN in NCh3371 Table A.3
 */
function mapDnForTableA3(dn_mm: number): { usedDn: number; note?: string } {
    if (dn_mm === 110) return { usedDn: 100, note: "DN 110 mapeado a DN 100 (conservador)" };
    if (dn_mm === 160) return { usedDn: 150, note: "DN 160 mapeado a DN 150 (conservador)" };
    return { usedDn: dn_mm };
}

export function computeDomesticVerification(segments: DomesticSegmentInput[]): DomesticResult[] {
    return segments.map(seg => {
        const missing: string[] = [];
        const notes: string[] = [];

        // Critical data check
        if (!seg.DN_mm) missing.push("DN");
        if (seg.slope_pct === undefined || seg.slope_pct === null) missing.push("I_EVAL");
        if (seg.ueh_acum === undefined || seg.ueh_acum === null) missing.push("UEH_ACUM");
        if (seg.L_m === undefined || seg.L_m === null) missing.push("L");

        // Rules
        // C1: Pendiente mínima
        const I_min_pct = seg.DN_mm >= 100 ? 1.0 : 1.5;
        const checkI = seg.slope_pct >= I_min_pct;

        // C2: Distancia máxima
        const L_max_m = seg.Dint_mm <= 100 ? 30 : 50;
        const checkL = seg.L_m <= L_max_m;

        // C3: Diámetro mínimo por rol
        const DN_min_mm = seg.role === "RAMAL_PRINCIPAL" ? 100 : null;
        const checkDN = DN_min_mm === null ? true : (seg.DN_mm >= DN_min_mm);

        // C4: Capacidad UEH (Tabla A.3)
        let ueh_max_a3: number | null = null;
        let checkUEH = false;
        let tableType: 'principal' | 'secundaria' = (seg.role === "RAMAL_PRINCIPAL") ? 'principal' : 'secundaria';
        const table = tableType === 'principal' ? TABLE_A3_PRINCIPAL : TABLE_A3_SECUNDARIA;

        const { usedDn, note: dnNote } = mapDnForTableA3(seg.DN_mm);
        if (dnNote) notes.push(dnNote);

        const row = table.find(r => r.dn === usedDn);
        let I_used_pct = 0;

        if (!row) {
            missing.push(`TablaA3:DN_${usedDn}_no_soportado`);
        } else {
            // Robust slope lookup
            // Table columns correspond to slopes 1, 2, 3, 4 [%]
            const availableSlopes = [1, 2, 3, 4];

            if (seg.slope_pct < Math.min(...availableSlopes)) {
                I_used_pct = Math.min(...availableSlopes);
                notes.push(`I_eval (${seg.slope_pct}%) < I_min_tab (${I_used_pct}%); se usó I_min_tab.`);
            } else {
                // Find highest tabulated slope <= i_eval
                I_used_pct = Math.max(...availableSlopes.filter(s => s <= seg.slope_pct));
            }

            // Map I_used_pct to column
            switch (I_used_pct) {
                case 1: ueh_max_a3 = row.i_1; break;
                case 2: ueh_max_a3 = row.i_2; break;
                case 3: ueh_max_a3 = row.i_3; break;
                case 4: ueh_max_a3 = row.i_4; break;
                default: ueh_max_a3 = null;
            }

            if (ueh_max_a3 === null) {
                missing.push("TablaA3:pendiente_no_soportada");
            } else {
                checkUEH = seg.ueh_acum <= ueh_max_a3;
            }
        }

        // Status Logic:
        // APTO: missing.length === 0 AND all checks true
        // NO APTO: missing.length === 0 AND some checks false
        // INCOMPLETO: missing.length > 0
        const status = missing.length > 0 ? "INCOMPLETO" : (checkI && checkL && checkDN && checkUEH ? "APTO" : "NO APTO");

        return {
            id: seg.id,
            tramoLabel: `${seg.cIni}-${seg.cFin}`,
            role: seg.role,
            L_m: seg.L_m,
            DN_mm: seg.DN_mm,
            Dint_mm: seg.Dint_mm,
            I_eval_pct: seg.slope_pct,
            I_min_pct,
            L_max_m,
            DN_min_mm,
            ueh_acum: seg.ueh_acum,
            ueh_max_a3,
            checks: {
                I: checkI,
                L: checkL,
                DN: checkDN,
                UEH: checkUEH
            },
            status,
            missing,
            trace: {
                method: "NCh3371 (RIDAA) - Anexo A",
                slopeRule: `DN ${seg.DN_mm}mm >= 100mm ? 1.0% : 1.5%`,
                lengthRule: `D_INT ${seg.Dint_mm}mm <= 100mm ? 30m : 50m`,
                dnRule: seg.role === "RAMAL_PRINCIPAL" ? "RAMAL_PRINCIPAL requiere DN mín 100mm" : "No aplica DN mín por rol",
                uehRule: `Tubería ${tableType} DN ${usedDn}mm a i=${I_used_pct}% permite hasta ${ueh_max_a3 ?? 'N/A'} UEH`,
                ueh_max_a3,
                I_used_pct,
                DN_used_mm: usedDn,
                notes
            }
        };
    });
}
