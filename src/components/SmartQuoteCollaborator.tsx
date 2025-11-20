import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Brain, Clock, Package, DollarSign, 
  CheckCircle2, AlertCircle, Star,
  FileText, Send
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import MaterialSelectionWizard from './MaterialSelectionWizard';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SmartQuoteCollaboratorProps {
  onQuoteGenerated?: (quoteId: string, caseId: string) => void;
}

export default function SmartQuoteCollaborator({ onQuoteGenerated }: SmartQuoteCollaboratorProps) {
  const [step, setStep] = useState<'description' | 'hours' | 'materials' | 'review' | 'complete'>('description');
  const [projectDescription, setProjectDescription] = useState('');
  const [emailAnalysis, setEmailAnalysis] = useState<any>(null);
  const [aiSuggestedHours, setAiSuggestedHours] = useState<number>(0);
  const [userHours, setUserHours] = useState<number>(0);
  const [materials, setMaterials] = useState<any[]>([]);
  const [materialCost, setMaterialCost] = useState<number>(0);
  const [caseId, setCaseId] = useState<string>('');
  const [quoteId, setQuoteId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
  const [userSatisfaction, setUserSatisfaction] = useState<number>(5);
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const { toast } = useToast();

  const analyzeProject = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-email', {
        body: { 
          subject: 'Smart Quote',
          content: projectDescription
        }
      });

      if (error) throw error;

      setEmailAnalysis(data);
      
      // Get AI hour suggestion
      const suggestedHours = data.pricing_hints?.base_hours_estimate || 4;
      setAiSuggestedHours(suggestedHours);
      setUserHours(suggestedHours);

      setStep('hours');
      
      toast({
        title: "Analyse klar",
        description: "AI har analyseret projektet"
      });
    } catch (error) {
      console.error('Analysis error:', error);
      toast({
        title: "Analyse fejl",
        description: "Kunne ikke analysere projekt",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const confirmHours = () => {
    setStep('materials');
  };

  const handleMaterialsConfirmed = (selectedMaterials: any[], totalCost: number) => {
    setMaterials(selectedMaterials);
    setMaterialCost(totalCost);
    setStep('review');
  };

  const generateQuote = async () => {
    setLoading(true);
    try {
      // Create case
      const { data: newCase, error: caseError } = await supabase
        .from('cases')
        .insert({
          subject: 'Smart Quote',
          description: projectDescription,
          extracted_data: emailAnalysis,
          status: 'analyzed'
        })
        .select()
        .single();

      if (caseError) throw caseError;
      setCaseId(newCase.id);

      // Calculate totals
      const laborCost = userHours * 550;
      const serviceCost = 65;
      const subtotal = laborCost + materialCost + serviceCost;
      const vat = subtotal * 0.25;
      const total = subtotal + vat;

      // Create quote
      const { data: quote, error: quoteError } = await supabase
        .from('quotes')
        .insert({
          case_id: newCase.id,
          labor_hours: userHours,
          travel_cost: 0,
          service_vehicle_cost: serviceCost,
          subtotal: subtotal,
          vat_amount: vat,
          total_amount: total,
          status: 'draft'
        })
        .select()
        .single();

      if (quoteError) throw quoteError;
      setQuoteId(quote.id);

      // Create quote lines
      const lines = [
        {
          quote_id: quote.id,
          line_type: 'labor',
          description: `VVS arbejde (${userHours} timer)`,
          quantity: userHours,
          unit_price: 550,
          total_price: laborCost,
          sort_order: 1
        },
        ...materials.map((m, idx) => ({
          quote_id: quote.id,
          line_type: 'material',
          description: m.description,
          quantity: m.quantity,
          unit_price: m.unit_price,
          total_price: m.total_price,
          material_code: m.supplier_item_id,
          sort_order: idx + 2
        })),
        {
          quote_id: quote.id,
          line_type: 'service_vehicle',
          description: 'Servicevogn',
          quantity: 1,
          unit_price: serviceCost,
          total_price: serviceCost,
          sort_order: materials.length + 2
        }
      ];

      const { error: linesError } = await supabase
        .from('quote_lines')
        .insert(lines);

      if (linesError) throw linesError;

      // Save feedback data for learning
      await supabase.from('quote_feedback').insert({
        quote_id: quote.id,
        case_id: newCase.id,
        ai_suggested_hours: aiSuggestedHours,
        ai_suggested_materials: materials,
        ai_confidence: 0.75,
        user_final_hours: userHours,
        user_final_materials: materials,
        user_modifications: {
          hours_changed: aiSuggestedHours !== userHours,
          materials_modified: materials.some(m => m.user_modified)
        }
      });

      setStep('complete');
      setShowFeedbackDialog(true);

      if (onQuoteGenerated) {
        onQuoteGenerated(quote.id, newCase.id);
      }

      toast({
        title: "Tilbud oprettet!",
        description: `Tilbud ${quote.quote_number || quote.id} er klar`
      });
    } catch (error) {
      console.error('Quote generation error:', error);
      toast({
        title: "Fejl",
        description: "Kunne ikke oprette tilbud",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const submitFeedback = async () => {
    try {
      await supabase
        .from('quote_feedback')
        .update({
          user_satisfaction: userSatisfaction,
          notes: feedbackNotes
        })
        .eq('quote_id', quoteId);

      setShowFeedbackDialog(false);
      
      toast({
        title: "Tak for feedback!",
        description: "Din feedback hjælper systemet med at blive bedre"
      });
    } catch (error) {
      console.error('Feedback error:', error);
    }
  };

  const getProgressValue = () => {
    switch (step) {
      case 'description': return 25;
      case 'hours': return 50;
      case 'materials': return 75;
      case 'review': return 90;
      case 'complete': return 100;
      default: return 0;
    }
  };

  return (
    <div className="space-y-6">
      {/* Progress Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Tilbuds Progress</span>
              <span className="text-muted-foreground">{getProgressValue()}%</span>
            </div>
            <Progress value={getProgressValue()} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Beskrivelse</span>
              <span>Timer</span>
              <span>Materialer</span>
              <span>Gennemgang</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 1: Project Description */}
      {step === 'description' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Projekt Beskrivelse
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Beskriv VVS-projektet i detaljer
              </label>
              <Textarea
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                placeholder="F.eks: Renovering af badeværelse, 12m², med nyt toilet, bruser, og håndvask..."
                className="min-h-[150px]"
              />
            </div>
            
            <Button 
              onClick={analyzeProject}
              disabled={!projectDescription.trim() || loading}
              className="w-full"
            >
              <Brain className="mr-2 h-4 w-4" />
              Næste: AI Analyse
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Hours Estimation */}
      {step === 'hours' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Time Estimering
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="border rounded-lg p-4 bg-blue-50">
                <div className="text-sm text-muted-foreground mb-1">AI Forslag</div>
                <div className="text-2xl font-bold flex items-center gap-2">
                  {aiSuggestedHours} timer
                  <Brain className="h-5 w-5 text-blue-600" />
                </div>
              </div>
              
              <div className="border rounded-lg p-4">
                <div className="text-sm text-muted-foreground mb-1">Din Justering</div>
                <Input
                  type="number"
                  value={userHours}
                  onChange={(e) => setUserHours(parseFloat(e.target.value) || 0)}
                  min="0.5"
                  step="0.5"
                  className="text-xl font-bold"
                />
              </div>
            </div>

            {aiSuggestedHours !== userHours && (
              <div className="flex items-start gap-2 p-3 bg-yellow-50 rounded-lg">
                <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  Du har justeret AI's forslag. Systemet lærer af dine justeringer over tid.
                </div>
              </div>
            )}

            <div className="text-sm text-muted-foreground">
              <div className="flex justify-between mb-1">
                <span>Arbejdsløn:</span>
                <span className="font-medium">{(userHours * 550).toLocaleString('da-DK')} kr</span>
              </div>
            </div>

            <Button onClick={confirmHours} className="w-full">
              <Package className="mr-2 h-4 w-4" />
              Næste: Vælg Materialer
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Material Selection */}
      {step === 'materials' && (
        <MaterialSelectionWizard
          projectDescription={projectDescription}
          projectType={emailAnalysis?.project?.type || 'service_call'}
          estimatedSize={emailAnalysis?.project?.estimated_size || 1}
          complexity={emailAnalysis?.project?.complexity || 'medium'}
          materialeAnalyse={emailAnalysis?.materiale_analyse}
          onMaterialsConfirmed={handleMaterialsConfirmed}
          onCancel={() => setStep('hours')}
        />
      )}

      {/* Step 4: Review */}
      {step === 'review' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              Gennemgang
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary */}
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Arbejdstimer
                </span>
                <span className="font-semibold">{userHours} timer</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Materialer
                </span>
                <span className="font-semibold">{materials.length} stk</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Materialepris
                </span>
                <span className="font-semibold">{materialCost.toLocaleString('da-DK')} kr</span>
              </div>
            </div>

            {/* Price Breakdown */}
            <div className="border-t pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Arbejdsløn:</span>
                <span>{(userHours * 550).toLocaleString('da-DK')} kr</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Materialer:</span>
                <span>{materialCost.toLocaleString('da-DK')} kr</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Servicevogn:</span>
                <span>65 kr</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Subtotal (ekskl. moms):</span>
                <span className="font-medium">{((userHours * 550) + materialCost + 65).toLocaleString('da-DK')} kr</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Moms (25%):</span>
                <span>{(((userHours * 550) + materialCost + 65) * 0.25).toLocaleString('da-DK')} kr</span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t pt-2">
                <span>Total (inkl. moms):</span>
                <span>{(((userHours * 550) + materialCost + 65) * 1.25).toLocaleString('da-DK')} kr</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => setStep('materials')} variant="outline" className="flex-1">
                Tilbage
              </Button>
              <Button onClick={generateQuote} disabled={loading} className="flex-1">
                {loading ? 'Opretter...' : 'Opret Tilbud'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 5: Complete */}
      {step === 'complete' && (
        <Card>
          <CardContent className="pt-6 text-center space-y-4">
            <div className="flex justify-center">
              <CheckCircle2 className="h-16 w-16 text-green-600" />
            </div>
            <div>
              <h3 className="text-2xl font-bold mb-2">Tilbud Oprettet!</h3>
              <p className="text-muted-foreground">
                Dit tilbud er nu klar til at blive sendt til kunden
              </p>
            </div>
            <Button onClick={() => window.location.reload()} className="w-full">
              <FileText className="mr-2 h-4 w-4" />
              Se Tilbud i Dashboard
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Feedback Dialog */}
      <Dialog open={showFeedbackDialog} onOpenChange={setShowFeedbackDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-5 w-5" />
              Hjælp systemet med at lære
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Hvor tilfreds er du med AI's forslag? (1-5)
              </label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((rating) => (
                  <Button
                    key={rating}
                    variant={userSatisfaction === rating ? "default" : "outline"}
                    onClick={() => setUserSatisfaction(rating)}
                    className="flex-1"
                  >
                    {rating}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">
                Kommentarer (valgfrit)
              </label>
              <Textarea
                value={feedbackNotes}
                onChange={(e) => setFeedbackNotes(e.target.value)}
                placeholder="Hvad kunne AI have gjort bedre?"
              />
            </div>

            <Button onClick={submitFeedback} className="w-full">
              <Send className="mr-2 h-4 w-4" />
              Send Feedback
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}