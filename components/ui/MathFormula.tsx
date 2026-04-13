import React from 'react';
import { InlineMath, BlockMath } from 'react-katex';

interface MathFormulaProps {
    latex: string;
    block?: boolean;
    className?: string;
}

const MathFormula: React.FC<MathFormulaProps> = ({ latex, block = true, className }) => {
    if (!latex) return null;

    try {
        if (block) {
            return (
                <div className={className}>
                    <BlockMath math={latex} />
                </div>
            );
        }
        return (
            <span className={className}>
                <InlineMath math={latex} />
            </span>
        );
    } catch (error) {
        console.error('KaTeX error:', error);
        return <span className={className}>{latex}</span>;
    }
};

export default MathFormula;
