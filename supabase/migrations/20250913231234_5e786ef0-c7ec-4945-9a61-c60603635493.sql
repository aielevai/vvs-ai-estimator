-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Customers table
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  postal_code VARCHAR(10),
  city VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Cases table (customer inquiries)
CREATE TABLE cases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id),
  subject TEXT,
  description TEXT,
  email_content TEXT,
  extracted_data JSONB,
  status VARCHAR(50) DEFAULT 'new',
  address TEXT,
  postal_code VARCHAR(10),
  city VARCHAR(100),
  task_type VARCHAR(100),
  urgency VARCHAR(50) DEFAULT 'normal',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Quotes table
CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID REFERENCES cases(id),
  quote_number VARCHAR(50) UNIQUE,
  subtotal DECIMAL(10,2),
  vat_amount DECIMAL(10,2),
  total_amount DECIMAL(10,2),
  labor_hours DECIMAL(6,2),
  travel_time DECIMAL(6,2),
  travel_cost DECIMAL(10,2),
  service_vehicle_cost DECIMAL(10,2),
  status VARCHAR(50) DEFAULT 'draft',
  valid_until DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Quote lines table
CREATE TABLE quote_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id UUID REFERENCES quotes(id),
  line_type VARCHAR(50),
  description TEXT NOT NULL,
  quantity DECIMAL(10,2),
  unit_price DECIMAL(12,2),
  total_price DECIMAL(12,2),
  material_code VARCHAR(50),
  labor_hours DECIMAL(6,2),
  sort_order INTEGER DEFAULT 0
);

-- Supplier prices table (for future use)
CREATE TABLE supplier_prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id VARCHAR(100),
  product_code VARCHAR(100),
  description TEXT,
  base_price DECIMAL(12,2),
  final_price DECIMAL(12,2),
  valentin_mapping VARCHAR(100),
  last_updated TIMESTAMP DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_prices ENABLE ROW LEVEL SECURITY;

-- Create policies (open for now, will be secured later)
CREATE POLICY "Allow all" ON customers FOR ALL USING (true);
CREATE POLICY "Allow all" ON cases FOR ALL USING (true);
CREATE POLICY "Allow all" ON quotes FOR ALL USING (true);
CREATE POLICY "Allow all" ON quote_lines FOR ALL USING (true);
CREATE POLICY "Allow all" ON supplier_prices FOR ALL USING (true);

-- Create indexes for better performance
CREATE INDEX idx_cases_status ON cases(status);
CREATE INDEX idx_cases_created_at ON cases(created_at);
CREATE INDEX idx_quotes_case_id ON quotes(case_id);
CREATE INDEX idx_quote_lines_quote_id ON quote_lines(quote_id);