// BOM (Bill of Materials) generator - deterministisk stykliste pr projekttype

export interface BomLine {
  component: string;
  quantity: number;
  unit: 'stk' | 'm' | 'm2' | 'sæt' | 'spand';
  category: string;
  critical: boolean;
  customer_supplied?: boolean;
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
    const s = Math.max(1, Number(size) || 1);
    const waste = 0.12;
    
    // Afløb – Unidrain linje + kælder-specifikt lavt udløbshus
    lines.push({ component: 'unidrain_linjeafløb', category: 'afløb', unit: 'stk', quantity: 1, critical: true });
    if (signals?.basement) {
      lines.push({ component: 'unidrain_ø50_lavt_udløbshus', category: 'afløb', unit: 'stk', quantity: 1, critical: true });
    }
    lines.push({ component: 'afløbsrør_fittings', category: 'afløb', unit: 'sæt', quantity: 1, critical: true });
    
    // Brugsvand PEX
    lines.push({ component: 'pex_15mm', category: 'rør', unit: 'm', quantity: Math.ceil(s * 8 * (1 + waste)), critical: true });
    lines.push({ component: 'fordeler', category: 'rør', unit: 'stk', quantity: 1, critical: true });
    lines.push({ component: 'ballofix_beslag', category: 'rør', unit: 'stk', quantity: Math.max(6, Math.ceil(s / 2)), critical: true });
    
    // Duofix-ramme + cisterne (skål/trykplade kundeleveret som standard)
    lines.push({ component: 'geberit_duofix_cisterne', category: 'sanitær', unit: 'stk', quantity: 1, critical: true });
    lines.push({ 
      component: 'wc_skål', category: 'sanitær', unit: 'stk', quantity: 1, critical: false,
      customer_supplied: signals?.customer_supplied?.wc_bowl !== false 
    });
    lines.push({ 
      component: 'trykplade', category: 'sanitær', unit: 'stk', quantity: 1, critical: false,
      customer_supplied: signals?.customer_supplied?.flush_plate !== false 
    });
    
    // Armaturer (kundeleveret som standard)
    lines.push({ 
      component: 'armatur_håndvask', category: 'armatur', unit: 'stk', quantity: 1, critical: false,
      customer_supplied: signals?.customer_supplied?.faucets !== false 
    });
    lines.push({ 
      component: 'armatur_bruser', category: 'armatur', unit: 'stk', quantity: 1, critical: false,
      customer_supplied: signals?.customer_supplied?.faucets !== false 
    });
    
    // Forbrug/vådrum (VVS-del)
    lines.push({ component: 'småmateriel_beslag', category: 'diverse', unit: 'sæt', quantity: 1, critical: true });
    
    // Kørsel/affald
    lines.push({ component: 'kørsel_affald', category: 'diverse', unit: 'sæt', quantity: 1, critical: true });
    
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
