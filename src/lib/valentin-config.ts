export const VALENTIN_PRICING_LOGIC = {
  baseRates: {
    hourlyRate: 595, // Real rate from price list
    serviceVehicle: 65, // Per hour, not flat fee
    minimumProject: 4500,
  },

  // Timer pr. type - baseHours er reference for averageSize
  hoursPerProjectType: {
    bathroom_renovation: { 
      baseHours: 8, 
      unit: "m2", 
      averageSize: 10, 
      sizeRange: [6, 20],
      minHours: 4,
      maxHours: 200,
      beta: 1.0 // Scaling exponent, can be calibrated by historical data
    },
    kitchen_plumbing: { 
      baseHours: 4, 
      unit: "m2", 
      averageSize: 8, 
      sizeRange: [4, 15],
      minHours: 3,
      maxHours: 100,
      beta: 1.0
    },
    pipe_installation: { 
      baseHours: 0.7, 
      unit: "meter", 
      averageSize: 15, 
      sizeRange: [5, 50],
      minHours: 2,
      maxHours: 150,
      beta: 1.0
    },
    district_heating: { 
      baseHours: 16, 
      unit: "connection", 
      averageSize: 1, 
      additionalPerUnit: 0.5,
      minHours: 8,
      maxHours: 40,
      beta: 1.0
    },
    floor_heating: { 
      baseHours: 1.5, 
      unit: "m2", 
      averageSize: 35, 
      sizeRange: [20, 150],
      minHours: 4,
      maxHours: 200,
      beta: 1.0
    },
    radiator_installation: { 
      baseHours: 4, 
      unit: "units", 
      averageSize: 3, 
      sizeRange: [1, 10],
      minHours: 2,
      maxHours: 80,
      beta: 1.0
    },
    service_call: { 
      baseHours: 3, 
      unit: "job", 
      averageSize: 1,
      minHours: 2,
      maxHours: 50,
      beta: 1.0
    }
  },

  // Materialer – interne konstanter (ingen CSV/API endnu)
  materialCostPerType: {
    bathroom_renovation: 3500,  // kr/m2
    kitchen_plumbing: 2200,     // kr/m2
    pipe_installation: 180,     // kr/m
    district_heating: 24000,    // kr/tilslutning
    floor_heating: 800,         // kr/m2
    radiator_installation: 2500,// kr/stk
    service_call: 500           // fast
  },

  complexityMultipliers: { 
    simple: 0.8, 
    medium: 1.0, 
    complex: 1.3, 
    emergency: 1.5 
  },

  sizeDiscounts: { 
    small: { threshold: 0, discount: 0 }, 
    medium: { threshold: 50, discount: 0.1 }, 
    large: { threshold: 150, discount: 0.2 } 
  },

  company: {
    name: "Valentin VVS ApS",
    address: "Pederstrupvej 50, 2750 Ballerup",
    cvr: "43234773",
    phone: "60122472",
    email: "mkv@valentinvvs.dk",
    web: "valentinvvs.dk"
  }
};

export function mapTaskToProjectType(taskType: string): string {
  const mapping: Record<string, string> = {
    "badeværelse": "bathroom_renovation",
    "bathroom": "bathroom_renovation",
    "køkken": "kitchen_plumbing",
    "kitchen": "kitchen_plumbing",
    "rør": "pipe_installation",
    "pipe": "pipe_installation",
    "fjernvarme": "district_heating",
    "district_heating": "district_heating",
    "gulvvarme": "floor_heating",
    "floor_heating": "floor_heating",
    "radiator": "radiator_installation",
    "service": "service_call",
    "akut": "service_call"
  };
  return mapping[taskType?.toLowerCase()] || "service_call";
}

export function getSizeDiscount(size: number): number {
  const d = VALENTIN_PRICING_LOGIC.sizeDiscounts;
  if (size >= d.large.threshold) return d.large.discount;
  if (size >= d.medium.threshold) return d.medium.discount;
  return d.small.discount;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('da-DK', {
    style: 'currency',
    currency: 'DKK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('da-DK', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(dateString));
}

export function getProjectTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    bathroom_renovation: "Badeværelse renovering",
    kitchen_plumbing: "Køkken VVS",
    pipe_installation: "Rørinstallation",
    district_heating: "Fjernvarme",
    floor_heating: "Gulvvarme",
    radiator_installation: "Radiator installation",
    service_call: "Service kald"
  };
  return labels[type] || type;
}