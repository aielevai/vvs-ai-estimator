import { supabase } from "@/integrations/supabase/client";
import { Case, Quote, Customer, AIAnalysisResult, QuoteLine } from "@/types";

export const db = {
  async getCases(): Promise<Case[]> {
    const { data, error } = await supabase
      .from('cases')
      .select(`
        *,
        customers(*),
        quotes(*)
      `)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return (data || []).map(item => ({
      ...item,
      extracted_data: item.extracted_data as unknown as AIAnalysisResult | undefined,
      status: item.status as Case['status'],
      urgency: item.urgency as Case['urgency'],
      quotes: (item.quotes || []).map(quote => ({
        ...quote,
        status: quote.status as Quote['status']
      }))
    })) as Case[];
  },

  async getCase(id: string): Promise<Case> {
    const { data, error } = await supabase
      .from('cases')
      .select(`
        *,
        customers(*),
        quotes(*, quote_lines(*))
      `)
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return {
      ...data,
      extracted_data: data.extracted_data as unknown as AIAnalysisResult | undefined,
      status: data.status as Case['status'],
      urgency: data.urgency as Case['urgency'],
      quotes: (data.quotes || []).map(quote => ({
        ...quote,
        status: quote.status as Quote['status'],
        quote_lines: (quote.quote_lines || []).map(line => ({
          ...line,
          line_type: line.line_type as QuoteLine['line_type']
        }))
      }))
    } as Case;
  },

  async createCase(payload: {
    subject?: string;
    description?: string;
    email_content?: string;
    extracted_data?: AIAnalysisResult;
    status?: string;
    address?: string;
    postal_code?: string;
    city?: string;
    task_type?: string;
    urgency?: string;
    customer_id?: string;
  }): Promise<Case> {
    const { data, error } = await supabase
      .from('cases')
      .insert({
        ...payload,
        extracted_data: payload.extracted_data as any
      })
      .select()
      .single();
    
    if (error) throw error;
    return {
      ...data,
      extracted_data: data.extracted_data as unknown as AIAnalysisResult | undefined,
      status: data.status as Case['status'],
      urgency: data.urgency as Case['urgency']
    };
  },

  async updateCase(id: string, updates: {
    subject?: string;
    description?: string;
    email_content?: string;
    extracted_data?: AIAnalysisResult;
    status?: string;
    address?: string;
    postal_code?: string;
    city?: string;
    task_type?: string;
    urgency?: string;
    customer_id?: string;
  }): Promise<Case> {
    const { data, error } = await supabase
      .from('cases')
      .update({ 
        ...updates, 
        extracted_data: updates.extracted_data as any,
        updated_at: new Date().toISOString() 
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return {
      ...data,
      extracted_data: data.extracted_data as unknown as AIAnalysisResult | undefined,
      status: data.status as Case['status'],
      urgency: data.urgency as Case['urgency']
    };
  },

  async createCustomer(payload: {
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    postal_code?: string;
    city?: string;
  }): Promise<Customer> {
    const { data, error } = await supabase
      .from('customers')
      .insert(payload)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async getQuote(id: string): Promise<Quote> {
    const { data, error } = await supabase
      .from('quotes')
      .select(`
        *,
        quote_lines(*)
      `)
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return {
      ...data,
      status: data.status as Quote['status'],
      quote_lines: (data.quote_lines || []).map(line => ({
        ...line,
        line_type: line.line_type as QuoteLine['line_type']
      }))
    } as Quote;
  },

  async updateQuote(id: string, updates: {
    status?: string;
    subtotal?: number;
    vat_amount?: number;
    total_amount?: number;
    labor_hours?: number;
    travel_cost?: number;
    service_vehicle_cost?: number;
    valid_until?: string;
  }): Promise<Quote> {
    const { data, error } = await supabase
      .from('quotes')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return {
      ...data,
      status: data.status as Quote['status']
    };
  }
};