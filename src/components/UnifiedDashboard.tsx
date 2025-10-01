import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/supabase-client";
import { Case } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/valentin-config";
import { 
  RefreshCw, 
  Plus,
  Brain,
  Calculator,
  CheckCircle,
  Clock,
  AlertCircle,
  Trash2
} from "lucide-react";
import CaseDetails from "./CaseDetails";
import { supabase } from "@/integrations/supabase/client";

export default function UnifiedDashboard() {
  const [cases, setCases] = useState<Case[]>([]);
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadCases = async () => {
    try {
      setLoading(true);
      const casesData = await db.getCases();
      setCases(casesData);
    } catch (error) {
      console.error('Failed to load cases:', error);
      toast({
        title: "Fejl",
        description: "Kunne ikke indlæse sager",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCases();
  }, []);

  const handleCaseClick = async (caseId: string) => {
    const fullCase = await db.getCase(caseId);
    setSelectedCase(fullCase);
  };

  const handleAnalyzeCase = async (caseItem: Case) => {
    try {
      toast({
        title: "Analyserer...",
        description: "AI analyserer sagen"
      });

      const analyzeResponse = await fetch('https://xrvmjrrcdfvrhfzknlku.supabase.co/functions/v1/analyze-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhydm1qcnJjZGZ2cmhmemtubGt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4MDMwMzgsImV4cCI6MjA3MzM3OTAzOH0.T3HjMBptCVyHB-lDc8Lnr3xLndurh3f6c38JLJ50fL0`
        },
        body: JSON.stringify({
          emailContent: caseItem.description,
          subject: caseItem.subject
        })
      });

      if (!analyzeResponse.ok) throw new Error('Analysis failed');

      const analysisResult = await analyzeResponse.json();
      await db.updateCase(caseItem.id, {
        extracted_data: analysisResult,
        status: 'analyzed'
      });

      toast({
        title: "✅ Analyse Færdig",
        description: "Klik på sagen for at oprette tilbud"
      });

      await loadCases();
    } catch (error) {
      console.error('Analysis failed:', error);
      toast({
        title: "Fejl",
        description: "Analyse fejlede",
        variant: "destructive"
      });
    }
  };

  const handleDeleteCase = async (caseId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!confirm('Er du sikker på at du vil slette denne sag?')) {
      return;
    }

    try {
      setLoading(true);

      // First get all quotes for this case
      const { data: quotes, error: fetchError } = await supabase
        .from('quotes')
        .select('id')
        .eq('case_id', caseId);

      if (fetchError) throw fetchError;

      // Delete quote_lines first (foreign key constraint)
      if (quotes && quotes.length > 0) {
        for (const quote of quotes) {
          const { error: linesError } = await supabase
            .from('quote_lines')
            .delete()
            .eq('quote_id', quote.id);

          if (linesError) throw linesError;
        }

        // Then delete quotes
        const { error: quotesError } = await supabase
          .from('quotes')
          .delete()
          .eq('case_id', caseId);

        if (quotesError) throw quotesError;
      }

      // Finally delete the case
      const { error: caseError } = await supabase
        .from('cases')
        .delete()
        .eq('id', caseId);

      if (caseError) throw caseError;

      toast({
        title: "✅ Sag Slettet",
        description: "Sagen er blevet slettet"
      });

      await loadCases();
    } catch (error) {
      console.error('Delete failed:', error);
      toast({
        title: "Fejl",
        description: "Kunne ikke slette sagen",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const triggerGmailSync = async () => {
    try {
      toast({
        title: "Synkroniserer...",
        description: "Henter nye emails fra Gmail"
      });

      await fetch('https://xrvmjrrcdfvrhfzknlku.supabase.co/functions/v1/gmail-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhydm1qcnJjZGZ2cmhmemtubGt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4MDMwMzgsImV4cCI6MjA3MzM3OTAzOH0.T3HjMBptCVyHB-lDc8Lnr3xLndurh3f6c38JLJ50fL0`
        }
      });

      await loadCases();

      toast({
        title: "✅ Synkronisering Færdig",
        description: "Nye sager er hentet fra Gmail"
      });
    } catch (error) {
      console.error('Gmail sync failed:', error);
      toast({
        title: "Fejl",
        description: "Gmail synkronisering fejlede",
        variant: "destructive"
      });
    }
  };

  if (selectedCase) {
    return (
      <CaseDetails 
        case={selectedCase}
        onBack={() => {
          setSelectedCase(null);
          loadCases();
        }}
        onUpdate={loadCases}
      />
    );
  }

  const stats = {
    total: cases.length,
    new: cases.filter(c => c.status === 'new').length,
    quoted: cases.filter(c => c.status === 'quoted').length,
    approved: cases.filter(c => c.status === 'approved').length,
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Modern Header */}
      <div className="vvs-header py-8">
        <div className="vvs-container">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Valentin VVS</h1>
              <p className="text-primary-foreground/80 mt-1">Intelligent Tilbudssystem</p>
            </div>
            <div className="flex gap-3">
              <Button 
                onClick={triggerGmailSync}
                variant="outline"
                className="bg-white/10 border-white/20 text-white hover:bg-white/20"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Synkroniser Gmail
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="vvs-container py-8 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="vvs-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Sager</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>

          <Card className="vvs-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Nye</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">{stats.new}</div>
            </CardContent>
          </Card>

          <Card className="vvs-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Tilbud Sendt</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{stats.quoted}</div>
            </CardContent>
          </Card>

          <Card className="vvs-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Godkendt</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-emerald-600">{stats.approved}</div>
            </CardContent>
          </Card>
        </div>

        {/* Cases List */}
        <Card className="vvs-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Aktive Sager
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                <p className="mt-4 text-muted-foreground">Indlæser sager...</p>
              </div>
            ) : cases.length === 0 ? (
              <div className="text-center py-12">
                <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Ingen sager endnu</p>
                <Button 
                  onClick={triggerGmailSync}
                  className="mt-4 vvs-button-primary"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Hent fra Gmail
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {cases.map((caseItem) => (
                  <div
                    key={caseItem.id}
                    className="border border-border rounded-lg p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => handleCaseClick(caseItem.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-lg">{caseItem.subject || 'Ingen emne'}</h3>
                          <Badge className={`vvs-status-${caseItem.status}`}>
                            {caseItem.status}
                          </Badge>
                          {caseItem.urgency !== 'normal' && (
                            <Badge className={`vvs-urgency-${caseItem.urgency}`}>
                              {caseItem.urgency}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                          {caseItem.description}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{formatDate(caseItem.created_at)}</span>
                          {caseItem.address && <span>📍 {caseItem.address}</span>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 ml-4">
                        <div className="flex items-center gap-2">
                          {caseItem.status === 'new' && (
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAnalyzeCase(caseItem);
                              }}
                              size="sm"
                              className="vvs-button-primary"
                            >
                              <Brain className="h-4 w-4 mr-2" />
                              Start AI Analyse
                            </Button>
                          )}
                          <Button
                            onClick={(e) => handleDeleteCase(caseItem.id, e)}
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        {caseItem.quotes && caseItem.quotes.length > 0 && (
                          <div className="flex items-center gap-2 text-green-600 text-sm">
                            <CheckCircle className="h-4 w-4" />
                            <span>Tilbud {caseItem.quotes[0].status === 'draft' ? 'draft' : 'genereret'}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
