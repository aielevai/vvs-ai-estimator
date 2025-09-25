-- Create tables for historical calibration and enhanced product data

-- Historical projects for calibration
CREATE TABLE public.historical_projects (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_ref VARCHAR,
    project_type VARCHAR NOT NULL,
    project_description TEXT,
    total_hours NUMERIC,
    total_materials_cost NUMERIC,
    total_project_cost NUMERIC,
    complexity_signals JSONB,
    report_from DATE,
    report_to DATE,
    line_date_assumed DATE,
    date_source VARCHAR,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Historical material lines for BOM patterns
CREATE TABLE public.historical_material_lines (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID REFERENCES public.historical_projects(id),
    product_code VARCHAR,
    description TEXT,
    quantity NUMERIC,
    unit VARCHAR,
    unit_price NUMERIC,
    line_total NUMERIC,
    normalized_description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enhanced supplier prices with search optimization
CREATE TABLE public.enhanced_supplier_prices (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    short_description TEXT,
    long_description TEXT,
    supplier_item_id VARCHAR,
    vvs_number VARCHAR,
    ean_id VARCHAR,
    gross_price NUMERIC,
    net_price NUMERIC,
    price_quantity NUMERIC,
    price_unit VARCHAR,
    ordering_unit_1 VARCHAR,
    ordering_factor_1 NUMERIC,
    ordering_unit_2 VARCHAR,
    ordering_factor_2 NUMERIC,
    leadtime INTEGER,
    is_on_stock BOOLEAN,
    image_url TEXT,
    link TEXT,
    normalized_text TEXT,
    search_vector TSVECTOR,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Project intelligence for AI analysis
CREATE TABLE public.project_intelligence (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    case_id UUID REFERENCES public.cases(id),
    intent VARCHAR,
    complexity_score INTEGER CHECK (complexity_score >= 0 AND complexity_score <= 5),
    signals JSONB,
    estimated_hours NUMERIC,
    risk_hours NUMERIC,
    confidence_score NUMERIC CHECK (confidence_score >= 0 AND confidence_score <= 1),
    bom_suggestions JSONB,
    explanations JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- BOM suggestions tracking
CREATE TABLE public.bom_suggestions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    project_intelligence_id UUID REFERENCES public.project_intelligence(id),
    product_code VARCHAR,
    suggested_quantity NUMERIC,
    confidence NUMERIC CHECK (confidence >= 0 AND confidence <= 1),
    historical_frequency INTEGER,
    unit_price NUMERIC,
    reasoning TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_historical_projects_type ON public.historical_projects(project_type);
CREATE INDEX idx_historical_projects_date ON public.historical_projects(report_from, report_to);
CREATE INDEX idx_historical_material_lines_product ON public.historical_material_lines(product_code);
CREATE INDEX idx_enhanced_supplier_prices_vvs ON public.enhanced_supplier_prices(vvs_number);
CREATE INDEX idx_enhanced_supplier_prices_ean ON public.enhanced_supplier_prices(ean_id);
CREATE INDEX idx_enhanced_supplier_prices_search ON public.enhanced_supplier_prices USING GIN(search_vector);
CREATE INDEX idx_project_intelligence_case ON public.project_intelligence(case_id);
CREATE INDEX idx_project_intelligence_intent ON public.project_intelligence(intent);

-- Enable RLS
ALTER TABLE public.historical_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historical_material_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enhanced_supplier_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_suggestions ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (since this is for internal business logic)
CREATE POLICY "Allow all operations on historical_projects" ON public.historical_projects FOR ALL USING (true);
CREATE POLICY "Allow all operations on historical_material_lines" ON public.historical_material_lines FOR ALL USING (true);
CREATE POLICY "Allow all operations on enhanced_supplier_prices" ON public.enhanced_supplier_prices FOR ALL USING (true);
CREATE POLICY "Allow all operations on project_intelligence" ON public.project_intelligence FOR ALL USING (true);
CREATE POLICY "Allow all operations on bom_suggestions" ON public.bom_suggestions FOR ALL USING (true);

-- Function to update search vectors
CREATE OR REPLACE FUNCTION public.update_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('danish', 
    COALESCE(NEW.short_description, '') || ' ' || 
    COALESCE(NEW.long_description, '') || ' ' ||
    COALESCE(NEW.vvs_number, '') || ' ' ||
    COALESCE(NEW.supplier_item_id, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for automatic search vector updates
CREATE TRIGGER update_enhanced_supplier_prices_search_vector
  BEFORE INSERT OR UPDATE ON public.enhanced_supplier_prices
  FOR EACH ROW EXECUTE FUNCTION public.update_search_vector();