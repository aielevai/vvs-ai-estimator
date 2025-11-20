export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  created_at: string;
  updated_at: string;
}

export interface QuoteLine {
  id: string;
  quote_id: string;
  line_type: 'labor' | 'material' | 'travel' | 'service_vehicle';
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  material_code?: string;
  labor_hours?: number;
  sort_order: number;
}

export interface Quote {
  id: string;
  case_id: string;
  quote_number?: string;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  labor_hours: number;
  travel_cost: number;
  service_vehicle_cost: number;
  status: 'draft' | 'approved' | 'sent' | 'accepted';
  valid_until?: string;
  created_at: string;
  updated_at: string;
  quote_lines?: QuoteLine[];
}

export interface AIAnalysisResult {
  customer: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    customer_type?: 'private' | 'business' | 'contractor';
  };
  project: {
    type: 'bathroom_renovation' | 'kitchen_plumbing' | 'pipe_installation' | 'district_heating' | 'floor_heating' | 'radiator_installation' | 'service_call';
    description: string;
    estimated_size: number;
    size_unit: 'm2' | 'meter' | 'units' | 'connection' | 'job';
    complexity: 'simple' | 'medium' | 'complex' | 'emergency';
    urgency: 'normal' | 'urgent' | 'emergency';
    location_details?: string;
  };
  pricing_hints: {
    base_hours_estimate: number;
    complexity_multiplier: number;
    material_complexity: 'standard' | 'medium' | 'high';
  };
}

export interface Case {
  id: string;
  customer_id?: string;
  subject?: string;
  description?: string;
  email_content?: string;
  extracted_data?: AIAnalysisResult;
  status: 'new' | 'analyzed' | 'quoted' | 'approved' | 'sent';
  address?: string;
  postal_code?: string;
  city?: string;
  task_type?: string;
  urgency: 'normal' | 'urgent' | 'emergency';
  created_at: string;
  updated_at: string;
  customers?: Customer;
  quotes?: Quote[];
}

export interface PriceBreakdown {
  laborHours: number;
  laborCost: number;
  vehicleCost: number;
  materialCost: number;
  subtotal: number;
  vat: number;
  total: number;
  breakdown: Array<{
    description: string;
    amount: number;
    calculation: string;
  }>;
}