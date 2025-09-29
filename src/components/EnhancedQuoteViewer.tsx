import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, AlertTriangle, Info, Bot } from "lucide-react";

interface EnhancedQuoteViewerProps {
  quote: any;
  pricingAnalysis?: any;
}

export const EnhancedQuoteViewer: React.FC<EnhancedQuoteViewerProps> = ({ quote, pricingAnalysis }) => {
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
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon size={12} />
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Quote Header */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>Tilbud #{quote.quote_number}</CardTitle>
              <CardDescription>
                Oprettet: {new Date(quote.created_at).toLocaleDateString('da-DK')}
                {quote.valid_until && ` • Gyldig til: ${new Date(quote.valid_until).toLocaleDateString('da-DK')}`}
              </CardDescription>
            </div>
            <Badge variant={quote.status === 'draft' ? 'secondary' : 'default'}>
              {quote.status}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Pricing Analysis */}
      {pricingAnalysis && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot size={20} />
              AI Prisanalyse
            </CardTitle>
            <CardDescription>
              Detaljeret beregningsgrundlag og materialevurdering
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Projekttype</div>
                <div className="font-medium">{pricingAnalysis.project_type?.replace('_', ' ')}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Størrelse</div>
                <div className="font-medium">{pricingAnalysis.estimated_size}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Kompleksitet</div>
                <div className="font-medium">{pricingAnalysis.complexity}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Timer total</div>
                <div className="font-medium">{pricingAnalysis.total_hours} timer</div>
              </div>
            </div>

            {pricingAnalysis.material_source && (
              <div className="flex items-center justify-between">
                <span className="text-sm">Materialekilde:</span>
                <div className="flex items-center gap-2">
                  {getMaterialSourceBadge(pricingAnalysis.material_source)}
                  {pricingAnalysis.material_validation > 0 && (
                    <Badge variant="outline">
                      {pricingAnalysis.material_validation}/{pricingAnalysis.material_count} valideret
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {pricingAnalysis.ai_reasoning && (
              <Alert>
                <Bot className="h-4 w-4" />
                <AlertDescription>
                  <strong>AI Begrundelse:</strong> {pricingAnalysis.ai_reasoning}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Detailed Quote Lines */}
      <Card>
        <CardHeader>
          <CardTitle>Detaljeret Prisberegning</CardTitle>
          <CardDescription>
            Transparent opdeling af alle omkostninger
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {quote.quote_lines?.map((line: any, index: number) => (
              <div key={line.id || index}>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{line.description}</span>
                      <Badge variant="outline">
                        {line.line_type}
                      </Badge>
                      {line.material_code && (
                        <Badge variant="secondary">
                          {line.material_code}
                        </Badge>
                      )}
                    </div>
                    {line.quantity && (
                      <div className="text-sm text-muted-foreground mt-1">
                        {line.quantity} × {formatCurrency(line.unit_price || 0)}
                        {line.labor_hours && ` (${line.labor_hours} timer)`}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{formatCurrency(line.total_price || 0)}</div>
                  </div>
                </div>
                {index < (quote.quote_lines?.length || 0) - 1 && <Separator className="mt-4" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Price Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Prissammenfatning</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>{formatCurrency(quote.subtotal || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span>Moms (25%):</span>
              <span>{formatCurrency(quote.vat_amount || 0)}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-lg font-bold">
              <span>Total:</span>
              <span>{formatCurrency(quote.total_amount || 0)}</span>
            </div>
          </div>
          
          {quote.labor_hours && (
            <div className="mt-4 pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Arbejdstimer: {quote.labor_hours} timer á {formatCurrency(550)} = {formatCurrency((quote.labor_hours || 0) * 550)}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Calculation Details */}
      {pricingAnalysis?.calculation_details && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle size={20} />
              Beregningsdetaljer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pricingAnalysis.calculation_details.map((detail: any, index: number) => (
                <div key={index} className="flex justify-between items-center">
                  <div>
                    <div className="font-medium">{detail.description}</div>
                    <div className="text-sm text-muted-foreground">{detail.calculation}</div>
                  </div>
                  <div className="font-medium">{formatCurrency(detail.amount)}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quality Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Kvalitetsgaranti:</strong> Alle materialer er Ahlsell-certificerede
          </AlertDescription>
        </Alert>
        
        {pricingAnalysis?.historical_calibration === 'applied' && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>Historisk kalibrering:</strong> Priser justeret efter erfaring
            </AlertDescription>
          </Alert>
        )}
        
        {pricingAnalysis?.material_validation > 0 && (
          <Alert>
            <Bot className="h-4 w-4" />
            <AlertDescription>
              <strong>AI Valideret:</strong> {pricingAnalysis.material_validation} produkter bekræftet
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
};