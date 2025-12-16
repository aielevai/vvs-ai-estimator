import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/supabase-client";
import { Case } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/valentin-config";
import { 
  RefreshCw, 
  Plus,
  CheckCircle,
  Clock,
  AlertCircle,
  Trash2,
  ChevronDown,
  Settings,
  Inbox,
  FileCheck,
  ThumbsUp,
  Layers,
  Loader2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Lazy load heavy components
const CaseDetails = lazy(() => import('./CaseDetails'));
const DataUploader = lazy(() => import('./DataUploader').then(m => ({ default: m.DataUploader })));

// Loading skeleton for stats
const StatSkeleton = () => (
  <div className="stat-card">
    <Skeleton className="h-4 w-20 mb-3" />
    <Skeleton className="h-10 w-16" />
  </div>
);

// Loading skeleton for case list
const CaseListSkeleton = () => (
  <div className="space-y-4">
    {[1, 2, 3].map((i) => (
      <div key={i} className="case-item p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-3">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-9 w-32" />
        </div>
      </div>
    ))}
  </div>
);

export default function UnifiedDashboard() {
  const [cases, setCases] = useState<Case[]>([]);
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
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

    // Realtime subscription for cases
    const channel = supabase
      .channel('cases-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'cases'
      }, (payload) => {
        console.log('📊 Case INSERT:', payload.new);
        db.getCase(payload.new.id).then(fullCase => {
          setCases(prev => [fullCase, ...prev]);
        }).catch(err => {
          console.log('Could not fetch new case, falling back to reload:', err);
          loadCases();
        });
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'cases'
      }, (payload) => {
        console.log('📊 Case UPDATE:', payload.new);
        const updatedCase = payload.new as any;

        setCases(prev => prev.map(c =>
          c.id === updatedCase.id
            ? { ...c, ...updatedCase, quotes: c.quotes }
            : c
        ));

        // Toast when quote is ready
        if (updatedCase.processing_status?.step === 'complete') {
          toast({
            title: "✅ Tilbud Klar!",
            description: `Sag: ${updatedCase.subject || 'Ny sag'}`,
            action: (
              <Button onClick={() => handleCaseClick(updatedCase.id)} size="sm">
                Åbn
              </Button>
            ),
            duration: 10000,
          });

          // Fetch full case data to get quotes
          db.getCase(updatedCase.id).then(fullCase => {
            setCases(prev => prev.map(c =>
              c.id === fullCase.id ? fullCase : c
            ));
          }).catch(console.error);
        }
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'cases'
      }, (payload) => {
        console.log('📊 Case DELETE:', payload.old);
        setCases(prev => prev.filter(c => c.id !== (payload.old as any).id));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleCaseClick = async (caseId: string) => {
    // Find the case to check its processing status
    const caseItem = cases.find(c => c.id === caseId);
    const processingStatus = (caseItem as any)?.processing_status;
    
    // Block clicks on cases that are still processing
    if (processingStatus?.step && 
        processingStatus.step !== 'complete' && 
        processingStatus.step !== 'error' &&
        processingStatus.step !== 'pending') {
      toast({
        title: "Afvent behandling",
        description: "Sagen behandles stadig. Du kan åbne den når tilbuddet er klar.",
      });
      return;
    }

    const fullCase = await db.getCase(caseId);
    setSelectedCase(fullCase);
  };

  const handleDeleteCase = async (caseId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm('Er du sikker på at du vil slette denne sag?')) {
      return;
    }

    try {
      setLoading(true);

      const { data: quotes, error: fetchError } = await supabase
        .from('quotes')
        .select('id')
        .eq('case_id', caseId);

      if (fetchError) throw fetchError;

      if (quotes && quotes.length > 0) {
        const quoteIds = quotes.map(q => q.id);

        const { error: linesError } = await supabase
          .from('quote_lines')
          .delete()
          .in('quote_id', quoteIds);

        if (linesError) throw linesError;

        const { error: quotesError } = await supabase
          .from('quotes')
          .delete()
          .eq('case_id', caseId);

        if (quotesError) throw quotesError;
      }

      const { error: caseError } = await supabase
        .from('cases')
        .delete()
        .eq('id', caseId);

      if (caseError) throw caseError;

      toast({
        title: "✅ Sag Slettet",
        description: "Sagen er blevet slettet"
      });

      setCases(prev => prev.filter(c => c.id !== caseId));
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
      setSyncing(true);
      toast({
        title: "Synkroniserer...",
        description: "Henter nye emails fra Gmail"
      });

      const result = await supabase.functions.invoke('gmail-sync');

      await loadCases();

      const data = result.data;
      toast({
        title: "✅ Synkronisering Færdig",
        description: `Behandlet: ${data?.processed || 0}, Eksisterende: ${data?.skippedExisting || 0}`
      });
    } catch (error: any) {
      console.error('Gmail sync failed:', error);
      toast({
        title: "Fejl",
        description: error.message || "Gmail synkronisering fejlede",
        variant: "destructive"
      });
    } finally {
      setSyncing(false);
    }
  };

  // Stats calculation
  const stats = useMemo(() => ({
    total: cases.length,
    new: cases.filter(c => c.status === 'new').length,
    quoted: cases.filter(c => c.status === 'quoted').length,
    approved: cases.filter(c => c.status === 'approved').length,
  }), [cases]);

  if (selectedCase) {
    return (
      <Suspense fallback={
        <div className="min-h-screen bg-background p-8">
          <Skeleton className="h-16 w-full mb-8" />
          <Skeleton className="h-96 w-full" />
        </div>
      }>
        <CaseDetails 
          case={selectedCase}
          onBack={() => {
            setSelectedCase(null);
            loadCases();
          }}
          onUpdate={loadCases}
        />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Modern Header */}
      <header className="modern-header">
        <div className="vvs-container">
          <div className="flex items-center justify-between">
            <div className="fade-in">
              <h1 className="text-3xl font-bold tracking-tight">Valentin VVS</h1>
              <p className="text-background/70 mt-1 text-sm">Intelligent Tilbudssystem</p>
            </div>
            <Button 
              onClick={triggerGmailSync}
              disabled={syncing}
              className="btn-modern-outline bg-background/10 border-background/20 text-background hover:bg-background/20"
            >
              {syncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {syncing ? 'Synkroniserer...' : 'Synkroniser'}
            </Button>
          </div>
        </div>
      </header>

      <div className="vvs-container py-8 space-y-8">
        {/* Bento Stats Grid */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 fade-in">
            <div className="stat-card md:col-span-2 md:row-span-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Total Sager</p>
                  <p className="text-5xl font-bold mt-2 tracking-tight">{stats.total}</p>
                </div>
                <div className="p-3 bg-muted rounded-xl">
                  <Layers className="h-6 w-6 text-muted-foreground" />
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  Aktive projekter i systemet
                </p>
              </div>
            </div>

            <div className="stat-card">
              <div className="flex items-center justify-between mb-2">
                <Inbox className="h-5 w-5 text-blue-500" />
              </div>
              <p className="text-sm text-muted-foreground">Nye</p>
              <p className="text-3xl font-bold tracking-tight text-blue-600">{stats.new}</p>
            </div>

            <div className="stat-card">
              <div className="flex items-center justify-between mb-2">
                <FileCheck className="h-5 w-5 text-green-500" />
              </div>
              <p className="text-sm text-muted-foreground">Tilbud Sendt</p>
              <p className="text-3xl font-bold tracking-tight text-green-600">{stats.quoted}</p>
            </div>

            <div className="stat-card md:col-span-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Godkendt</p>
                  <p className="text-3xl font-bold tracking-tight text-emerald-600">{stats.approved}</p>
                </div>
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <ThumbsUp className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Advanced Tools - Collapsible */}
        <Collapsible>
          <div className="glow-card">
            <CollapsibleTrigger asChild>
              <div className="p-5 cursor-pointer hover:bg-muted/30 transition-colors flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-muted rounded-lg">
                    <Settings className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="font-medium">Avancerede Værktøjer</span>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-5 pb-5 pt-0 border-t border-border">
                <Suspense fallback={<Skeleton className="h-40 w-full mt-4" />}>
                  <DataUploader />
                </Suspense>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>

        {/* Cases List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              Aktive Sager
            </h2>
            <span className="text-sm text-muted-foreground">{cases.length} sager</span>
          </div>

          {loading ? (
            <CaseListSkeleton />
          ) : cases.length === 0 ? (
            <div className="glow-card p-12 text-center slide-up">
              <div className="p-4 bg-muted rounded-full w-fit mx-auto mb-4">
                <AlertCircle className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground mb-4">Ingen sager endnu</p>
              <Button onClick={triggerGmailSync} className="btn-modern">
                <Plus className="h-4 w-4" />
                Hent fra Gmail
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {cases.map((caseItem, index) => {
                const processingStatus = (caseItem as any).processing_status;
                const isProcessing = processingStatus && 
                  processingStatus.step !== 'complete' && 
                  processingStatus.step !== 'pending' &&
                  processingStatus.step !== 'error';
                const isError = processingStatus?.step === 'error';
                const isComplete = processingStatus?.step === 'complete' || caseItem.quotes?.length > 0;
                
                return (
                  <div
                    key={caseItem.id}
                    className={`case-item slide-up ${isProcessing ? 'opacity-70 cursor-wait' : 'cursor-pointer'}`}
                    style={{ animationDelay: `${index * 50}ms` }}
                    onClick={() => handleCaseClick(caseItem.id)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <h3 className="font-semibold truncate">{caseItem.subject || 'Ingen emne'}</h3>
                          <Badge className={`vvs-status-${caseItem.status} text-xs`}>
                            {caseItem.status}
                          </Badge>
                          {caseItem.urgency !== 'normal' && (
                            <Badge className={`vvs-urgency-${caseItem.urgency} text-xs`}>
                              {caseItem.urgency}
                            </Badge>
                          )}
                        </div>

                        {/* Processing indicator */}
                        {isProcessing && (
                          <div className="mb-3 p-3 bg-muted rounded-lg processing-glow">
                            <div className="flex items-center gap-2 mb-2">
                              <Loader2 className="h-4 w-4 animate-spin text-foreground/70" />
                              <span className="text-sm font-medium">
                                {processingStatus.message || 'Behandler...'}
                              </span>
                            </div>
                            <div className="w-full bg-border rounded-full h-1.5">
                              <div 
                                className="bg-foreground h-1.5 rounded-full transition-all duration-500"
                                style={{ width: `${processingStatus.progress || 0}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Error indicator */}
                        {isError && (
                          <div className="mb-3 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                            <div className="flex items-center gap-2">
                              <AlertCircle className="h-4 w-4 text-destructive" />
                              <span className="text-sm text-destructive">
                                {processingStatus.message || 'Fejl under behandling'}
                              </span>
                            </div>
                          </div>
                        )}

                        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                          {caseItem.description}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{formatDate(caseItem.created_at)}</span>
                          {caseItem.address && <span>📍 {caseItem.address}</span>}
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {/* Show status indicators instead of action buttons */}
                        {isProcessing && (
                          <Badge variant="outline" className="text-xs">
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            Behandler
                          </Badge>
                        )}
                        
                        {isComplete && (
                          <div className="flex items-center gap-1.5 text-green-600 text-xs">
                            <CheckCircle className="h-3.5 w-3.5" />
                            <span>Tilbud klar</span>
                          </div>
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
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
