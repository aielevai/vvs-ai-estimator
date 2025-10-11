// BOM (Bill of Materials) generator - deterministisk stykliste pr projekttype

export interface BomLine {
  component: string;
  quantity: number;
  unit: string;
  category: string;
  criticality: 'critical' | 'standard' | 'optional';
}

// Affaldsprocenter pr kategori
const WASTE_FACTORS: Record<string, number> = {
  'pipe': 1.10,      // 10% affald
  'fittings': 1.05,  // 5% affald
  'floor': 1.15,     // 15% affald
  'tiles': 1.15,     // 15% affald
  'default': 1.10    // 10% default
};

function applyWaste(qty: number, category: string): number {
  const factor = WASTE_FACTORS[category] || WASTE_FACTORS.default;
  return Math.ceil(qty * factor);
}

// BOM regler pr projekttype
const BOM_RULES: Record<string, (size: number, complexity: string, signals: any) => BomLine[]> = {
  bathroom_renovation: (size: number, complexity: string, signals: any) => {
    const lines: BomLine[] = [];
    
    // Gulvvarme (hvis signalet er sat)
    if (signals?.floor_heating) {
      lines.push({ component: 'gulvvarmeslanger', quantity: applyWaste(size, 'floor'), unit: 'm2', category: 'floor_heating', criticality: 'critical' });
      lines.push({ component: 'fordelerboks', quantity: 1, unit: 'stk', category: 'floor_heating', criticality: 'critical' });
    }
    
    // Afløbsrør
    lines.push({ component: 'afløbsrør 110mm', quantity: applyWaste(size * 1.5, 'pipe'), unit: 'meter', category: 'pipe', criticality: 'critical' });
    lines.push({ component: 'afløbsrør 50mm', quantity: applyWaste(size * 2, 'pipe'), unit: 'meter', category: 'pipe', criticality: 'critical' });
    
    // Vandrør
    lines.push({ component: 'pex rør 16mm', quantity: applyWaste(size * 3, 'pipe'), unit: 'meter', category: 'pipe', criticality: 'critical' });
    lines.push({ component: 'koblinger pex', quantity: Math.ceil(size * 2), unit: 'stk', category: 'fittings', criticality: 'standard' });
    
    // Sanitet
    lines.push({ component: 'vask komplet', quantity: 1, unit: 'stk', category: 'fixtures', criticality: 'critical' });
    lines.push({ component: 'toilet komplet', quantity: 1, unit: 'stk', category: 'fixtures', criticality: 'critical' });
    
    if (size > 4) {
      lines.push({ component: 'bruseniche', quantity: 1, unit: 'stk', category: 'fixtures', criticality: 'critical' });
      lines.push({ component: 'armatur bruser', quantity: 1, unit: 'stk', category: 'fixtures', criticality: 'critical' });
    }
    
    // Fliser og membran
    lines.push({ component: 'gulvfliser', quantity: applyWaste(size, 'tiles'), unit: 'm2', category: 'tiles', criticality: 'standard' });
    lines.push({ component: 'vægfliser', quantity: applyWaste(size * 2.5, 'tiles'), unit: 'm2', category: 'tiles', criticality: 'standard' });
    lines.push({ component: 'membran', quantity: applyWaste(size * 1.2, 'floor'), unit: 'm2', category: 'waterproofing', criticality: 'critical' });
    
    // Ventilation
    lines.push({ component: 'ventilator', quantity: 1, unit: 'stk', category: 'ventilation', criticality: 'standard' });
    
    // Småvarer
    lines.push({ component: 'lim og fugemasse', quantity: size * 150, unit: 'kr', category: 'consumables', criticality: 'standard' });
    
    return lines;
  },
  
  floor_heating: (size: number, complexity: string, signals: any) => {
    const lines: BomLine[] = [];
    
    lines.push({ component: 'gulvvarmeslanger', quantity: applyWaste(size, 'floor'), unit: 'm2', category: 'floor_heating', criticality: 'critical' });
    lines.push({ component: 'fordelerboks', quantity: Math.ceil(size / 30), unit: 'stk', category: 'floor_heating', criticality: 'critical' });
    lines.push({ component: 'termostat', quantity: Math.ceil(size / 30), unit: 'stk', category: 'controls', criticality: 'critical' });
    lines.push({ component: 'isolering', quantity: applyWaste(size, 'floor'), unit: 'm2', category: 'insulation', criticality: 'standard' });
    lines.push({ component: 'montageskinner', quantity: applyWaste(size / 5, 'fittings'), unit: 'meter', category: 'fittings', criticality: 'standard' });
    
    return lines;
  },
  
  radiator_installation: (size: number, complexity: string, signals: any) => {
    const lines: BomLine[] = [];
    const units = Math.round(size); // size = antal radiatorer
    
    lines.push({ component: 'radiator komplet', quantity: units, unit: 'stk', category: 'radiators', criticality: 'critical' });
    lines.push({ component: 'radiatorventil', quantity: units * 2, unit: 'stk', category: 'valves', criticality: 'critical' });
    lines.push({ component: 'pex rør 16mm', quantity: applyWaste(units * 6, 'pipe'), unit: 'meter', category: 'pipe', criticality: 'critical' });
    lines.push({ component: 'koblinger pex', quantity: units * 4, unit: 'stk', category: 'fittings', criticality: 'standard' });
    lines.push({ component: 'vægkonsol radiator', quantity: units * 2, unit: 'stk', category: 'fittings', criticality: 'standard' });
    
    return lines;
  },
  
  district_heating: (size: number, complexity: string, signals: any) => {
    const lines: BomLine[] = [];
    
    lines.push({ component: 'fjernvarme vekslersæt', quantity: 1, unit: 'stk', category: 'district_heating', criticality: 'critical' });
    lines.push({ component: 'fjernvarme flowmåler', quantity: 1, unit: 'stk', category: 'metering', criticality: 'critical' });
    lines.push({ component: 'isolerede rør 2x32mm', quantity: applyWaste(signals?.distance_to_main ?? 20, 'pipe'), unit: 'meter', category: 'pipe', criticality: 'critical' });
    lines.push({ component: 'jordarbejde', quantity: signals?.distance_to_main ?? 20, unit: 'meter', category: 'excavation', criticality: 'critical' });
    lines.push({ component: 'tilslutningsgebyr', quantity: 25000, unit: 'kr', category: 'fees', criticality: 'critical' });
    
    if (signals?.hot_work) {
      lines.push({ component: 'varmetillæg', quantity: 600, unit: 'kr', category: 'fees', criticality: 'standard' });
    }
    
    return lines;
  },
  
  pipe_installation: (size: number, complexity: string, signals: any) => {
    const lines: BomLine[] = [];
    const meters = Math.round(size);
    
    const pipeType = signals?.pipe_type || 'pex';
    const diameter = signals?.diameter || '16mm';
    
    lines.push({ component: `${pipeType} rør ${diameter}`, quantity: applyWaste(meters, 'pipe'), unit: 'meter', category: 'pipe', criticality: 'critical' });
    lines.push({ component: `koblinger ${pipeType}`, quantity: Math.ceil(meters / 3), unit: 'stk', category: 'fittings', criticality: 'standard' });
    lines.push({ component: 'isolering rør', quantity: applyWaste(meters, 'pipe'), unit: 'meter', category: 'insulation', criticality: 'standard' });
    
    if (signals?.wall_mounting) {
      lines.push({ component: 'rørbeslag', quantity: Math.ceil(meters / 2), unit: 'stk', category: 'fittings', criticality: 'standard' });
    }
    
    return lines;
  },
  
  kitchen_plumbing: (size: number, complexity: string, signals: any) => {
    const lines: BomLine[] = [];
    
    // Vandrør
    lines.push({ component: 'pex rør 16mm', quantity: applyWaste(size * 2, 'pipe'), unit: 'meter', category: 'pipe', criticality: 'critical' });
    lines.push({ component: 'koblinger pex', quantity: Math.ceil(size), unit: 'stk', category: 'fittings', criticality: 'standard' });
    
    // Afløb
    lines.push({ component: 'afløbsrør 50mm', quantity: applyWaste(size * 1.5, 'pipe'), unit: 'meter', category: 'pipe', criticality: 'critical' });
    
    // Armatur
    lines.push({ component: 'køkkenarmatur', quantity: 1, unit: 'stk', category: 'fixtures', criticality: 'critical' });
    
    if (signals?.dishwasher) {
      lines.push({ component: 'opvaskemaskine tilslutning', quantity: 1, unit: 'stk', category: 'fixtures', criticality: 'standard' });
    }
    
    if (signals?.disposal) {
      lines.push({ component: 'affaldskværn', quantity: 1, unit: 'stk', category: 'fixtures', criticality: 'optional' });
    }
    
    return lines;
  },
  
  service_call: (size: number, complexity: string, signals: any) => {
    const lines: BomLine[] = [];
    
    // Minimal BOM for servicekald - småvarer og forbrugsstoffer
    lines.push({ component: 'serviceforbrug', quantity: 500, unit: 'kr', category: 'consumables', criticality: 'standard' });
    
    if (signals?.parts_needed) {
      lines.push({ component: 'reservedele', quantity: 1000, unit: 'kr', category: 'parts', criticality: 'standard' });
    }
    
    return lines;
  }
};

export function generateProjectBOM(
  projectType: string,
  size: number,
  complexity: string = 'medium',
  signals: any = {}
): BomLine[] {
  const generator = BOM_RULES[projectType];
  if (!generator) {
    console.warn(`No BOM generator for project type: ${projectType}`);
    return [];
  }
  
  return generator(size, complexity, signals);
}

export function getMaterialFloor(projectType: string, size: number, floorData: any): number {
  if (!floorData) return 0;
  return Number(floorData.base_floor ?? 0) + (Number(floorData.per_unit_floor ?? 0) * size);
}
