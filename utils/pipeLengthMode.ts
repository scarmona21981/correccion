import type { AttributeValue, Pipe } from '../context/ProjectContext';

export type PipeLengthMode = 'manual' | 'auto';

const roundPipeLength = (value: number): number => {
    if (!Number.isFinite(value)) return 0;
    return parseFloat(Math.max(0, value).toFixed(2));
};

const asLengthAttribute = (length: Pipe['length']): AttributeValue => {
    if (length && typeof length === 'object' && 'value' in length) {
        return {
            value: Number(length.value) || 0,
            origin: length.origin === 'calculated' ? 'calculated' : 'manual'
        };
    }

    const parsed = Number(length);
    return {
        value: Number.isFinite(parsed) ? parsed : 0,
        origin: 'manual'
    };
};

export const resolvePipeLengthMode = (pipe: Pick<Pipe, 'length' | 'lengthMode'>): PipeLengthMode => {
    if (pipe.lengthMode === 'auto' || pipe.lengthMode === 'manual') {
        return pipe.lengthMode;
    }

    const length = pipe.length as any;
    return length?.origin === 'calculated' ? 'auto' : 'manual';
};

export const buildManualLengthUpdate = (currentLength: Pipe['length'], nextLength: number): {
    lengthMode: 'manual';
    length: AttributeValue;
} => {
    const current = asLengthAttribute(currentLength);
    return {
        lengthMode: 'manual',
        length: {
            ...current,
            value: roundPipeLength(nextLength),
            origin: 'manual'
        }
    };
};

export const buildAutoLengthUpdate = (currentLength: Pipe['length'], nextLength: number): {
    lengthMode: 'auto';
    length: AttributeValue;
} => {
    const current = asLengthAttribute(currentLength);
    return {
        lengthMode: 'auto',
        length: {
            ...current,
            value: roundPipeLength(nextLength),
            origin: 'calculated'
        }
    };
};

export const withCalculatedPipeLength = <T extends Pick<Pipe, 'length' | 'lengthMode'>>(pipe: T, nextLength: number): T => {
    if (resolvePipeLengthMode(pipe) !== 'auto') {
        return pipe;
    }

    const update = buildAutoLengthUpdate(pipe.length, nextLength);
    return {
        ...pipe,
        ...update
    } as T;
};
