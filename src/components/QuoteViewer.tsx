import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Quote } from "@/types";
import { formatCurrency, formatDate, VALENTIN_PRICING_LOGIC } from "@/lib/valentin-config";
import { db } from "@/lib/supabase-client";
import { Send, CheckCircle, FileText, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface QuoteViewerProps {
  quote: Quote;
  onUpdate: () => void;
}

export default function QuoteViewer({ quote, onUpdate }: QuoteViewerProps) {
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const handleApproveAndSend = async () => {
    setSending(true);
    try {
      // Update quote status to approved
      await db.updateQuote(quote.id, { status: 'approved' });

      // Simulate sending to E-regnskab (stub for now)
      await new Promise(resolve => setTimeout(resolve, 1000));

      toast({
        title: "Tilbud Godkendt",
        description: "Tilbuddet er godkendt og sendt til E-regnskab"
      });

      onUpdate();
    } catch (error) {
      console.error('Failed to approve quote:', error);
      toast({
        title: "Fejl",
        description: "Kunne ikke godkende tilbud",
        variant: "destructive"
      });
    } finally {
      setSending(false);
    }
  };

  const handleExportPDF = () => {
    toast({
      title: "PDF Export",
      description: "PDF eksport funktion kommer snart"
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Tilbud {quote.quote_number}
          </CardTitle>
          <Badge 
            variant={quote.status === 'approved' ? 'default' : 'secondary'}
            className={quote.status === 'approved' ? 'bg-green-100 text-green-800' : ''}
          >
            {quote.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Company Header */}
        <div className="text-center border-b pb-4">
          <h2 className="text-xl font-bold text-primary">{VALENTIN_PRICING_LOGIC.company.name}</h2>
          <div className="text-sm text-muted-foreground mt-1">
            <p>{VALENTIN_PRICING_LOGIC.company.address}</p>
            <p>CVR: {VALENTIN_PRICING_LOGIC.company.cvr} | Tel: {VALENTIN_PRICING_LOGIC.company.phone}</p>
            <p>Email: {VALENTIN_PRICING_LOGIC.company.email} | Web: {VALENTIN_PRICING_LOGIC.company.web}</p>
          </div>
        </div>

        {/* Quote Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium mb-2">Tilbud Detaljer</h4>
            <div className="text-sm space-y-1">
              <div><span className="font-medium">Tilbud nr:</span> {quote.quote_number}</div>
              <div><span className="font-medium">Dato:</span> {formatDate(quote.created_at)}</div>
              {quote.valid_until && (
                <div><span className="font-medium">Gyldig til:</span> {formatDate(quote.valid_until)}</div>
              )}
            </div>
          </div>
          
          <div>
            <h4 className="font-medium mb-2">Arbejdstimer</h4>
            <div className="text-sm space-y-1">
              <div><span className="font-medium">Samlet timer:</span> {quote.labor_hours.toFixed(1)} timer</div>
              <div><span className="font-medium">Timepris:</span> {formatCurrency(VALENTIN_PRICING_LOGIC.baseRates.hourlyRate)}</div>
              <div><span className="font-medium">Servicevogn:</span> {formatCurrency(VALENTIN_PRICING_LOGIC.baseRates.serviceVehicle)}/time</div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Quote Lines */}
        <div>
          <h4 className="font-medium mb-4">Tilbudslinjer</h4>
          <div className="space-y-3">
            {quote.quote_lines && quote.quote_lines.length > 0 ? (
              quote.quote_lines
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((line) => (
                  <div key={line.id} className="flex justify-between items-center py-2 border-b">
                    <div className="flex-1">
                      <div className="font-medium">{line.description}</div>
                      <div className="text-sm text-muted-foreground">
                        {line.quantity} × {formatCurrency(line.unit_price)}
                      </div>
                    </div>
                    <div className="text-right font-medium">
                      {formatCurrency(line.total_price)}
                    </div>
                  </div>
                ))
            ) : (
              <div className="text-center py-4 text-muted-foreground">
                Ingen tilbudslinjer tilgængelige
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Price Summary */}
        <div className="space-y-3">
          <div className="flex justify-between">
            <span>Subtotal (ekskl. moms):</span>
            <span className="font-medium">{formatCurrency(quote.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>Moms (25%):</span>
            <span className="font-medium">{formatCurrency(quote.vat_amount)}</span>
          </div>
          <Separator />
          <div className="flex justify-between text-lg font-bold">
            <span>Total (inkl. moms):</span>
            <span className="text-primary">{formatCurrency(quote.total_amount)}</span>
          </div>
        </div>

        <Separator />

        {/* Actions */}
        <div className="flex gap-3">
          {quote.status === 'draft' && (
            <Button 
              onClick={handleApproveAndSend}
              disabled={sending}
              className="vvs-button-primary"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              {sending ? 'Sender...' : 'Godkend & Send til E-regnskab'}
            </Button>
          )}

          <Button 
            variant="outline" 
            onClick={handleExportPDF}
          >
            <Download className="h-4 w-4 mr-2" />
            Eksporter PDF
          </Button>

          {quote.status === 'approved' && (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Tilbud godkendt og sendt</span>
            </div>
          )}
        </div>

        {/* Terms and Conditions */}
        <div className="text-xs text-muted-foreground mt-6 pt-4 border-t">
          <h5 className="font-medium mb-2">Betingelser:</h5>
          <ul className="space-y-1">
            <li>• Tilbuddet er gyldigt i 30 dage fra dato</li>
            <li>• Alle priser er eksklusiv moms, medmindre andet er angivet</li>
            <li>• Arbejdet udføres i henhold til dansk håndværkertradition</li>
            <li>• Der gives 5 års garanti på VVS arbejde i henhold til AB92</li>
            <li>• Betaling netto 8 dage fra fakturadato</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}