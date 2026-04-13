import React from 'react';

interface PropertyInputProps {
    value: number | string;
    isNumber: boolean;
    onChange: (val: number | string) => void;
    disabled?: boolean;
    className?: string;
    onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
    style?: React.CSSProperties;
    validationState?: 'empty' | 'invalid' | 'valid' | 'neutral';
    tooltip?: string;
}

export const PropertyInput: React.FC<PropertyInputProps> = ({
    value,
    isNumber,
    onChange,
    disabled,
    className,
    onFocus,
    style,
    validationState = 'neutral',
    tooltip
}) => {
    // Formatting helper
    const formatValue = (val: number | string) => {
        if (isNumber) {
            const num = typeof val === 'string' ? parseFloat(val.replace(',', '.')) : val;
            return !isNaN(num) ? num.toFixed(3) : '0.000';
        }
        return String(val);
    };

    const [localValue, setLocalValue] = React.useState<string>(formatValue(value));
    const isFocused = React.useRef(false);

    // Reset local value when external value changes, but ONLY if not focused
    React.useEffect(() => {
        if (!isFocused.current) {
            setLocalValue(formatValue(value));
        }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setLocalValue(val);

        if (isNumber) {
            if (val === '' || val === '-' || val.endsWith('.') || val.endsWith(',')) {
                return; // Wait for complete number
            }
            const normalized = val.replace(',', '.');
            const parsed = parseFloat(normalized);
            if (!isNaN(parsed) && parsed !== Number(value)) {
                onChange(parsed);
            }
        } else {
            onChange(val);
        }
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        isFocused.current = false;
        if (isNumber) {
            const normalized = localValue.replace(',', '.');
            const parsed = parseFloat(normalized);
            if (isNaN(parsed)) {
                onChange(0);
                setLocalValue("0.000");
            } else {
                onChange(parsed);
                setLocalValue(parsed.toFixed(3));
            }
        } else {
            setLocalValue(String(value));
        }
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        isFocused.current = true;
        e.target.select();
        if (onFocus) onFocus(e);
    };

    // Generate validation class based on state
    const getValidationClass = () => {
        const baseClass = className || '';
        switch (validationState) {
            case 'empty':
                return `${baseClass} input-empty`.trim();
            case 'invalid':
                return `${baseClass} input-invalid`.trim();
            case 'valid':
                return `${baseClass} input-valid`.trim();
            case 'neutral':
            default:
                return `${baseClass} input-validation-state`.trim();
        }
    };

    // Base styles with validation colors
    const getValidationStyle = (): React.CSSProperties => {
        const baseStyle: React.CSSProperties = {
            flex: 1,
            padding: '2px 4px',
            borderRadius: '0',
            border: '1px solid transparent',
            fontSize: 'inherit',
            fontFamily: 'var(--font-family-numeric)',
            fontVariantNumeric: 'tabular-nums',
            background: 'transparent',
            transition: 'border-color 120ms ease, box-shadow 120ms ease',
            position: 'relative',
            ...style
        };

        switch (validationState) {
            case 'empty':
                return {
                    ...baseStyle,
                    borderColor: 'var(--functional-warning)',
                    boxShadow: '0 0 0 2px var(--functional-warning-bg)'
                };
            case 'invalid':
                return {
                    ...baseStyle,
                    borderColor: 'var(--functional-danger)',
                    boxShadow: '0 0 0 2px var(--functional-danger-bg)'
                };
            case 'valid':
                return {
                    ...baseStyle,
                    borderColor: 'var(--functional-success)',
                    boxShadow: '0 0 0 2px var(--functional-success-bg)'
                };
            default:
                return baseStyle;
        }
    };

    return (
        <div style={{ position: 'relative', flex: 1, display: 'flex' }}>
            <input
                type="text"
                value={localValue}
                onChange={handleChange}
                onBlur={handleBlur}
                onFocus={handleFocus}
                disabled={disabled}
                className={getValidationClass()}
                style={getValidationStyle()}
                title={tooltip}
            />
            {tooltip && validationState !== 'neutral' && (
                <div 
                    className="input-error-tooltip" 
                    style={{ 
                        position: 'absolute', 
                        bottom: '100%', 
                        left: '50%', 
                        transform: 'translateX(-50%)',
                        marginBottom: '4px',
                        zIndex: 600
                    }}
                >
                    {tooltip}
                </div>
            )}
        </div>
    );
};
