// BOM Generator for VVS Projects - Generic Multi-Type Support (ROBUST VERSION)

export type BomLine = {
  componentKey: string;        // matches components.key in DB
  qty: number;
  unit: 'stk'|'m'|'sæt'|'zone'|'ltr';
  critical: boolean;
  customerSupplied?: boolean;
};

const WASTE_FACTORS: Record<string, number> = {
  rør: 0.10,
  fittings: 0.05,
  armatur: 0.02,
  gulvvarme: 0.08,
  default: 0.05,
};

function applyWaste(quantity: number, category: string): number {
  const wasteFactor = WASTE_FACTORS[category] || WASTE_FACTORS.default;
  return Math.ceil(quantity * (1 + wasteFactor));
}

const BOM_RULES: Record<string, (size: number, complexity: string, signals: any) => BomLine[]> = {
  bathroom_renovation: (size, complexity, signals) => {
    const lines: BomLine[] = [];
    const customerSupplied = signals.customer_supplied || [];
    
    // Afløb - altid kritisk
    lines.push({ componentKey: 'unidrain_line', qty: 1, unit: 'stk', critical: true });
    lines.push({ componentKey: 'unidrain_low_outlet_ø50', qty: 1, unit: 'stk', critical: true });
    
    // PEX rør baseret på størrelse (~9m per m²)
    const pexLength = Math.ceil(size * 9);
    lines.push({ componentKey: 'pex_15', qty: applyWaste(pexLength, 'rør'), unit: 'm', critical: true });
    
    // Fordeler og ventiler
    lines.push({ componentKey: 'manifold_small', qty: 1, unit: 'stk', critical: true });
    const ballofixQty = Math.max(6, Math.ceil(size / 2));
    lines.push({ componentKey: 'ballofix', qty: ballofixQty, unit: 'stk', critical: true });
    
    // WC indbygning (kun hvis ikke kundeleveret)
    if (!customerSupplied.includes('wc_bowl')) {
      lines.push({ componentKey: 'geberit_duofix_cistern', qty: 1, unit: 'stk', critical: true });
    }
    
    // Afløbsrør og fittings
    lines.push({ componentKey: 'drain_pipes_fittings', qty: 1, unit: 'sæt', critical: true });
    
    // Småmateriel
    lines.push({ componentKey: 'consumables_small', qty: 1, unit: 'sæt', critical: true });
    
    // Kørsel og affald
    lines.push({ componentKey: 'haulage_waste', qty: 1, unit: 'sæt', critical: false });
    
    // Kundeleveret - vises men prissættes 0
    if (customerSupplied.includes('wc_bowl')) {
      lines.push({ componentKey: 'wc_bowl', qty: 1, unit: 'stk', critical: false, customerSupplied: true });
    }
    if (customerSupplied.includes('flush_plate')) {
      lines.push({ componentKey: 'flush_plate', qty: 1, unit: 'stk', critical: false, customerSupplied: true });
    }
    if (customerSupplied.includes('faucet_basin')) {
      lines.push({ componentKey: 'faucet_basin', qty: 1, unit: 'stk', critical: false, customerSupplied: true });
    }
    if (customerSupplied.includes('faucet_shower')) {
      lines.push({ componentKey: 'faucet_shower', qty: 1, unit: 'stk', critical: false, customerSupplied: true });
    }
    
    return lines;
  },

  floor_heating: (size, complexity, signals) => {
    const lines: BomLine[] = [];
    const zones = Math.max(1, Math.round(size / 10)); // ~1 zone per 10m²
    const hosePerM2 = 8; // meter slange pr. m² (cc-afstand ~125mm)
    
    // Gulvvarmeslange (8m/m² med waste factor)
    const hoseLength = Math.ceil(size * hosePerM2);
    lines.push({ componentKey: 'fh_hose_16mm', qty: applyWaste(hoseLength, 'gulvvarme'), unit: 'm', critical: true });
    
    // Fordeler (1 pr. zone)
    lines.push({ componentKey: 'fh_manifold', qty: zones, unit: 'zone', critical: true });
    
    // Shuntgruppe med pumpe (1 pr. installation)
    lines.push({ componentKey: 'fh_shunt_pump_group', qty: 1, unit: 'stk', critical: true });
    
    // Termostater (1 pr. zone)
    lines.push({ componentKey: 'fh_thermostat', qty: zones, unit: 'stk', critical: true });
    
    // Småmateriel
    lines.push({ componentKey: 'consumables_small', qty: 1, unit: 'sæt', critical: true });
    
    return lines;
  },

  district_heating: (size, complexity, signals) => {
    const lines: BomLine[] = [];
    
    // Varmevekslerstation (hovedkomponent)
    lines.push({ componentKey: 'dh_substation_hex', qty: 1, unit: 'stk', critical: true });
    
    // Filtre og smudssi
    lines.push({ componentKey: 'dh_strainers_filters', qty: 1, unit: 'sæt', critical: true });
    
    // Ballofix kuglehaner (standard sæt)
    lines.push({ componentKey: 'ballofix', qty: 6, unit: 'stk', critical: true });
    
    // Sikkerhedsventil
    lines.push({ componentKey: 'dh_safety_valve', qty: 1, unit: 'stk', critical: true });
    
    // Isolering
    lines.push({ componentKey: 'insulation', qty: 1, unit: 'sæt', critical: false });
    
    // Småmateriel
    lines.push({ componentKey: 'consumables_small', qty: 1, unit: 'sæt', critical: true });
    
    return lines;
  },

  radiator_installation: (size, complexity, signals) => {
    // size = antal radiatorer
    const lines: BomLine[] = [];
    const count = Math.max(1, size);
    
    lines.push({ componentKey: 'ballofix', qty: count * 2, unit: 'stk', critical: true });
    lines.push({ componentKey: 'pex_15', qty: count * 4, unit: 'm', critical: true });
    lines.push({ componentKey: 'consumables_small', qty: 1, unit: 'sæt', critical: true });
    
    return lines;
  },

  pipe_installation: (size, complexity, signals) => {
    const lines: BomLine[] = [];
    const length = Math.max(1, size);
    
    lines.push({ componentKey: 'pex_15', qty: applyWaste(length, 'rør'), unit: 'm', critical: true });
    lines.push({ componentKey: 'ballofix', qty: Math.ceil(length / 3), unit: 'stk', critical: true });
    lines.push({ componentKey: 'consumables_small', qty: 1, unit: 'sæt', critical: true });
    
    return lines;
  },

  kitchen_plumbing: (size, complexity, signals) => {
    const lines: BomLine[] = [];
    
    // PEX rør (~6m per m²)
    const pexLength = Math.ceil(size * 6);
    lines.push({ componentKey: 'pex_15', qty: applyWaste(pexLength, 'rør'), unit: 'm', critical: true });
    
    lines.push({ componentKey: 'manifold_small', qty: 1, unit: 'stk', critical: true });
    lines.push({ componentKey: 'ballofix', qty: 4, unit: 'stk', critical: true });
    lines.push({ componentKey: 'drain_pipes_fittings', qty: 1, unit: 'sæt', critical: true });
    lines.push({ componentKey: 'consumables_small', qty: 1, unit: 'sæt', critical: true });
    
    return lines;
  },

  service_call: (size, complexity, signals) => {
    const lines: BomLine[] = [];
    
    // Minimal BOM for serviceopkald
    lines.push({ componentKey: 'consumables_small', qty: 1, unit: 'sæt', critical: false });
    
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
    console.warn(`No BOM rules for project type: ${projectType}`);
    return [];
  }
  return generator(size, complexity, signals);
}

export function getMaterialFloor(projectType: string, size: number, floorData: any): number {
  const baseFloor = floorData?.base_floor || 0;
  const perUnitFloor = floorData?.per_unit_floor || 0;
  return baseFloor + (perUnitFloor * size);
}
