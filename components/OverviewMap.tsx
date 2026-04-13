import React, { useRef, useEffect } from 'react';
import { useProject } from '../context/ProjectContext';
import { useView } from '../context/ViewContext';

export const OverviewMap: React.FC = () => {
    const { chambers, pipes, settings: projectSettings } = useProject();
    const { scale, viewOffset, setViewOffset, viewportSize } = useView();
    const svgRef = useRef<SVGSVGElement>(null);

    const { minX, minY, maxX, maxY } = projectSettings.mapDimensions;
    const width = maxX - minX;
    const height = maxY - minY;

    const viewRectX = -viewOffset.x / scale;
    const viewRectY = -viewOffset.y / scale;
    const viewRectW = viewportSize.width / scale;
    const viewRectH = viewportSize.height / scale;

    const handleMapClick = (e: React.MouseEvent) => {
        if (!svgRef.current) return;
        const rect = svgRef.current.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        // Convert click (0..200) to Project Space (minX..maxX)
        const mapScaleX = width / 200;
        const mapScaleY = height / 150;

        // This projection is tricky because we preserve aspect ratio in SVG `viewBox`.
        // Simplification: Rely on SVG viewBox mapping.
        // We know the viewBox is `minX minY width height`.
        // We can use getScreenCTM() inverse? No, simpler:

        // Just map percentage?
        // Let's rely on standard logic: Center view on click.
        // But we need the Coordinate in Project Space.
        // The SVG click coordinate is Screen Space relative to the Minimap.

        // Better approach:
        // Use normalized coordinates (0..1)
        const normX = clickX / rect.width;
        const normY = clickY / rect.height;

        const targetX = minX + normX * width;
        const targetY = minY + normY * height;

        // Set ViewOffset so that targetX, targetY is in center
        const newOffsetX = (viewportSize.width / 2) - targetX * scale;
        const newOffsetY = (viewportSize.height / 2) - targetY * scale;

        setViewOffset({ x: newOffsetX, y: newOffsetY });
    };

    return (
        <div className="overview-map" style={{
            position: 'absolute',
            bottom: 40, // Above status bar
            right: 250, // Left of properties panel? Or right corner?
            width: 200,
            height: 150,
            backgroundColor: 'rgba(255,255,255,0.9)',
            border: '2px solid #ccc',
            borderRadius: 4,
            overflow: 'hidden',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            zIndex: 100
        }}>
            <svg
                ref={svgRef}
                width="100%"
                height="100%"
                viewBox={`${minX} ${minY} ${width} ${height}`}
                preserveAspectRatio="xMidYMid meet"
                onClick={handleMapClick}
                style={{ cursor: 'crosshair', background: '#f0f0f0' }}
            >
                {/* Simplified Content */}
                {pipes.map(p => {
                    const sn = chambers.find(c => c.id === p.startNodeId) || chambers.find(c => c.id === p.startNodeId); // Fallback
                    const en = chambers.find(c => c.id === p.endNodeId);
                    const x1 = sn ? sn.x : p.x1;
                    const y1 = sn ? sn.y : p.y1;
                    const x2 = en ? en.x : p.x2;
                    const y2 = en ? en.y : p.y2;
                    return (
                        <line key={p.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#999" strokeWidth={width / 100} />
                    );
                })}
                {chambers.map(c => (
                    <circle key={c.id} cx={c.x} cy={c.y} r={width / 150} fill="#666" />
                ))}

                {/* View Rect */}
                <rect
                    x={viewRectX}
                    y={viewRectY}
                    width={viewRectW}
                    height={viewRectH}
                    fill="none"
                    stroke="red"
                    strokeWidth={width / 200}
                />
            </svg>
            <div style={{
                position: 'absolute', top: 0, left: 0, padding: 4, fontSize: 10, background: 'rgba(255,255,255,0.7)'
            }}>
                Overview
            </div>
        </div>
    );
};
