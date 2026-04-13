import { FlowUnit, fromM3s, toM3s } from '../hydraulics/flowUnits';
import type { PressureResults } from '../hydraulics/types';

export interface PressureDisplayOptions {
    flowUnit: FlowUnit;
    flowDecimals: number;
    valueDecimals: number;
}

const clampDecimals = (value: number): number => {
    if (!Number.isFinite(value)) return 2;
    return Math.max(0, Math.min(6, Math.round(value)));
};

const formatNumber = (value: number, decimals: number, fallback = '--'): string => {
    if (!Number.isFinite(value)) return fallback;
    return value.toFixed(clampDecimals(decimals));
};

const convertFlowLs = (valueLs: number, unit: FlowUnit): number => {
    if (!Number.isFinite(valueLs)) return Number.NaN;
    return fromM3s(toM3s(valueLs, 'L/s'), unit);
};

const convertFlowM3s = (valueM3s: number, unit: FlowUnit): number => {
    if (!Number.isFinite(valueM3s)) return Number.NaN;
    return fromM3s(valueM3s, unit);
};

export const createPressureDisplayFormatter = (options: PressureDisplayOptions) => {
    const flowDecimals = clampDecimals(options.flowDecimals);
    const valueDecimals = clampDecimals(options.valueDecimals);

    const flowRawFromLs = (valueLs: number): number => convertFlowLs(valueLs, options.flowUnit);
    const flowRawFromM3s = (valueM3s: number): number => convertFlowM3s(valueM3s, options.flowUnit);

    return {
        flowUnit: options.flowUnit,
        flowDecimals,
        valueDecimals,
        number: (value: number, decimals = valueDecimals, fallback = '--'): string => formatNumber(value, decimals, fallback),
        signed: (value: number, decimals = valueDecimals, fallback = '--'): string => {
            if (!Number.isFinite(value)) return fallback;
            const prefix = value >= 0 ? '+' : '';
            return `${prefix}${value.toFixed(clampDecimals(decimals))}`;
        },
        flowRawFromLs,
        flowRawFromM3s,
        flowFromLs: (valueLs: number, decimals = flowDecimals, fallback = '--'): string => formatNumber(flowRawFromLs(valueLs), decimals, fallback),
        flowFromM3s: (valueM3s: number, decimals = flowDecimals, fallback = '--'): string => formatNumber(flowRawFromM3s(valueM3s), decimals, fallback)
    };
};

export const formatFlowControlBadge = (results: PressureResults | null | undefined): string => {
    if (!results?.flowControl) return 'Q*';
    if (results.flowControl.clamped) return `CLAMP (${results.flowControl.qOp_Lps.toFixed(3)} L/s)`;
    return `Q* (${results.flowControl.qStar_Lps.toFixed(3)} L/s)`;
};

export const formatNpshBadge = (results: PressureResults | null | undefined): string => {
    if (!results?.npsh) return '--';
    const right = results.npsh.npshRequired_m !== undefined
        ? ` / NPSHr ${results.npsh.npshRequired_m.toFixed(2)} m`
        : '';
    return `NPSHa ${results.npsh.npshAvailable_m.toFixed(2)} m${right}`;
};
