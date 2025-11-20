import { useState, useEffect, useRef } from 'react';
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
import { supabase } from "@/integrations/supabase/client";
import { edgeInvoke, withRetry } from "@/lib/edgeInvoke";

interface SmartQuoteWizardProps {
  caseData: any;
  existingQuote?: any;
  onComplete: () => void;
  onCancel: () => void;
}

type WizardStep = 'analyzing' | 'review' | 'materials' | 'final' | 'error';

interface WizardState {
  caseId: string;
  step: WizardStep;
  snapshot?: any;
  error?: string;
}

const LS_KEY = (caseId: string) => `smart-quote-wizard:${caseId}`;

export default function SmartQuoteWizard({ caseData, existingQuote, onComplete, onCancel }: SmartQuoteWizardProps) {
  const [step, setStep] = useState<WizardStep>(existingQuote ? 'review' : 'analyzing');
  const [analysis, setAnalysis] = useState<any>(null);
  const [hours, setHours] = useState<number>(existingQuote?.labor_hours || 0);
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<'idle'|'analyzing'|'pricing'|'saving'|'done'|'error'>('idle');
  const [serverQuote, setServerQuote] = useState<any>(null);
  const busyRef = useRef(false);
  const { toast } = useToast();
  
  busyRef.current = loading || isGenerating;

  // localStorage persistence
  const saveState = (partial: Partial<WizardState>) => {
    const prev = loadState();
    const next = { ...prev, caseId: caseData.id, ...partial } as WizardState;
    localStorage.setItem(LS_KEY(caseData.id), JSON.stringify(next));
  };

  const loadState = (): WizardState | null => {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY(caseData.id)) || "null");
    } catch {
      return null;
    }
  };

  const resetWizard = () => {
    setStep('analyzing');
    setServerQuote(null);
    setAnalysis(null);
    setMaterials([]);
    localStorage.removeItem(LS_KEY(caseData.id));
  };

  // Gendan state ved mount
  useEffect(() => {
    const restored = loadState();
    if (restored && restored.caseId === caseData.id && !existingQuote) {
      setStep(restored.step);
      if (restored.snapshot) {
        setAnalysis(restored.snapshot.analysis ?? null);
        setMaterials(restored.snapshot.materials ?? []);
        setServerQuote(restored.snapshot.serverQuote ?? null);
      }
    }
  }, [caseData.id]);

  // Advar ved utilsigtet navigation
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (busyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  // Bevar state ved popstate (browser tilbage-knap)
  useEffect(() => {
    const onPop = () => {
      const s = loadState();
      if (s && s.caseId === caseData.id) {
        setStep(s.step);
        if (s.snapshot) {
          setAnalysis(s.snapshot.analysis ?? null);
          setMaterials(s.snapshot.materials ?? []);
          setServerQuote(s.snapshot.serverQuote ?? null);
        }
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [caseData.id]);

  useEffect(() => {
    if (existingQuote) {
      // Load existing quote data
      const existingMaterials = existingQuote.quote_lines
        ?.filter((line: any) => line.line_type === 'material')
        .map((line: any) => ({
          supplier_item_id: line.material_code || '',
          description: line.description,
          quantity: line.quantity,
          unit: line.unit || 'stk',
          unit_price: line.unit_price,
          total_price: line.total_price
        })) || [];
      
      setMaterials(existingMaterials);
      setHours(existingQuote.labor_hours || 8);
      
      // Use actual values from case/quote for accurate floor calculation
      const inferredType = 
        caseData?.extracted_data?.project?.type || 
        existingQuote?.metadata?.project_type || 
        'bathroom_renovation';
      
      const inferredSize = Number(
        caseData?.extracted_data?.project?.estimated_size?.value ?? 
        caseData?.extracted_data?.project?.estimated_size ??
        existingQuote?.metadata?.estimated_size ?? 0
      );
      
      setAnalysis({
        project: { 
          type: inferredType, 
          complexity: caseData?.extracted_data?.project?.complexity || 'medium', 
          estimated_size: inferredSize, 
          size_unit: 'm2' 
        }
      });
    } else {
      runAnalysis();
    }
  }, [existingQuote]);

  const runAnalysis = async () => {
    setLoading(true);
    setStep('analyzing');
    saveState({ step: 'analyzing', error: undefined });
    
    try {
      // Step 1: AI Analysis med retry
      const analysisResult = await withRetry(
        () => edgeInvoke<any>(supabase, 'analyze-email', {
          emailContent: caseData.description,
          subject: caseData.subject,
          caseId: caseData.id
        }),
        1
      );
      
      setAnalysis(analysisResult);
      setHours(analysisResult.pricing_hints?.base_hours_estimate || 20);
      
      // Step 2: Material lookup med retry
      const materialResult = await withRetry(
        () => edgeInvoke<any>(supabase, 'material-lookup', {
          projectType: analysisResult.project.type,
          projectDescription: analysisResult.project.description,
          estimatedSize: Number(analysisResult.project?.estimated_size?.value ?? analysisResult.project?.estimated_size ?? 1),
          complexity: analysisResult.project.complexity,
          signals: analysisResult.signals ?? {},
          materialeAnalyse: analysisResult.materiale_analyse
        }),
        1
      );

      const mats = materialResult.materials_net ?? materialResult.materials ?? [];
      setMaterials(mats);

      saveState({ 
        step: 'review', 
        snapshot: { analysis: analysisResult, materials: mats } 
      });
      setStep('review');
      
      toast({ 
        title: "✅ Analyse fuldført",
        description: `Fandt ${mats.length} materialer`
      });
      
    } catch (error: any) {
      console.error('❌ Analysis error:', error);
      setStep('error');
      saveState({ step: 'error', error: error?.message });
      toast({
        title: "Analyse Fejl",
        description: error.message || "Kunne ikke analysere sagen",
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


  const handleCreateQuote = async () => {
    setIsGenerating(true);
    setGenerationStep('analyzing');
    saveState({ step: 'review' });
    
    try {
      // 1) Analyse med retry
      const analysisResult = await withRetry(
        () => edgeInvoke<any>(supabase, 'analyze-email', {
          emailContent: caseData.description || caseData.email_content,
          subject: caseData.subject,
          caseId: caseData.id
        }),
        1
      );

      setGenerationStep('pricing');

      // 2) Beregn tilbud med analyse-data (så calculate-quote ikke skal hente fra DB)
      const quoteResult = await withRetry(
        () => edgeInvoke<any>(supabase, 'calculate-quote', { 
          caseId: caseData.id,
          project_type: analysisResult.project.type,
          estimatedSize: Number(
            analysisResult.project.estimated_size?.value ?? 
            analysisResult.project.estimated_size ?? 
            1
          ),
          signals: analysisResult.signals ?? {}
        }),
        1
      );

      setGenerationStep('saving');
      setServerQuote(quoteResult.quote ?? null);
      
      if (typeof quoteResult.laborHours === 'number') {
        setHours(quoteResult.laborHours);
      }
      
      saveState({ 
        step: 'review', 
        snapshot: { 
          analysis: analysisResult, 
          materials, 
          serverQuote: quoteResult.quote 
        } 
      });
      
      setGenerationStep('done');

      const lineCount = Array.isArray(quoteResult.lines) ? quoteResult.lines.length : 0;
      const total = quoteResult.total ?? quoteResult.quote?.total ?? 0;

      toast({
        title: "✅ Tilbud Genereret",
        description: `Oprettet med ${lineCount} linjer (${total.toLocaleString('da-DK')} kr)`
      });

      await onComplete();
      
    } catch (error: any) {
      console.error('❌ Quote creation error:', error);
      setStep('error');
      setGenerationStep('error');
      saveState({ step: 'error', error: error?.message });
      toast({
        title: "Fejl ved generering",
        description: error.message || "Kunne ikke generere tilbud",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
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

  if (step === 'error') {
    return (
      <Card className="vvs-card border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            Der opstod en fejl
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Tilbudsgenerering fejlede. Din tilstand er gemt - du kan prøve igen.
          </p>
          <div className="flex gap-2">
            <Button 
              onClick={runAnalysis}
              disabled={loading}
              className="flex-1 vvs-button-primary"
            >
              <Brain className="h-4 w-4 mr-2" />
              Prøv igen
            </Button>
            <Button 
              onClick={resetWizard}
              variant="outline"
              className="flex-1"
            >
              Start forfra
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

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
                      <span>
                        {material.unit_price || material.net_unit_price || 0} kr
                      </span>
                      <span className="text-muted-foreground">=</span>
                      <Badge variant="secondary">
                        {formatCurrency(material.total_price || material.net_total_price || 0)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            <Separator className="my-4" />
            
            <div className="space-y-2 text-sm">
              {serverQuote ? (
                <>
                  <p className="text-xs text-green-600 mb-2">✅ Server-beregnet pris:</p>
                  <div className="flex justify-between">
                    <span>Timer:</span>
                    <span className="font-medium">{serverQuote.labor_hours?.toFixed(1) || '0.0'} t</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Arbejde:</span>
                    <span className="font-medium">
                      {formatCurrency(serverQuote.quote_lines?.find((l: any) => l.line_type === 'labor')?.total_price || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Servicevogn:</span>
                    <span className="font-medium">
                      {formatCurrency(serverQuote.quote_lines?.find((l: any) => l.line_type === 'service_vehicle')?.total_price || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Materialer:</span>
                    <span className="font-medium">
                      {formatCurrency(
                        serverQuote.quote_lines
                          ?.filter((l: any) => l.line_type === 'material')
                          .reduce((sum: number, l: any) => sum + (l.total_price || 0), 0) || 0
                      )}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-base font-bold">
                    <span>Total (inkl. moms)</span>
                    <span className="text-primary">{formatCurrency(serverQuote.total || 0)}</span>
                  </div>
                </>
              ) : (
                <div className="text-center text-muted-foreground py-4">
                  <p className="text-sm">Klik 'Beregn Tilbud' for at få præcis pris fra serveren</p>
                </div>
              )}
            </div>

            {isGenerating && (
              <div className="text-sm text-muted-foreground mb-4 p-3 bg-muted rounded-lg">
                {generationStep === 'analyzing' && '🔍 Analyserer henvendelsen...'}
                {generationStep === 'pricing' && '💰 Beregner timer, BOM, avance og gulv...'}
                {generationStep === 'saving' && '💾 Gemmer tilbud og linjer...'}
                {generationStep === 'done' && '✅ Færdig!'}
                {generationStep === 'error' && '❌ Fejl under generering'}
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <Button 
                onClick={onCancel}
                variant="outline"
                className="flex-1"
                disabled={isGenerating}
              >
                Annuller
              </Button>
              <Button 
                onClick={handleCreateQuote}
                disabled={isGenerating}
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
