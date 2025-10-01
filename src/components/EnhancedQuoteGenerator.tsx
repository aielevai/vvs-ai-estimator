import React from 'react';
import SmartQuoteCollaborator from './SmartQuoteCollaborator';

interface MaterialSuggestion {
  sku: string;
  title: string;
  suggested_quantity: number;
  confidence: number;
  unit_price_ex_vat: number;
  unit: string;
  reasoning?: string;
}

interface TimeEstimate {
  median: number;
  p75: number;
  final_estimate: number;
  risk_hours: number;
  confidence: number;
}

interface QuoteAnalysis {
  bom_suggestions: MaterialSuggestion[];
  hours: TimeEstimate;
  price_breakdown: {
    materials_ex_vat: number;
    labor_ex_vat: number;
    service_van_ex_vat: number;
    total_ex_vat: number;
  };
  explanations: string[];
  confidence: number;
  quoteId?: string;
  caseId?: string;
}

export default function EnhancedQuoteGenerator() {
  return (
    <SmartQuoteCollaborator 
      onQuoteGenerated={(quoteId, caseId) => {
        console.log('Quote generated:', quoteId, caseId);
      }}
    />
  );
}