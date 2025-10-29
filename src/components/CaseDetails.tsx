import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Case } from "@/types";
import { formatDate, formatCurrency, getProjectTypeLabel } from "@/lib/valentin-config";
import { db } from "@/lib/supabase-client";
import { ArrowLeft, Brain, Calculator, CheckCircle, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import QuoteViewer from "./QuoteViewer";
import SmartQuoteWizard from "./SmartQuoteWizard";
import { supabase } from "@/integrations/supabase/client";

interface CaseDetailsProps {
  case: Case;
  onBack: () => void;
  onUpdate: () => void;
}

export default function CaseDetails({ case: caseData, onBack, onUpdate }: CaseDetailsProps) {
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const { toast } = useToast();
  
  const hasDraftQuote = caseData.quotes?.some(q => q.status === 'draft');
  const draftQuote = caseData.quotes?.find(q => q.status === 'draft');

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      // 1) Kald analyze-email
      const analyzeRes = await supabase.functions.invoke('analyze-email', {
        body: {
          emailContent: caseData.description || caseData.email_content,
          subject: caseData.subject,
          caseId: caseData.id
        }
      });

      if (analyzeRes.error) {
        throw new Error(analyzeRes.error.message || 'Analyse fejlede');
      }

      const analysisResult = analyzeRes.data;

      // 2) Gem extracted_data på casen
      await db.updateCase(caseData.id, {
        extracted_data: analysisResult,
        status: 'analyzed'
      });

      toast({
        title: "✅ AI Analyse Færdig",
        description: "Beregner nu tilbud..."
      });

      // 3) Kald automatisk calculate-quote
      const quoteRes = await supabase.functions.invoke('calculate-quote', {
        body: { caseId: caseData.id }
      });

      if (quoteRes.error) {
        throw new Error(quoteRes.error.message || 'Tilbudsberegning fejlede');
      }

      const quoteResult = quoteRes.data;

      // Standardiserede feltnavne fra backend
      const lineCount = Array.isArray(quoteResult.lines) ? quoteResult.lines.length : 0;
      const total = quoteResult.total ?? quoteResult.quote?.total ?? 0;

      toast({
        title: "✅ Analyse + Tilbud Klar",
        description: `Oprettet med ${lineCount} linjer (${total.toLocaleString('da-DK')} kr)`
      });

      // 4) Hent opdateret case-data og vis tilbud
      onUpdate();
    } catch (error: any) {
      console.error('Analysis/Quote error:', error);
      toast({
        title: "Fejl",
        description: error.message || "Kunne ikke analysere sagen",
        variant: "destructive"
      });
    } finally {
      setAnalyzing(false);
    }
  };


  const hasQuote = caseData.quotes && caseData.quotes.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="vvs-header text-white py-6">
        <div className="vvs-container">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onBack}
              className="text-white hover:bg-white/20"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Tilbage
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{caseData.subject || 'Sag Detaljer'}</h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge className={`vvs-status-${caseData.status}`}>
                  {caseData.status}
                </Badge>
                {caseData.urgency !== 'normal' && (
                  <Badge className={`vvs-urgency-${caseData.urgency}`}>
                    {caseData.urgency}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="vvs-container py-8 space-y-6">
        {/* Case Information */}
        <Card>
          <CardHeader>
            <CardTitle>Sag Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Beskrivelse</h4>
              <p className="text-muted-foreground">{caseData.description}</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-medium mb-1">Oprettet</h4>
                <p className="text-sm text-muted-foreground">{formatDate(caseData.created_at)}</p>
              </div>
              
              {caseData.address && (
                <div>
                  <h4 className="font-medium mb-1">Adresse</h4>
                  <p className="text-sm text-muted-foreground">{caseData.address}</p>
                </div>
              )}
            </div>

            <Separator />

            <div className="flex gap-3">
              {!hasQuote && (
                <Button 
                  onClick={() => setShowWizard(true)} 
                  className="vvs-button-primary"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Start Smart Tilbud Generator
                </Button>
              )}

              {hasDraftQuote && !showWizard && (
                <Button 
                  onClick={() => setShowWizard(true)} 
                  variant="outline"
                >
                  <Calculator className="h-4 w-4 mr-2" />
                  Rediger Draft
                </Button>
              )}

              {hasQuote && !hasDraftQuote && (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">Tilbud genereret</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* AI Analysis Results */}
        {caseData.extracted_data && (
          <Card>
            <CardHeader>
              <CardTitle>AI Analyse Resultat</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {caseData.extracted_data.customer && (
                <div>
                  <h4 className="font-medium mb-2">Kunde Information</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    {caseData.extracted_data.customer.name && (
                      <div><span className="font-medium">Navn:</span> {caseData.extracted_data.customer.name}</div>
                    )}
                    {caseData.extracted_data.customer.email && (
                      <div><span className="font-medium">Email:</span> {caseData.extracted_data.customer.email}</div>
                    )}
                    {caseData.extracted_data.customer.phone && (
                      <div><span className="font-medium">Telefon:</span> {caseData.extracted_data.customer.phone}</div>
                    )}
                    {caseData.extracted_data.customer.customer_type && (
                      <div><span className="font-medium">Type:</span> {caseData.extracted_data.customer.customer_type}</div>
                    )}
                  </div>
                </div>
              )}

              {caseData.extracted_data.project && (
                <div>
                  <h4 className="font-medium mb-2">Projekt Detaljer</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    <div><span className="font-medium">Type:</span> {getProjectTypeLabel(caseData.extracted_data.project.type)}</div>
                    <div>
                      <span className="font-medium">Størrelse:</span> {
                        typeof caseData.extracted_data.project.estimated_size === 'object' && caseData.extracted_data.project.estimated_size
                          ? `${(caseData.extracted_data.project.estimated_size as any).value} ${(caseData.extracted_data.project.estimated_size as any).unit}` 
                          : `${caseData.extracted_data.project.estimated_size || ''} ${caseData.extracted_data.project.size_unit || ''}`
                      }
                    </div>
                    <div><span className="font-medium">Kompleksitet:</span> {caseData.extracted_data.project.complexity}</div>
                    <div><span className="font-medium">Hastende:</span> {caseData.extracted_data.project.urgency}</div>
                  </div>
                  {caseData.extracted_data.project.description && (
                    <div className="mt-2">
                      <span className="font-medium">Beskrivelse:</span>
                      <p className="text-muted-foreground mt-1">{caseData.extracted_data.project.description}</p>
                    </div>
                  )}
                </div>
              )}

              {caseData.extracted_data.pricing_hints && (
                <div>
                  <h4 className="font-medium mb-2">Prisberegning Hints</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                    <div><span className="font-medium">Estimerede timer:</span> {caseData.extracted_data.pricing_hints.base_hours_estimate}</div>
                    <div><span className="font-medium">Kompleksitet multiplikator:</span> {caseData.extracted_data.pricing_hints.complexity_multiplier}x</div>
                    <div><span className="font-medium">Materiale kompleksitet:</span> {caseData.extracted_data.pricing_hints.material_complexity}</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Smart Quote Wizard */}
        {showWizard && (
          <SmartQuoteWizard
            caseData={caseData}
            existingQuote={draftQuote}
            onComplete={() => {
              setShowWizard(false);
              onUpdate();
            }}
            onCancel={() => setShowWizard(false)}
          />
        )}

        {/* Quote Viewer */}
        {hasQuote && (
          <QuoteViewer 
            quote={caseData.quotes![0]} 
            onUpdate={onUpdate}
          />
        )}
      </div>
    </div>
  );
}