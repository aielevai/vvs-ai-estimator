import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { 
  Brain, 
  Calculator, 
  CheckCircle, 
  Edit2,
  Trash2,
  Plus,
  Sparkles,
  AlertCircle,
  TrendingUp
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/valentin-config";
import QuoteChatAssistant from "./QuoteChatAssistant";

interface SmartQuoteWizardProps {
  caseData: any;
  existingQuote?: any;
  onComplete: () => void;
  onCancel: () => void;
}

type WizardStep = 'analyzing' | 'review' | 'materials' | 'final';

export default function SmartQuoteWizard({ caseData, existingQuote, onComplete, onCancel }: SmartQuoteWizardProps) {
  const [step, setStep] = useState<WizardStep>(existingQuote ? 'review' : 'analyzing');
  const [analysis, setAnalysis] = useState<any>(null);
  const [hours, setHours] = useState<number>(existingQuote?.labor_hours || 0);
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (existingQuote) {
      // Load existing quote data
      const existingMaterials = existingQuote.quote_lines
        ?.filter((line: any) => line.line_type === 'material')
        .map((line: any) => ({
          supplier_item_id: line.material_code || '',
          description: line.description,
          quantity: line.quantity,
          unit: 'stk',
          unit_price: line.unit_price,
          total_price: line.total_price
        })) || [];
      
      setMaterials(existingMaterials);
      setHours(existingQuote.labor_hours || 8);
      
      // Set a mock analysis for UI display
      setAnalysis({
        project: { type: 'Redigering', complexity: 'medium', estimated_size: 0, size_unit: 'm2' }
      });
    } else {
      runAnalysis();
    }
  }, [existingQuote]);

  const runAnalysis = async () => {
    setLoading(true);
    try {
      // Step 1: AI Analysis
      const analyzeResponse = await fetch('https://xrvmjrrcdfvrhfzknlku.supabase.co/functions/v1/analyze-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhydm1qcnJjZGZ2cmhmemtubGt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4MDMwMzgsImV4cCI6MjA3MzM3OTAzOH0.T3HjMBptCVyHB-lDc8Lnr3xLndurh3f6c38JLJ50fL0`
        },
        body: JSON.stringify({
          emailContent: caseData.description,
          subject: caseData.subject
        })
      });

      if (!analyzeResponse.ok) throw new Error('Analysis failed');
      const analysisResult = await analyzeResponse.json();
      
      setAnalysis(analysisResult);
      setHours(analysisResult.pricing_hints?.base_hours_estimate || 20);
      
      // Step 2: Get AI material suggestions
      const materialResponse = await fetch('https://xrvmjrrcdfvrhfzknlku.supabase.co/functions/v1/material-lookup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhydm1qcnJjZGZ2cmhmemtubGt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4MDMwMzgsImV4cCI6MjA3MzM3OTAzOH0.T3HjMBptCVyHB-lDc8Lnr3xLndurh3f6c38JLJ50fL0`
        },
        body: JSON.stringify({
          projectType: analysisResult.project.type,
          projectDescription: analysisResult.project.description,
          estimatedSize: analysisResult.project.estimated_size,
          complexity: analysisResult.project.complexity,
          materialeAnalyse: analysisResult.materiale_analyse
        })
      });

      if (materialResponse.ok) {
        const materialData = await materialResponse.json();
        setMaterials(materialData.materials || []);
      }

      setStep('review');
    } catch (error) {
      console.error('Analysis error:', error);
      toast({
        title: "Analyse Fejl",
        description: "Kunne ikke analysere sagen",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleMaterialsUpdated = (newMaterials: any[]) => {
    setMaterials(prev => [...prev, ...newMaterials]);
  };

  const handleRemoveMaterial = (index: number) => {
    setMaterials(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateQuantity = (index: number, quantity: number) => {
    setMaterials(prev => prev.map((m, i) => 
      i === index 
        ? { ...m, quantity, total_price: quantity * m.unit_price }
        : m
    ));
  };

  const getTotalMaterialCost = () => {
    return materials.reduce((sum, m) => sum + (m.total_price || 0), 0);
  };

  const getTotalCost = () => {
    const laborCost = hours * 550;
    const serviceCar = 650; // Fixed proper service car cost
    const materialCost = getTotalMaterialCost();
    const subtotal = laborCost + serviceCar + materialCost;
    const vat = subtotal * 0.25;
    return {
      laborCost,
      serviceCar,
      materialCost,
      subtotal,
      vat,
      total: subtotal + vat
    };
  };

  const handleCreateQuote = async () => {
    setLoading(true);
    try {
      const costs = getTotalCost();
      
      // Import supabase at the top if needed
      const { supabase } = await import('@/integrations/supabase/client');

      if (existingQuote) {
        // UPDATE existing quote
        const { error: quoteError } = await supabase
          .from('quotes')
          .update({
            labor_hours: hours,
            subtotal: costs.subtotal,
            vat_amount: costs.vat,
            total_amount: costs.total,
            travel_cost: 0,
            service_vehicle_cost: costs.serviceCar,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingQuote.id);

        if (quoteError) throw quoteError;

        // Delete old quote lines
        const { error: deleteError } = await supabase
          .from('quote_lines')
          .delete()
          .eq('quote_id', existingQuote.id);

        if (deleteError) throw deleteError;

        // Create new quote lines
        const quoteLines = [
          {
            quote_id: existingQuote.id,
            line_type: 'labor',
            description: `Arbejde - ${analysis?.project?.type || 'VVS arbejde'}`,
            quantity: hours,
            unit_price: 550,
            total_price: costs.laborCost,
            labor_hours: hours,
            sort_order: 1
          },
          {
            quote_id: existingQuote.id,
            line_type: 'service_vehicle',
            description: 'Servicebil',
            quantity: 1,
            unit_price: costs.serviceCar,
            total_price: costs.serviceCar,
            sort_order: 2
          },
          ...materials.map((m, idx) => ({
            quote_id: existingQuote.id,
            line_type: 'material' as const,
            description: m.description,
            quantity: m.quantity,
            unit_price: m.unit_price,
            total_price: m.total_price,
            material_code: m.supplier_item_id,
            sort_order: idx + 3
          }))
        ];

        const { error: linesError } = await supabase
          .from('quote_lines')
          .insert(quoteLines);

        if (linesError) throw linesError;

        toast({
          title: "✅ Tilbud Opdateret",
          description: "Tilbuddet er blevet opdateret"
        });
      } else {
        // CREATE new quote
        const quoteNumber = `VVS-${Date.now().toString().slice(-6)}`;
        
        const { data: quote, error: quoteError } = await supabase
          .from('quotes')
          .insert({
            case_id: caseData.id,
            quote_number: quoteNumber,
            subtotal: costs.subtotal,
            vat_amount: costs.vat,
            total_amount: costs.total,
            labor_hours: hours,
            travel_cost: 0,
            service_vehicle_cost: costs.serviceCar,
            status: 'draft',
            valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
          })
          .select()
          .single();

        if (quoteError) throw quoteError;

        // Create quote lines
        const quoteLines = [
          {
            quote_id: quote.id,
            line_type: 'labor',
            description: `Arbejde - ${analysis.project.type}`,
            quantity: hours,
            unit_price: 550,
            total_price: costs.laborCost,
            labor_hours: hours,
            sort_order: 1
          },
          {
            quote_id: quote.id,
            line_type: 'service_vehicle',
            description: 'Servicebil',
            quantity: 1,
            unit_price: costs.serviceCar,
            total_price: costs.serviceCar,
            sort_order: 2
          },
          ...materials.map((m, idx) => ({
            quote_id: quote.id,
            line_type: 'material' as const,
            description: m.description,
            quantity: m.quantity,
            unit_price: m.unit_price,
            total_price: m.total_price,
            material_code: m.supplier_item_id,
            sort_order: idx + 3
          }))
        ];

        const { error: linesError } = await supabase
          .from('quote_lines')
          .insert(quoteLines);

        if (linesError) throw linesError;

        // Update case status
        await supabase
          .from('cases')
          .update({ status: 'quoted' })
          .eq('id', caseData.id);

        toast({
          title: "✅ Tilbud Oprettet",
          description: `Tilbud ${quoteNumber} er gemt som draft`
        });
      }

      onComplete();
    } catch (error) {
      console.error('Quote creation error:', error);
      toast({
        title: "Fejl",
        description: existingQuote ? "Kunne ikke opdatere tilbud" : "Kunne ikke oprette tilbud",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getProgressValue = () => {
    switch (step) {
      case 'analyzing': return 25;
      case 'review': return 50;
      case 'materials': return 75;
      case 'final': return 100;
      default: return 0;
    }
  };

  if (step === 'analyzing') {
    return (
      <Card className="vvs-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 animate-pulse text-primary" />
            AI Analyserer Sagen...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={25} className="mb-4" />
          <p className="text-muted-foreground text-sm">
            Analyserer projekttype, kompleksitet og materialer...
          </p>
        </CardContent>
      </Card>
    );
  }

  const costs = getTotalCost();

  return (
    <div className="space-y-6">
      <Card className="vvs-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Smart Tilbud Generator</CardTitle>
            <Progress value={getProgressValue()} className="w-32" />
          </div>
        </CardHeader>
      </Card>

      {/* Analysis Results */}
      {analysis && (
        <Card className="vvs-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              AI Analyse Færdig
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Projekttype</p>
                <p className="font-medium">{analysis.project.type}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Størrelse</p>
                <p className="font-medium">
                  {typeof analysis.project.estimated_size === 'object' && analysis.project.estimated_size
                    ? `${analysis.project.estimated_size.value} ${analysis.project.estimated_size.unit}`
                    : `${analysis.project.estimated_size} ${analysis.project.size_unit}`}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Kompleksitet</p>
                <Badge>{analysis.project.complexity}</Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Estimerede timer</p>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={hours}
                    onChange={(e) => setHours(Number(e.target.value))}
                    className="w-20 h-8"
                  />
                  <Edit2 className="h-3 w-3 text-muted-foreground" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Materials Section with Chat */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Selected Materials */}
        <Card className="vvs-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Valgte Materialer ({materials.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {materials.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                <p>Ingen materialer valgt endnu</p>
                <p className="text-xs mt-1">Brug AI assistenten til at finde materialer</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {materials.map((material, idx) => (
                  <div key={idx} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{material.description}</p>
                        <p className="text-xs text-muted-foreground">{material.supplier_item_id}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoveMaterial(idx)}
                        className="h-6 w-6 p-0"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Input
                        type="number"
                        value={material.quantity}
                        onChange={(e) => handleUpdateQuantity(idx, Number(e.target.value))}
                        className="w-16 h-7"
                      />
                      <span className="text-muted-foreground">×</span>
                      <span>{material.unit_price} kr</span>
                      <span className="text-muted-foreground">=</span>
                      <Badge variant="secondary">{formatCurrency(material.total_price)}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            <Separator className="my-4" />
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Arbejde ({hours} timer)</span>
                <span className="font-medium">{formatCurrency(costs.laborCost)}</span>
              </div>
              <div className="flex justify-between">
                <span>Servicebil</span>
                <span className="font-medium">{formatCurrency(costs.serviceCar)}</span>
              </div>
              <div className="flex justify-between">
                <span>Materialer</span>
                <span className="font-medium">{formatCurrency(costs.materialCost)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-base font-bold">
                <span>Total (inkl. moms)</span>
                <span className="text-primary">{formatCurrency(costs.total)}</span>
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <Button 
                onClick={onCancel}
                variant="outline"
                className="flex-1"
              >
                Annuller
              </Button>
              <Button 
                onClick={handleCreateQuote}
                disabled={loading || materials.length === 0}
                className="flex-1 vvs-button-primary"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                {existingQuote ? 'Opdater Tilbud' : 'Opret Tilbud'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* AI Chat Assistant */}
        <QuoteChatAssistant
          caseId={caseData.id}
          projectType={analysis?.project?.type || 'unknown'}
          onMaterialsUpdated={handleMaterialsUpdated}
        />
      </div>
    </div>
  );
}
