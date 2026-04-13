import type { AttributeValue, Chamber, Pipe } from '../context/ProjectContext';
import {
    buildGraphFromPipes,
    buildProfileData,
    dijkstraRoute,
    enumerateKRoutes
} from '../hydraulics/routeEngineGravity';

const assert = (condition: boolean, message: string) => {
    if (!condition) throw new Error(message);
};

const attr = (value: number): AttributeValue => ({ value, origin: 'manual' });

const chamber = (
    id: string,
    x: number,
    y: number,
    values: { CT?: number; Cre?: number; CRS?: number; delta?: number; H?: number } = {}
): Chamber => ({
    id,
    userDefinedId: id,
    x,
    y,
    CT: attr(values.CT ?? 100),
    H: attr(values.H ?? 1.5),
    Cre: attr(values.Cre ?? 99),
    CRS: attr(values.CRS ?? 98.8),
    delta: attr(values.delta ?? 0.2),
    deltaMode: 'manual',
    Qin: attr(0),
    uehPropias: attr(0),
    uehAcumuladas: attr(0),
    chamberType: 'Domiciliaria',
    chamberDimension: '0.60m'
});

const pipe = (
    id: string,
    startNodeId: string,
    endNodeId: string,
    length: number,
    slope = 1,
    diameter = 160
): Pipe => ({
    id,
    userDefinedId: id,
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
    startNodeId,
    endNodeId,
    material: attr(1),
    diameter: attr(diameter),
    length: attr(length),
    slope: attr(slope),
    uehTransportadas: attr(0)
});

console.log('🧪 test_route_engine.ts\n');

// Ruta simple (2 camaras, 1 pipe)
{
    const chambers = [
        chamber('CH-1', 0, 0, { CT: 101, CRS: 99.5 }),
        chamber('CH-2', 10, 0, { CT: 100.6, Cre: 99.2 })
    ];
    const pipes = [pipe('P-1', 'CH-1', 'CH-2', 10)];

    const graph = buildGraphFromPipes(chambers, pipes);
    const route = dijkstraRoute(graph, 'CH-1', 'CH-2');

    assert(!!route, 'Debe encontrar ruta simple entre CH-1 y CH-2.');
    assert(route?.pipeIds.length === 1, 'Ruta simple debe tener 1 tramo.');
    assert((route?.totalLength || 0) === 10, 'Longitud total de ruta simple debe ser 10 m.');
}

// Ruta de 3+ camaras con chainage correcto
{
    const chambers = [
        chamber('A', 0, 0),
        chamber('B', 12, 0),
        chamber('C', 25, 0),
        chamber('D', 40, 0)
    ];
    const pipes = [
        pipe('AB', 'A', 'B', 12),
        pipe('BC', 'B', 'C', 13),
        pipe('CD', 'C', 'D', 15)
    ];

    const graph = buildGraphFromPipes(chambers, pipes);
    const route = dijkstraRoute(graph, 'A', 'D');
    assert(!!route, 'Debe encontrar ruta A->D.');

    const profile = buildProfileData(route!, chambers, pipes);
    assert(profile.nodes.length === 4, 'Perfil debe contener 4 camaras.');
    assert(profile.nodes[0].chainage === 0, 'Chainage inicial debe ser 0.');
    assert(Math.abs(profile.nodes[3].chainage - 40) < 1e-6, 'Chainage final debe acumular 40 m.');
}

// Ruta sin conexion
{
    const chambers = [chamber('X', 0, 0), chamber('Y', 20, 0)];
    const pipes = [pipe('XX', 'X', 'X', 5)];

    const graph = buildGraphFromPipes(chambers, pipes);
    const route = dijkstraRoute(graph, 'X', 'Y');
    assert(route === null, 'Caso sin conectividad debe retornar null.');
}

// Falta CT o Cre/CRS => gap + aviso
{
    const ch1 = chamber('N1', 0, 0, { CT: 102, CRS: 100.0, Cre: 100.2 });
    const ch2 = chamber('N2', 10, 0, { CT: 101, CRS: 99.6, Cre: 99.9 });
    const ch3 = chamber('N3', 20, 0, { CT: 100.5, CRS: 99.1, Cre: 99.3 });

    ch2.Cre = { value: '', origin: 'manual' };
    ch3.CT = { value: '', origin: 'manual' };

    const chambers = [ch1, ch2, ch3];
    const pipes = [
        pipe('P1', 'N1', 'N2', 10),
        pipe('P2', 'N2', 'N3', 10)
    ];

    const graph = buildGraphFromPipes(chambers, pipes);
    const route = dijkstraRoute(graph, 'N1', 'N3');
    assert(!!route, 'Debe construir ruta para prueba de datos faltantes.');

    const profile = buildProfileData(route!, chambers, pipes);
    assert(profile.warnings.length > 0, 'Perfil debe emitir advertencias por datos faltantes.');
    assert(profile.hasMissingData, 'Perfil debe marcar bandera de datos faltantes.');
    assert(profile.segments.some(segment => !segment.hasInvertData), 'Debe existir al menos un gap por falta de Cre/CRS.');
}

// Multiples caminos => Dijkstra toma menor longitud
{
    const chambers = [
        chamber('A', 0, 0),
        chamber('B', 10, 0),
        chamber('C', 20, 0),
        chamber('D', 10, -8)
    ];
    const pipes = [
        pipe('AB', 'A', 'B', 10),
        pipe('BC', 'B', 'C', 10),
        pipe('AD', 'A', 'D', 8),
        pipe('DC', 'D', 'C', 8)
    ];

    const graph = buildGraphFromPipes(chambers, pipes);
    const shortest = dijkstraRoute(graph, 'A', 'C');
    assert(!!shortest, 'Debe encontrar ruta en bifurcacion.');
    assert(shortest?.pipeIds.join('>') === 'AD>DC', 'Dijkstra debe elegir ruta de menor longitud total.');
    assert(Math.abs((shortest?.totalLength || 0) - 16) < 1e-6, 'Longitud total minima esperada = 16 m.');

    const alternatives = enumerateKRoutes(graph, 'A', 'C', 5);
    assert(alternatives.length >= 2, 'Debe listar rutas alternativas cuando existen bifurcaciones.');
    assert(alternatives[0].totalLength <= alternatives[1].totalLength, 'Alternativas deben quedar ordenadas por longitud.');
}

console.log('✅ test_route_engine.ts OK');
