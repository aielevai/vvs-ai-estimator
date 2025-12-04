import React, { useState, useRef, useEffect } from 'react';
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertTriangle, Info, Bot, Trash2, Plus, Lightbulb, MessageSquare } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CorrectionDialog } from './CorrectionDialog';

interface EnhancedQuoteViewerProps {
  quote: any;
  pricingAnalysis?: any;
  onQuoteUpdate?: (updatedQuote: any) => void;
  caseId?: string;
  emailContent?: string;
}

export const EnhancedQuoteViewer: React.FC<EnhancedQuoteViewerProps> = ({ 
  quote: initialQuote, 
  pricingAnalysis,
  onQuoteUpdate,
  caseId,
  emailContent
}) => {
  const [quote, setQuote] = useState(initialQuote);
  const [isExplanationOpen, setIsExplanationOpen] = useState(false);
  const [showCorrectionDialog, setShowCorrectionDialog] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<any[]>([]);
  
  const originalValues = useRef({
    labor_hours: initialQuote?.labor_hours,
    subtotal: initialQuote?.subtotal
  });
  
  useEffect(() => {
    originalValues.current = {
      labor_hours: initialQuote?.labor_hours,
      subtotal: initialQuote?.subtotal
    };
    setQuote(initialQuote);
  }, [initialQuote?.id]);
  
  const checkForSignificantChanges = () => {
    const changes: any[] = [];
    
    if (quote.labor_hours !== originalValues.current.labor_hours) {
      changes.push({
        field: 'labor_hours',
        original_value: originalValues.current.labor_hours,
        new_value: quote.labor_hours,
        label: 'Arbejdstimer'
      });
    }
    
    const subtotalDiff = Math.abs(quote.subtotal - originalValues.current.subtotal) / originalValues.current.subtotal;
    if (subtotalDiff > 0.05 && changes.length === 0) {
      changes.push({
        field: 'subtotal',
        original_value: originalValues.current.subtotal,
        new_value: quote.subtotal,
        label: 'Subtotal'
      });
    }
    
    if (changes.length > 0) {
      setPendingChanges(changes);
      setShowCorrectionDialog(true);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('da-DK', {
      style: 'currency',
      currency: 'DKK',
    }).format(amount);
  };

  const getMaterialSourceBadge = (source: string) => {
    const sources = {
      'ai_optimized': { label: 'AI Optimeret', variant: 'default' as const, icon: Bot },
      'standard_estimate': { label: 'Standard Estimat', variant: 'secondary' as const, icon: Info },
      'fallback': { label: 'Fallback', variant: 'destructive' as const, icon: AlertTriangle }
    };
    
    const config = sources[source as keyof typeof sources] || sources.standard_estimate;
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant} className="flex items-center gap-1 text-xs">
        <Icon size={12} />
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Quote Header */}
      <div className="glow-card p-6 slide-up">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-lg font-semibold">Tilbud #{quote.quote_number}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Oprettet: {new Date(quote.created_at).toLocaleDateString('da-DK')}
              {quote.valid_until && ` • Gyldig til: ${new Date(quote.valid_until).toLocaleDateString('da-DK')}`}
            </p>
          </div>
          <Badge variant={quote.status === 'draft' ? 'secondary' : 'default'} className="text-xs">
            {quote.status}
          </Badge>
        </div>
      </div>

      {/* Pricing Analysis */}
      {pricingAnalysis && (
        <div className="glow-card p-6 slide-up" style={{ animationDelay: '50ms' }}>
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-muted rounded-lg">
              <Bot size={18} className="text-muted-foreground" />
            </div>
            <div>
              <h2 className="font-semibold">AI Prisanalyse</h2>
              <p className="text-sm text-muted-foreground">Detaljeret beregningsgrundlag</p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="text-xs text-muted-foreground">Projekttype</div>
              <div className="font-medium text-sm mt-1">
                {(pricingAnalysis?.project?.type || pricingAnalysis?.project_type || 'Ikke angivet').replace('_', ' ')}
              </div>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="text-xs text-muted-foreground">Størrelse</div>
              <div className="font-medium text-sm mt-1">
                {(() => {
                  const size = pricingAnalysis?.project?.estimated_size || pricingAnalysis?.estimated_size;
                  if (typeof size === 'object' && size?.value) {
                    return `${size.value} ${size.unit || 'm²'}`;
                  }
                  return size || 'Ikke angivet';
                })()}
              </div>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="text-xs text-muted-foreground">Kompleksitet</div>
              <div className="font-medium text-sm mt-1">
                {pricingAnalysis?.project?.complexity || pricingAnalysis?.complexity || 'Ikke angivet'}
              </div>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="text-xs text-muted-foreground">Timer total</div>
              <div className="font-medium text-sm mt-1">
                {quote.pricing_trace?.hours_calculation?.final || quote.labor_hours || pricingAnalysis?.laborHours || 0} timer
              </div>
            </div>
          </div>

          {pricingAnalysis.calibrationFactors && (
            <div className="space-y-2 p-4 bg-muted/30 rounded-lg">
              <div className="text-sm font-medium">Anvendte minimummer:</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                {pricingAnalysis.calibrationFactors.laborMinimumApplied && (
                  <div className="flex items-center gap-2 p-2 bg-background rounded-lg">
                    <Info className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs">
                      <strong>Arbejdstime minimum:</strong> {pricingAnalysis.calibrationFactors.minLaborHours} timer
                    </span>
                  </div>
                )}
                {pricingAnalysis.calibrationFactors.projectMinimumApplied && (
                  <div className="flex items-center gap-2 p-2 bg-background rounded-lg">
                    <Info className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs">
                      <strong>Projektminimum:</strong> 4.500 kr anvendt
                    </span>
                  </div>
                )}
                {!pricingAnalysis.calibrationFactors.laborMinimumApplied && 
                 !pricingAnalysis.calibrationFactors.projectMinimumApplied && (
                  <div className="text-xs text-muted-foreground col-span-2">
                    Ingen minimummer påvirker denne pris
                  </div>
                )}
              </div>
            </div>
          )}

          {pricingAnalysis.calibrationFactors?.materialSource && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm">Materialekilde:</span>
              <div className="flex items-center gap-2">
                {getMaterialSourceBadge(pricingAnalysis.calibrationFactors.materialSource)}
                {pricingAnalysis.material_validation > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {pricingAnalysis.material_validation}/{pricingAnalysis.material_count} valideret
                  </Badge>
                )}
              </div>
            </div>
          )}

          {pricingAnalysis.ai_reasoning && (
            <Alert className="mt-4 border-muted">
              <Bot className="h-4 w-4" />
              <AlertDescription className="text-sm">
                <strong>AI Begrundelse:</strong> {pricingAnalysis.ai_reasoning}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Detailed Quote Lines */}
      <div className="glow-card p-6 slide-up" style={{ animationDelay: '100ms' }}>
        <div className="mb-4">
          <h2 className="font-semibold">Detaljeret Prisberegning</h2>
          <p className="text-sm text-muted-foreground">
            {quote.quote_lines?.filter((l: any) => l.line_type === 'material').length > 0 
              ? 'Transparent opdeling med itemiserede materialer'
              : 'Transparent opdeling af alle omkostninger'}
          </p>
        </div>

        <div className="space-y-4">
          {/* Labor and Vehicle Lines */}
          {quote.quote_lines?.filter((line: any) => line.line_type !== 'material').map((line: any, index: number) => (
            <div key={line.id || `non-mat-${index}`}>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{line.description}</span>
                    <Badge variant="outline" className="text-xs">
                      {line.line_type}
                    </Badge>
                  </div>
                  {line.quantity && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {line.quantity} × {formatCurrency(line.unit_price || 0)}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-medium text-sm">{formatCurrency(line.total_price || 0)}</div>
                </div>
              </div>
              <Separator className="mt-4" />
            </div>
          ))}

          {/* Material Lines Section */}
          {quote.quote_lines?.filter((line: any) => line.line_type === 'material').length > 0 ? (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <div className="text-sm font-medium text-muted-foreground">Materialer</div>
                <Button size="sm" variant="outline" className="h-7 text-xs">
                  <Plus size={12} className="mr-1" />
                  Tilføj
                </Button>
              </div>
              {quote.quote_lines?.filter((line: any) => line.line_type === 'material').map((line: any, index: number) => {
                const matIndex = quote.quote_lines?.findIndex((l: any) => l.id === line.id || (l.line_type === 'material' && quote.quote_lines.filter((x:any) => x.line_type === 'material').indexOf(l) === index));
                
                return (
                  <div key={line.id || `mat-${index}`} className="pl-4 border-l-2 border-muted">
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-xs">{line.description}</span>
                          {line.material_code && (
                            <Badge variant="secondary" className="text-[10px]">
                              {line.material_code}
                            </Badge>
                          )}
                          {!line.validated && (
                            <Badge variant="destructive" className="text-[10px]">
                              Ikke valideret
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <Input 
                          type="number" 
                          min={0} 
                          step={0.1}
                          value={line.quantity}
                          onChange={(e) => {
                            const newLines = [...quote.quote_lines];
                            newLines[matIndex].quantity = Number(e.target.value);
                            newLines[matIndex].total_price = newLines[matIndex].quantity * newLines[matIndex].unit_price;
                            const newSubtotal = newLines.reduce((s, l) => s + (l.total_price || 0), 0);
                            const newVat = newSubtotal * 0.25;
                            setQuote({ ...quote, quote_lines: newLines, subtotal: newSubtotal, vat_amount: newVat, total_amount: newSubtotal + newVat });
                            onQuoteUpdate?.({ ...quote, quote_lines: newLines, subtotal: newSubtotal, vat_amount: newVat, total_amount: newSubtotal + newVat });
                          }}
                          className="h-7 text-xs"
                        />
                      </div>
                      <div className="col-span-2">
                        <Input 
                          type="number" 
                          min={0} 
                          step={0.01}
                          value={line.unit_price}
                          onChange={(e) => {
                            const newLines = [...quote.quote_lines];
                            newLines[matIndex].unit_price = Number(e.target.value);
                            newLines[matIndex].total_price = newLines[matIndex].quantity * newLines[matIndex].unit_price;
                            const newSubtotal = newLines.reduce((s, l) => s + (l.total_price || 0), 0);
                            const newVat = newSubtotal * 0.25;
                            setQuote({ ...quote, quote_lines: newLines, subtotal: newSubtotal, vat_amount: newVat, total_amount: newSubtotal + newVat });
                            onQuoteUpdate?.({ ...quote, quote_lines: newLines, subtotal: newSubtotal, vat_amount: newVat, total_amount: newSubtotal + newVat });
                          }}
                          className="h-7 text-xs"
                        />
                      </div>
                      <div className="col-span-2 text-right font-medium text-xs">
                        {formatCurrency(line.total_price || 0)}
                      </div>
                      <div className="col-span-1 text-right">
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-7 w-7 p-0"
                          onClick={() => {
                            const newLines = quote.quote_lines.filter((_: any, i: number) => i !== matIndex);
                            const newSubtotal = newLines.reduce((s: number, l: any) => s + (l.total_price || 0), 0);
                            const newVat = newSubtotal * 0.25;
                            setQuote({ ...quote, quote_lines: newLines, subtotal: newSubtotal, vat_amount: newVat, total_amount: newSubtotal + newVat });
                            onQuoteUpdate?.({ ...quote, quote_lines: newLines, subtotal: newSubtotal, vat_amount: newVat, total_amount: newSubtotal + newVat });
                          }}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Alert className="border-muted">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                Ingen itemiserede materialer. Materialeomkostninger er inkluderet som en samlet linje.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>

      {/* Applied Corrections Info */}
      {quote.applied_corrections && quote.applied_corrections.length > 0 && (
        <Alert className="border-yellow-500/30 bg-yellow-500/5">
          <Lightbulb className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-sm">
            <strong>Lært fra tidligere:</strong> {quote.applied_corrections.length} korrektion(er) anvendt automatisk.
          </AlertDescription>
        </Alert>
      )}

      {/* Price Summary */}
      <div className="glow-card p-6 slide-up" style={{ animationDelay: '150ms' }}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold">Prissammenfatning</h2>
          {caseId && (
            <div className="flex gap-2">
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => {
                  setPendingChanges([{
                    field: 'freeform_note',
                    original_value: '',
                    new_value: '',
                    label: 'Fritekst Note'
                  }]);
                  setShowCorrectionDialog(true);
                }}
                className="text-xs"
              >
                <MessageSquare className="h-3.5 w-3.5 mr-1" />
                Tilføj AI Note
              </Button>
              <Button 
                size="sm" 
                onClick={checkForSignificantChanges}
                className="btn-modern text-xs"
              >
                <Lightbulb className="h-3.5 w-3.5 mr-1" />
                Gem ændringer
              </Button>
            </div>
          )}
        </div>
        
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal:</span>
            <span>{formatCurrency(quote.subtotal || 0)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Moms (25%):</span>
            <span>{formatCurrency(quote.vat_amount || 0)}</span>
          </div>
          <Separator />
          <div className="flex justify-between text-lg font-bold">
            <span>Total:</span>
            <span>{formatCurrency(quote.total_amount || 0)}</span>
          </div>
        </div>
        
        {quote.labor_hours && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Arbejdstimer:</span>
              <Input 
                type="number" 
                min={0} 
                step={0.5}
                value={quote.labor_hours}
                onChange={(e) => {
                  const newHours = Number(e.target.value);
                  const hourlyRate = quote.pricing_snapshot?.hourly_rate || 650;
                  const laborCost = newHours * hourlyRate;
                  
                  const newLines = quote.quote_lines?.map((line: any) => {
                    if (line.line_type === 'labor') {
                      return { ...line, quantity: newHours, total_price: laborCost };
                    }
                    return line;
                  }) || [];
                  
                  const newSubtotal = newLines.reduce((s: number, l: any) => s + (l.total_price || 0), 0);
                  const newVat = newSubtotal * 0.25;
                  
                  setQuote({ 
                    ...quote, 
                    labor_hours: newHours,
                    quote_lines: newLines, 
                    subtotal: newSubtotal, 
                    vat_amount: newVat, 
                    total_amount: newSubtotal + newVat 
                  });
                  onQuoteUpdate?.({ 
                    ...quote, 
                    labor_hours: newHours,
                    quote_lines: newLines, 
                    subtotal: newSubtotal, 
                    vat_amount: newVat, 
                    total_amount: newSubtotal + newVat 
                  });
                }}
                className="w-24 h-8 text-sm"
              />
            </div>
          </div>
        )}
        
        {quote.pricing_trace && (
          <Collapsible open={isExplanationOpen} onOpenChange={setIsExplanationOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full mt-4 justify-between text-xs">
                <span>Vis beregningsdetaljer</span>
                <span>{isExplanationOpen ? '▲' : '▼'}</span>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 p-3 bg-muted/30 rounded-lg">
              <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(quote.pricing_trace, null, 2)}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>

      {/* Correction Dialog - only render when open to avoid Suspense/hooks issues */}
      {showCorrectionDialog && (
        <CorrectionDialog 
          open={showCorrectionDialog}
          onClose={() => setShowCorrectionDialog(false)}
          changes={pendingChanges}
          quoteId={quote.id}
          caseId={caseId || ''}
          projectType={pricingAnalysis?.project?.type || pricingAnalysis?.project_type || ''}
          estimatedSize={(() => {
            const size = pricingAnalysis?.project?.estimated_size || pricingAnalysis?.estimated_size;
            if (typeof size === 'object' && size?.value) return size.value;
            return typeof size === 'number' ? size : 0;
          })()}
          complexity={pricingAnalysis?.project?.complexity || pricingAnalysis?.complexity || 'medium'}
          emailContent={emailContent}
        />
      )}
    </div>
  );
};

export default EnhancedQuoteViewer;
