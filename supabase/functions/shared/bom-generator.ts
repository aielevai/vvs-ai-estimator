// FASE 3: BOM-generator - Deterministisk stykliste-generator

export interface BomLine {
  component: string;
  quantity: number;
  unit: string;
  category: string;
  kritisk: boolean;
}

// Affaldsprocenter pr kategori
const WASTE_FACTORS: Record<string, number> = {
  'rør': 1.15,
  'tætning': 1.10,
  'finish': 1.20,
  'default': 1.10
};

function applyWaste(qty: number, category: string): number {
  const factor = WASTE_FACTORS[category] ?? WASTE_FACTORS.default;
  return qty * factor;
}

// BOM-regler pr projekttype
const BOM_RULES: Record<string, (size: number, complexity: string, signals: any) => BomLine[]> = {
  
  bathroom_renovation: (size: number, complexity: string, signals: any) => {
    const perimeter = Math.sqrt(size) * 4 * 1.1; // Antag kvadratisk rum + margin
    
    return [
      // Sanitær
      { component: 'toilet', quantity: 1, unit: 'stk', category: 'sanitær', kritisk: true },
      { component: 'håndvask', quantity: 1, unit: 'stk', category: 'sanitær', kritisk: true },
      { component: 'brusekabine', quantity: 1, unit: 'stk', category: 'sanitær', kritisk: true },
      
      // VVS rør
      { component: 'pex 16mm', quantity: applyWaste(size * 8, 'rør'), unit: 'meter', category: 'rør', kritisk: true },
      { component: 'pex 20mm', quantity: applyWaste(size * 2, 'rør'), unit: 'meter', category: 'rør', kritisk: false },
      
      // Afløb
      { component: 'gulvafløb', quantity: 1, unit: 'stk', category: 'afløb', kritisk: true },
      { component: 'p-lås', quantity: 2, unit: 'stk', category: 'afløb', kritisk: true },
      { component: 'afløbsrør 110mm', quantity: applyWaste(perimeter / 2, 'rør'), unit: 'meter', category: 'afløb', kritisk: true },
      
      // Ventiler
      { component: 'ventil', quantity: Math.max(6, Math.ceil(size / 2)), unit: 'stk', category: 'ventiler', kritisk: true },
      
      // Tætning
      { component: 'vådrumsmembran', quantity: applyWaste(size, 'tætning'), unit: 'm²', category: 'tætning', kritisk: true },
      { component: 'klæb', quantity: Math.ceil(size / 4), unit: 'spand', category: 'tætning', kritisk: false },
      { component: 'fuge', quantity: applyWaste(perimeter, 'finish'), unit: 'meter', category: 'finish', kritisk: false },
      
      // Armaturer
      { component: 'blandingsbatteri', quantity: 2, unit: 'stk', category: 'armaturer', kritisk: true },
      
      // Småvarer
      { component: 'tilslutningskit', quantity: 1, unit: 'sæt', category: 'montering', kritisk: false },
    ];
  },

  floor_heating: (size: number, complexity: string, signals: any) => {
    return [
      // Gulvvarme system
      { component: 'gulvvarmeslange 16mm', quantity: applyWaste(size * 7, 'rør'), unit: 'meter', category: 'gulvvarme', kritisk: true },
      { component: 'gulvvarmemanifold', quantity: Math.ceil(size / 50), unit: 'stk', category: 'gulvvarme', kritisk: true },
      { component: 'isolering', quantity: applyWaste(size, 'tætning'), unit: 'm²', category: 'isolering', kritisk: true },
      { component: 'termostat', quantity: Math.max(1, Math.ceil(size / 30)), unit: 'stk', category: 'regulering', kritisk: true },
      { component: 'klemmer', quantity: Math.ceil(size * 2), unit: 'stk', category: 'montering', kritisk: false },
      { component: 'kantbånd', quantity: applyWaste(Math.sqrt(size) * 4, 'finish'), unit: 'meter', category: 'finish', kritisk: false },
    ];
  },

  radiator_installation: (size: number, complexity: string, signals: any) => {
    const units = Math.round(size); // size er antal radiatorer
    return [
      { component: 'radiator', quantity: units, unit: 'stk', category: 'radiator', kritisk: true },
      { component: 'radiatorventil', quantity: units * 2, unit: 'stk', category: 'ventiler', kritisk: true },
      { component: 'pex 16mm', quantity: applyWaste(units * 6, 'rør'), unit: 'meter', category: 'rør', kritisk: true },
      { component: 'vinkelkoblinger', quantity: units * 4, unit: 'stk', category: 'fittings', kritisk: true },
      { component: 'konsoller', quantity: units * 2, unit: 'stk', category: 'montering', kritisk: true },
    ];
  },

  district_heating: (size: number, complexity: string, signals: any) => {
    return [
      { component: 'varmeveksler', quantity: 1, unit: 'stk', category: 'fjernvarme', kritisk: true },
      { component: 'fjernvarmerør', quantity: applyWaste(15, 'rør'), unit: 'meter', category: 'rør', kritisk: true },
      { component: 'isolering', quantity: applyWaste(15, 'tætning'), unit: 'meter', category: 'isolering', kritisk: true },
      { component: 'ventiler fjernvarme', quantity: 4, unit: 'stk', category: 'ventiler', kritisk: true },
      { component: 'måler', quantity: 1, unit: 'stk', category: 'måling', kritisk: true },
      { component: 'sikkerhedsventil', quantity: 1, unit: 'stk', category: 'sikkerhed', kritisk: true },
    ];
  },

  pipe_installation: (size: number, complexity: string, signals: any) => {
    const meters = Math.round(size);
    return [
      { component: 'pex 16mm', quantity: applyWaste(meters, 'rør'), unit: 'meter', category: 'rør', kritisk: true },
      { component: 'fittings', quantity: Math.ceil(meters / 3), unit: 'stk', category: 'fittings', kritisk: true },
      { component: 'isolering', quantity: applyWaste(meters, 'tætning'), unit: 'meter', category: 'isolering', kritisk: false },
      { component: 'beslag', quantity: Math.ceil(meters / 2), unit: 'stk', category: 'montering', kritisk: false },
    ];
  },

  kitchen_plumbing: (size: number, complexity: string, signals: any) => {
    return [
      { component: 'køkkenarmatur', quantity: 1, unit: 'stk', category: 'armaturer', kritisk: true },
      { component: 'pex 16mm', quantity: applyWaste(size * 4, 'rør'), unit: 'meter', category: 'rør', kritisk: true },
      { component: 'afløbsrør 50mm', quantity: applyWaste(size * 2, 'rør'), unit: 'meter', category: 'afløb', kritisk: true },
      { component: 'ventiler', quantity: 4, unit: 'stk', category: 'ventiler', kritisk: true },
      { component: 'sifon', quantity: 1, unit: 'stk', category: 'afløb', kritisk: true },
      { component: 'tilslutningskit', quantity: 1, unit: 'sæt', category: 'montering', kritisk: false },
    ];
  },

  service_call: (size: number, complexity: string, signals: any) => {
    return [
      { component: 'småvarer', quantity: 1, unit: 'sæt', category: 'service', kritisk: false },
      { component: 'forbrugsartikler', quantity: 1, unit: 'sæt', category: 'service', kritisk: false },
    ];
  },
};

export function generateProjectBOM(
  projectType: string, 
  size: number, 
  complexity: string = 'medium',
  signals: any = {}
): BomLine[] {
  const generator = BOM_RULES[projectType];
  
  if (!generator) {
    console.warn(`No BOM rules found for project type: ${projectType}`);
    return [];
  }
  
  return generator(size, complexity, signals);
}

export function getMaterialFloor(projectType: string, size: number, floorData: any): number {
  if (!floorData) return 0;
  
  const baseFloor = Number(floorData.base_floor ?? 0);
  const perUnitFloor = Number(floorData.per_unit_floor ?? 0);
  
  return Math.max(baseFloor, baseFloor + (perUnitFloor * size));
}
