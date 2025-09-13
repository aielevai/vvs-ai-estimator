import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/supabase-client";
import { Case } from "@/types";
import { formatDate, getProjectTypeLabel } from "@/lib/valentin-config";
import { Wrench, Mail, TrendingUp, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import CaseDetails from "./CaseDetails";

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

        <Card>
          <CardHeader>
            <CardTitle>Seneste Sager</CardTitle>
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
                       className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer"
                       onClick={() => setSelectedCase(case_)}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium">{case_.subject || 'Ingen emne'}</h3>
                        <Badge className={`vvs-status-${case_.status}`}>
                          {case_.status}
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
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">
                        {formatDate(case_.created_at)}
                      </div>
                      {case_.quotes && case_.quotes.length > 0 && (
                        <div className="text-sm font-medium text-green-600">
                          Tilbud klar
                        </div>
                      )}
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