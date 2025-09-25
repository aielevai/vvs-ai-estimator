import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Brain, Clock, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<QuoteAnalysis | null>(null);
  const { toast } = useToast();

  const handleGenerateQuote = async () => {
    if (!description.trim()) {
      toast({
        title: "Manglende beskrivelse",
        description: "Indtast venligst en projektbeskrivelse",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      console.log('Generating enhanced quote for:', description);

      // Step 1: Analyze email content
      const { data: emailAnalysis, error: emailError } = await supabase.functions.invoke('analyze-email', {
        body: { 
          subject: 'Enhanced Quote Request',
          content: description
        }
      });

      if (emailError) throw emailError;

      console.log('Email analysis result:', emailAnalysis);

      // Step 2: Create a real case first
      const { data: newCase, error: caseError } = await supabase
        .from('cases')
        .insert({
          subject: 'Enhanced Quote Request',
          description: description,
          extracted_data: emailAnalysis,
          status: 'analyzed'
        })
        .select()
        .single();

      if (caseError) throw caseError;

      // Step 3: Generate actual quote using the calculate-quote function
      const { data: quoteData, error: quoteError } = await supabase.functions.invoke('calculate-quote', {
        body: {
          caseId: newCase.id
        }
      });

      if (quoteError) throw quoteError;

      console.log('Quote generated:', quoteData);

      // Step 4: Get historical analysis for display
      const { data: historicalData, error: historicalError } = await supabase.functions.invoke('historical-analysis', {
        body: {
          projectType: emailAnalysis.project?.type || 'service_call',
          complexity: getComplexityScore(emailAnalysis.project?.complexity || 'medium'),
          description: description,
          estimatedSize: emailAnalysis.project?.estimated_size || 1
        }
      });

      if (historicalError) throw historicalError;

      // Step 5: Get material data for display
      const { data: materialData, error: materialError } = await supabase.functions.invoke('material-lookup', {
        body: {
          projectType: emailAnalysis.project?.type || 'service_call',
          projectDescription: description,
          estimatedSize: emailAnalysis.project?.estimated_size || 1,
          complexity: emailAnalysis.project?.complexity || 'medium',
          materialeAnalyse: emailAnalysis.materiale_analyse
        }
      });

      if (materialError) throw materialError;

      // Combine all insights into final analysis
      const finalAnalysis: QuoteAnalysis = {
        bom_suggestions: materialData.materials?.map((m: any) => ({
          sku: m.product_code,
          title: m.description,
          suggested_quantity: m.quantity,
          confidence: 0.8,
          unit_price_ex_vat: m.unit_price,
          unit: 'stk',
          reasoning: m.reasoning
        })) || [],
        hours: {
          median: historicalData.median_hours || 4,
          p75: historicalData.p75_hours || 6,
          final_estimate: quoteData.pricing_analysis?.total_hours || 5,
          risk_hours: historicalData.risk_hours || 1,
          confidence: historicalData.confidence || 0.6
        },
        price_breakdown: {
          materials_ex_vat: materialData.total_cost || 0,
          labor_ex_vat: (quoteData.pricing_analysis?.total_hours || 0) * 550,
          service_van_ex_vat: 65,
          total_ex_vat: quoteData.quote?.subtotal || 0
        },
        explanations: [
          `Baseret på ${historicalData.total_projects_analyzed || 0} historiske projekter`,
          `AI har analyseret ${materialData.materials?.length || 0} materialer`,
          `Tilbud ${quoteData.quote?.quote_number} er oprettet i systemet`,
          ...(materialData.ai_reasoning ? [materialData.ai_reasoning] : [])
        ],
        confidence: (
          (historicalData.confidence || 0.5) + 
          (materialData.materials?.length > 0 ? 0.8 : 0.4) + 
          0.7
        ) / 3,
        quoteId: quoteData.quote?.id,
        caseId: newCase.id
      };

      setAnalysis(finalAnalysis);

      toast({
        title: "Analyse gennemført",
        description: `Tilbud ${quoteData.quote?.quote_number} genereret med ${Math.round(finalAnalysis.confidence * 100)}% konfidens`
      });

    } catch (error) {
      console.error('Enhanced quote generation error:', error);
      toast({
        title: "Fejl",
        description: `Kunne ikke generere tilbud: ${(error as any).message}`,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getComplexityScore = (complexity: string): number => {
    switch (complexity) {
      case 'simple': return 1;
      case 'medium': return 2;
      case 'complex': return 4;
      case 'emergency': return 5;
      default: return 2;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-100 text-green-800';
    if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Intelligent Tilbudsgenerator
            <Badge variant="secondary">AI-Optimeret</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">
              Projektbeskrivelse
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Beskriv VVS-projektet i detaljer..."
              className="min-h-[100px]"
            />
          </div>
          
          <Button 
            onClick={handleGenerateQuote}
            disabled={loading}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyserer med AI...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Generer Intelligent Tilbud
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {analysis && (
        <div className="space-y-4">
          {/* Confidence Score */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <span className="font-medium">Samlet Konfidens</span>
                <Badge className={getConfidenceColor(analysis.confidence)}>
                  {Math.round(analysis.confidence * 100)}%
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Time Estimate */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Historisk Kalibreret Tidestimering
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Median</div>
                  <div className="text-lg font-semibold">{analysis.hours.median}h</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">P75</div>
                  <div className="text-lg font-semibold">{analysis.hours.p75}h</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Estimat</div>
                  <div className="text-lg font-semibold text-primary">{analysis.hours.final_estimate}h</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Risiko Buffer</div>
                  <div className="text-lg font-semibold text-orange-600">+{analysis.hours.risk_hours}h</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Material Suggestions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Intelligente Materialeforslag
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analysis.bom_suggestions.map((material, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium">{material.title}</div>
                      <div className="text-sm text-muted-foreground">
                        SKU: {material.sku} • {material.suggested_quantity} {material.unit}
                      </div>
                      {material.reasoning && (
                        <div className="text-xs text-blue-600 mt-1">{material.reasoning}</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">
                        {(material.unit_price_ex_vat * material.suggested_quantity).toLocaleString('da-DK')} kr
                      </div>
                      <Badge variant="outline" className={getConfidenceColor(material.confidence)}>
                        {Math.round(material.confidence * 100)}%
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Price Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Prissammensætning</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Materialer (ekskl. moms)</span>
                  <span>{analysis.price_breakdown.materials_ex_vat.toLocaleString('da-DK')} kr</span>
                </div>
                <div className="flex justify-between">
                  <span>Arbejdsløn (ekskl. moms)</span>
                  <span>{analysis.price_breakdown.labor_ex_vat.toLocaleString('da-DK')} kr</span>
                </div>
                <div className="flex justify-between">
                  <span>Servicevogn (ekskl. moms)</span>
                  <span>{analysis.price_breakdown.service_van_ex_vat.toLocaleString('da-DK')} kr</span>
                </div>
                <hr />
                <div className="flex justify-between font-semibold text-lg">
                  <span>Total (ekskl. moms)</span>
                  <span>{analysis.price_breakdown.total_ex_vat.toLocaleString('da-DK')} kr</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Explanations */}
          {analysis.explanations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>AI Forklaringer</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {analysis.explanations.map((explanation, index) => (
                    <li key={index} className="text-sm flex items-start gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                      <span>{explanation}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Link to view actual quote */}
          {analysis.quoteId && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-4">
                    Et faktisk tilbud er blevet oprettet med alle materialedetaljer
                  </p>
                  <Button 
                    onClick={() => {
                      // Switch to dashboard tab and trigger refresh
                      const dashboardTab = document.querySelector('[value="dashboard"]');
                      if (dashboardTab) {
                        (dashboardTab as HTMLElement).click();
                        setTimeout(() => window.location.reload(), 100);
                      }
                    }}
                    className="w-full"
                    variant="default"
                  >
                    Vis Detaljeret Tilbud med Materialelinjer
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}