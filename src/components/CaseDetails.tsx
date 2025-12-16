import { useState, lazy, Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Case } from "@/types";
import { formatDate, formatCurrency, getProjectTypeLabel } from "@/lib/valentin-config";
import { db } from "@/lib/supabase-client";
import { ArrowLeft, CheckCircle, Loader2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Lazy load heavy components
const EnhancedQuoteViewer = lazy(() => import('./EnhancedQuoteViewer').then(m => ({ default: m.EnhancedQuoteViewer })));

interface CaseDetailsProps {
  case: Case;
  onBack: () => void;
  onUpdate: () => void;
}

export default function CaseDetails({ case: caseData, onBack, onUpdate }: CaseDetailsProps) {
  const { toast } = useToast();
  
  const hasQuote = caseData.quotes && caseData.quotes.length > 0;
  const processingStatus = (caseData as any).processing_status;
  const isProcessing = processingStatus && 
    processingStatus.step !== 'complete' && 
    processingStatus.step !== 'pending' &&
    processingStatus.step !== 'error';
  const isError = processingStatus?.step === 'error';

  return (
    <div className="min-h-screen bg-background">
      {/* Modern Header */}
      <header className="modern-header">
        <div className="vvs-container">
          <div className="flex items-center gap-4 fade-in">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onBack}
              className="text-background hover:bg-background/10"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Tilbage
            </Button>
            <div className="border-l border-background/20 pl-4">
              <h1 className="text-xl font-semibold truncate max-w-md">{caseData.subject || 'Sag Detaljer'}</h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge className={`vvs-status-${caseData.status} text-xs`}>
                  {caseData.status}
                </Badge>
                {caseData.urgency !== 'normal' && (
                  <Badge className={`vvs-urgency-${caseData.urgency} text-xs`}>
                    {caseData.urgency}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="vvs-container py-8 space-y-6">
        {/* Processing Status */}
        {isProcessing && (
          <div className="glow-card p-6 slide-up processing-glow">
            <div className="flex items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-foreground/70" />
              <div className="flex-1">
                <h3 className="font-semibold mb-1">Behandler sag...</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  {processingStatus.message || 'Arbejder på tilbud...'}
                </p>
                <div className="w-full bg-border rounded-full h-2">
                  <div 
                    className="bg-foreground h-2 rounded-full transition-all duration-500"
                    style={{ width: `${processingStatus.progress || 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error Status */}
        {isError && (
          <div className="glow-card p-6 slide-up border-destructive/20 bg-destructive/5">
            <div className="flex items-center gap-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <div className="flex-1">
                <h3 className="font-semibold mb-1 text-destructive">Fejl under behandling</h3>
                <p className="text-sm text-muted-foreground">
                  {processingStatus.message || 'Der opstod en fejl. Systemet vil automatisk prøve igen.'}
                </p>
                {processingStatus.retries && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Forsøg: {processingStatus.retries}/3
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Case Information */}
        <div className="glow-card p-6 slide-up">
          <h2 className="text-lg font-semibold mb-4">Sag Information</h2>
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1">Beskrivelse</h4>
              <p className="text-foreground">{caseData.description}</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">Oprettet</h4>
                <p className="text-sm">{formatDate(caseData.created_at)}</p>
              </div>
              
              {caseData.address && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Adresse</h4>
                  <p className="text-sm">{caseData.address}</p>
                </div>
              )}
            </div>

            <Separator />

            <div className="flex gap-3 flex-wrap">
              {hasQuote && (
                <div className="flex items-center gap-2 text-green-600 text-sm">
                  <CheckCircle className="h-4 w-4" />
                  <span className="font-medium">Tilbud genereret</span>
                </div>
              )}
              
              {!hasQuote && !isProcessing && !isError && (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4" />
                  <span>Afventer behandling...</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* AI Analysis Results */}
        {caseData.extracted_data && (
          <div className="glow-card p-6 slide-up" style={{ animationDelay: '100ms' }}>
            <h2 className="text-lg font-semibold mb-4">AI Analyse Resultat</h2>
            <div className="space-y-4">
              {caseData.extracted_data.customer && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Kunde Information</h4>
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
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Projekt Detaljer</h4>
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
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Prisberegning Hints</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                    <div><span className="font-medium">Estimerede timer:</span> {caseData.extracted_data.pricing_hints.base_hours_estimate}</div>
                    <div><span className="font-medium">Kompleksitet multiplikator:</span> {caseData.extracted_data.pricing_hints.complexity_multiplier}x</div>
                    <div><span className="font-medium">Materiale kompleksitet:</span> {caseData.extracted_data.pricing_hints.material_complexity}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Enhanced Quote Viewer with inline editing */}
        {hasQuote && (
          <Suspense fallback={<Skeleton className="h-96 w-full" />}>
            <EnhancedQuoteViewer 
              quote={caseData.quotes![0]} 
              pricingAnalysis={caseData.extracted_data}
              caseId={caseData.id}
              emailContent={caseData.email_content || caseData.description}
              onQuoteUpdate={async (updatedQuote) => {
                await db.updateQuote(updatedQuote.id, updatedQuote);
                onUpdate();
              }}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
