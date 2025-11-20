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

// Fælles helpers til BOM-beregninger
const q = (n: number) => Math.max(0, Math.round(n));
const qm = (n: number) => Math.max(0, Math.ceil(n));
const withWaste = (n: number, pct = 0.1) => Math.ceil(n * (1 + pct));
const notSupplied = (key: string, supplied: string[]) => !supplied.includes(key);

const CX = (signals: any) => {
  const c = String(signals?.complexity || 'medium');
  return c === 'simple' ? 0.9 : c === 'hard' ? 1.15 : 1.0;
};

const BOM_RULES: Record<string, (size: number, complexity: string, signals: any) => BomLine[]> = {
  bathroom_renovation: (size, complexity, signals) => {
    const lines: BomLine[] = [];
    const customerSupplied = signals.customer_supplied || [];
    const cx = CX(signals);
    const pex = qm(size * 9 * cx);
    const fit = Math.ceil(pex / 5);

    // Afløb (udvidet)
    lines.push({ componentKey: 'unidrain_line', qty: 1, unit: 'stk', critical: true });
    lines.push({ componentKey: 'unidrain_low_outlet_ø50', qty: 1, unit: 'stk', critical: true });
    lines.push({ componentKey: 'drain_pipe_dn50', qty: qm(size * 0.5 * cx), unit: 'm', critical: true });
    lines.push({ componentKey: 'drain_pipe_dn110', qty: 3, unit: 'm', critical: true });
    lines.push({ componentKey: 'trap_dn32', qty: 1, unit: 'stk', critical: true });

    // Vand (udvidet)
    lines.push({ componentKey: 'pex_15', qty: withWaste(pex, 0.08), unit: 'm', critical: true });
    lines.push({ componentKey: 'pex_fitting_t', qty: q(fit * 0.4), unit: 'stk', critical: true });
    lines.push({ componentKey: 'pex_fitting_elbow', qty: q(fit * 0.6), unit: 'stk', critical: true });
    lines.push({ componentKey: 'pipe_insulation_13mm', qty: qm(pex * 0.5), unit: 'm', critical: false });
    lines.push({ componentKey: 'manifold_small', qty: 1, unit: 'stk', critical: true });
    lines.push({ componentKey: 'ballofix', qty: Math.max(6, q(size / 2)), unit: 'stk', critical: true });

    // Sanitet (customer-aware)
    lines.push({ componentKey: 'wc_bowl', qty: 1, unit: 'stk', critical: false, customerSupplied: !notSupplied('wc_bowl', customerSupplied) });
    lines.push({ componentKey: 'flush_plate', qty: 1, unit: 'stk', critical: false, customerSupplied: !notSupplied('flush_plate', customerSupplied) });
    lines.push({ componentKey: 'geberit_duofix_cistern', qty: 1, unit: 'stk', critical: true, customerSupplied: !notSupplied('wc_cistern', customerSupplied) });
    lines.push({ componentKey: 'faucet_basin', qty: 1, unit: 'stk', critical: false, customerSupplied: !notSupplied('faucet_basin', customerSupplied) });
    lines.push({ componentKey: 'faucet_shower', qty: 1, unit: 'stk', critical: false, customerSupplied: !notSupplied('faucet_shower', customerSupplied) });

    // Vådrum
    lines.push({ componentKey: 'wetroom_membrane', qty: qm(size * 1.5 * cx), unit: 'm', critical: true });
    lines.push({ componentKey: 'sealing_sleeve_drain', qty: 1, unit: 'stk', critical: true });
    lines.push({ componentKey: 'sealing_sleeve_pipes', qty: 4, unit: 'stk', critical: true });

    // Finish
    lines.push({ componentKey: 'mirror_cabinet_60cm', qty: 1, unit: 'stk', critical: false });

    // Småting
    lines.push({ componentKey: 'consumables_small', qty: 1, unit: 'sæt', critical: true });
    lines.push({ componentKey: 'haulage_waste', qty: 1, unit: 'sæt', critical: false });

    return lines;
  },

  floor_heating: (size, complexity, signals) => {
    const lines: BomLine[] = [];
    const cx = CX(signals);
    const zones = Number(signals?.zones || Math.max(1, Math.round(size / 10)));
    const hose = zones * Math.max(qm(size * 10 * cx), 80);

    lines.push({ componentKey: 'fh_hose_16mm', qty: hose, unit: 'm', critical: true });
    lines.push({ componentKey: 'fh_manifold', qty: zones, unit: 'zone', critical: true });
    lines.push({ componentKey: 'fh_shunt_pump_group', qty: 1, unit: 'stk', critical: true });
    lines.push({ componentKey: 'fh_thermostat', qty: zones, unit: 'stk', critical: true });
    lines.push({ componentKey: 'fh_edge_insulation', qty: qm(size * 2), unit: 'm', critical: false });
    lines.push({ componentKey: 'fh_tape', qty: zones, unit: 'rulle', critical: false });
    lines.push({ componentKey: 'consumables_small', qty: 1, unit: 'sæt', critical: true });

    return lines;
  },

  district_heating: (size, complexity, signals) => {
    const lines: BomLine[] = [];
    const cx = CX(signals);
    const iso = qm(size * 1.2 * cx);

    lines.push({ componentKey: 'dh_substation_hex', qty: 1, unit: 'stk', critical: true });
    lines.push({ componentKey: 'dh_strainers_filters', qty: 1, unit: 'sæt', critical: true });
    lines.push({ componentKey: 'dh_safety_valve', qty: 1, unit: 'stk', critical: true });
    lines.push({ componentKey: 'dh_circulation_pump', qty: 1, unit: 'stk', critical: true });
    lines.push({ componentKey: 'dh_expansion_vessel', qty: 1, unit: 'stk', critical: true });
    lines.push({ componentKey: 'dh_energy_meter', qty: 1, unit: 'stk', critical: false });
    lines.push({ componentKey: 'manometer', qty: 1, unit: 'stk', critical: false });
    lines.push({ componentKey: 'thermometer', qty: 2, unit: 'stk', critical: false });
    lines.push({ componentKey: 'pipe_insulation_19mm', qty: iso, unit: 'm', critical: false });
    lines.push({ componentKey: 'ballofix', qty: 6, unit: 'stk', critical: true });
    lines.push({ componentKey: 'consumables_small', qty: 1, unit: 'sæt', critical: true });

    return lines;
  },

  radiator_installation: (size, complexity, signals) => {
    const lines: BomLine[] = [];
    const cx = CX(signals);
    const n = Number(signals?.radiators ?? Math.max(2, q(size / 6)));
    const pex = qm(n * 8 * cx);

    for (let i = 0; i < n; i++) {
      lines.push({ componentKey: 'radiator_panel_600x1000', qty: 1, unit: 'stk', critical: true });
      lines.push({ componentKey: 'radiator_brackets', qty: 1, unit: 'sæt', critical: true });
      lines.push({ componentKey: 'thermostatic_valve', qty: 1, unit: 'stk', critical: true });
      lines.push({ componentKey: 'thermostat_head', qty: 1, unit: 'stk', critical: true });
      lines.push({ componentKey: 'radiator_connection_50mm', qty: 1, unit: 'sæt', critical: true });
      lines.push({ componentKey: 'air_vent', qty: 1, unit: 'stk', critical: false });
    }

    lines.push({ componentKey: 'pex_15', qty: withWaste(pex, 0.08), unit: 'm', critical: true });
    lines.push({ componentKey: 'pipe_insulation_13mm', qty: qm(pex * 0.6), unit: 'm', critical: false });
    lines.push({ componentKey: 'ballofix', qty: Math.max(2, n), unit: 'stk', critical: true });
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
    const customerSupplied = signals.customer_supplied || [];
    const cx = CX(signals);
    const pex = qm(size * 4 * cx);

    // Vand
    lines.push({ componentKey: 'pex_15', qty: withWaste(pex, 0.08), unit: 'm', critical: true });
    lines.push({ componentKey: 'pipe_insulation_13mm', qty: qm(pex * 0.5), unit: 'm', critical: false });
    lines.push({ componentKey: 'pex_fitting_elbow', qty: q(pex / 6), unit: 'stk', critical: true });
    lines.push({ componentKey: 'ballofix', qty: 2, unit: 'stk', critical: true });

    // Sanitet (customer-aware)
    lines.push({ componentKey: 'kitchen_sink', qty: 1, unit: 'stk', critical: false, customerSupplied: !notSupplied('kitchen_sink', customerSupplied) });
    lines.push({ componentKey: 'kitchen_faucet', qty: 1, unit: 'stk', critical: false, customerSupplied: !notSupplied('kitchen_faucet', customerSupplied) });
    lines.push({ componentKey: 'flex_hose_pair', qty: 1, unit: 'sæt', critical: false, customerSupplied: !notSupplied('flex_hose_pair', customerSupplied) });
    lines.push({ componentKey: 'siphon_kitchen', qty: 1, unit: 'stk', critical: false, customerSupplied: !notSupplied('siphon_kitchen', customerSupplied) });

    // Afløb
    lines.push({ componentKey: 'drain_pipe_dn50', qty: qm(size * 0.25 * cx), unit: 'm', critical: true });

    // Småting
    lines.push({ componentKey: 'consumables_small', qty: 1, unit: 'sæt', critical: true });
    lines.push({ componentKey: 'haulage_waste', qty: 1, unit: 'sæt', critical: false });

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
