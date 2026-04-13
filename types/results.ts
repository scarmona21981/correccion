export type NormRef = {
  code: string;
  clause?: string;
  annex?: string;
  table?: string;
  note?: string;
};

export type TraceStep = {
  id: string;
  label: string;
  method: string;
  formula?: string;
  inputs: Record<string, number | string | null>;
  intermediates?: Record<string, number | string | null>;
  outputs: Record<string, number | string | null>;
  normRef: NormRef;
};

export type CheckItem = {
  id: string;
  name: string;
  result: 'PASS' | 'FAIL' | 'WARN' | 'NA';
  measured?: number | string | null;
  limit?: number | string | null;
  unit?: string;
  message?: string;
  normRef: NormRef;
  traceStepIds?: string[];
};

export type SegmentResult = {
  segmentId: string;
  tramo: string;
  role: string;
  normRegime: string;
  overall: 'PASS' | 'FAIL' | 'WARN';
  checks: CheckItem[];
  trace: TraceStep[];
  pTotal?: number;
  uehTotal?: number;
  uehUpstream?: number;
  pElegida?: number;
  qd?: number;
  methodQ?: string;
};
