import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/supabase-client";
import { Case } from "@/types";
import { formatDate, getProjectTypeLabel } from "@/lib/valentin-config";
import { Wrench, Mail, TrendingUp, Clock, Trash2, Edit, Check, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import CaseDetails from "./CaseDetails";
import { supabase } from "@/integrations/supabase/client";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { MaterialImporter } from "./MaterialImporter";

export default function Dashboard() {
  const [cases, setCases] = useState<Case[]>([]);
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadCases();
  }, []);

  const loadCases = async () => {
    try {
      const data = await db.getCases();
      setCases(data);
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

  const handleApproveCase = async (caseId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await db.updateCase(caseId, { status: 'approved' });
      toast({
        title: "Tilbud Godkendt",
        description: "Tilbuddet er nu låst og godkendt"
      });
      loadCases();
    } catch (error) {
      toast({
        title: "Fejl",
        description: "Kunne ikke godkende tilbud",
        variant: "destructive"
      });
    }
  };

  const handleDeleteCase = async (caseId: string) => {
    try {
      // First delete quote lines (they reference quotes)
      const { error: quoteLinesError } = await supabase
        .from('quote_lines')
        .delete()
        .in('quote_id', 
          (await supabase.from('quotes').select('id').eq('case_id', caseId)).data?.map(q => q.id) || []
        );

      if (quoteLinesError) throw quoteLinesError;

      // Then delete related quotes
      const { error: quotesError } = await supabase
        .from('quotes')
        .delete()
        .eq('case_id', caseId);

      if (quotesError) throw quotesError;

      // Finally delete the case
      const { error } = await supabase
        .from('cases')
        .delete()
        .eq('id', caseId);

      if (error) throw error;

      toast({
        title: "Sag Slettet",
        description: "Sagen og alle tilhørende data er blevet slettet"
      });
      loadCases();
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: "Fejl",
        description: "Kunne ikke slette sag",
        variant: "destructive"
      });
    }
  };

  const triggerGmailSync = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('gmail-sync');
      if (error) throw error;
      
      toast({
        title: "Gmail Sync",
        description: `Behandlede ${data.processed || 0} nye emails`
      });
      loadCases();
    } catch (error) {
      toast({
        title: "Fejl",
        description: "Kunne ikke synkronisere emails",
        variant: "destructive"
      });
    }
  };

  const stats = {
    total: cases.length,
    new: cases.filter(c => c.status === 'new').length,
    quoted: cases.filter(c => c.status === 'quoted').length,
    approved: cases.filter(c => c.status === 'approved').length
  };

  if (selectedCase) {
    return (
      <CaseDetails 
        case={selectedCase} 
        onBack={() => setSelectedCase(null)}
        onUpdate={loadCases}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="vvs-header text-white py-8">
        <div className="vvs-container">
          <div className="flex items-center gap-3 mb-2">
            <Wrench className="h-8 w-8" />
            <h1 className="text-3xl font-bold">Valentin VVS</h1>
          </div>
          <p className="text-lg opacity-90">Automatiseret Tilbudssystem</p>
        </div>
      </div>

      <div className="vvs-container py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Sager</CardTitle>
              <Mail className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Nye Sager</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats.new}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tilbud Sendt</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.quoted}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Godkendte</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">{stats.approved}</div>
            </CardContent>
          </Card>
        </div>

        {/* Material Importer */}
        <div className="mb-8">
          <MaterialImporter />
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Seneste Sager (Automatisk Behandling)</CardTitle>
            <Button 
              onClick={triggerGmailSync}
              size="sm"
              variant="outline"
              className="flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Synk Gmail Nu
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">Indlæser sager...</div>
            ) : cases.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Ingen sager endnu. Test systemet med test-endpointet.
              </div>
            ) : (
              <div className="space-y-4">
                {cases.map((case_) => (
                  <div key={case_.id} 
                       className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50"
                       >
                    <div className="flex-1 cursor-pointer" onClick={() => setSelectedCase(case_)}>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium">{case_.subject || 'Ingen emne'}</h3>
                        <Badge className={`vvs-status-${case_.status}`}>
                          {case_.status === 'new' ? 'Behandles automatisk...' : 
                           case_.status === 'analyzed' ? 'Analyseret' :
                           case_.status === 'quoted' ? 'Tilbud klar' :
                           case_.status === 'approved' ? 'Godkendt' : case_.status}
                        </Badge>
                        {case_.urgency !== 'normal' && (
                          <Badge className={`vvs-urgency-${case_.urgency}`}>
                            {case_.urgency}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-1">
                        {case_.description?.substring(0, 100)}...
                      </p>
                      {case_.extracted_data?.project?.type && (
                        <p className="text-xs text-muted-foreground">
                          {getProjectTypeLabel(case_.extracted_data.project.type)} - 
                          {case_.extracted_data.project.estimated_size} {case_.extracted_data.project.size_unit}
                        </p>
                      )}
                      {case_.quotes && case_.quotes.length > 0 && (
                        <p className="text-sm font-medium text-green-600 mt-1">
                          Tilbud: {case_.quotes[0].total_amount?.toLocaleString('da-DK')} kr inkl. moms
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <div className="text-right mr-4">
                        <div className="text-sm text-muted-foreground">
                          {formatDate(case_.created_at)}
                        </div>
                      </div>
                      
                      {case_.status === 'quoted' && (
                        <Button
                          size="sm"
                          onClick={(e) => handleApproveCase(case_.id, e)}
                          className="flex items-center gap-1"
                        >
                          <Check className="h-3 w-3" />
                          Godkend
                        </Button>
                      )}
                      
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedCase(case_)}
                        className="flex items-center gap-1"
                      >
                        <Edit className="h-3 w-3" />
                        Rediger
                      </Button>
                      
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Trash2 className="h-3 w-3" />
                            Slet
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Slet sag</AlertDialogTitle>
                            <AlertDialogDescription>
                              Er du sikker på, at du vil slette denne sag? Denne handling kan ikke fortrydes.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annuller</AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => handleDeleteCase(case_.id)}
                              className="bg-destructive text-destructive-foreground"
                            >
                              Slet sag
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
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