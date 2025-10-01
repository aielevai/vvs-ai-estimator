import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { 
  Check, X, Plus, Search, Loader2, Brain, 
  AlertCircle, Edit2, Trash2, ShoppingCart 
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Material {
  id?: string;
  supplier_item_id: string;
  vvs_number?: string;
  description: string;
  quantity: number;
  unit_price: number;
  unit: string;
  total_price: number;
  reasoning?: string;
  validated: boolean;
  user_modified?: boolean;
  category?: string;
  priority?: string;
  in_stock?: boolean;
}

interface MaterialSelectionWizardProps {
  projectDescription: string;
  projectType: string;
  estimatedSize: number;
  complexity: string;
  materialeAnalyse?: any;
  onMaterialsConfirmed: (materials: Material[], totalCost: number) => void;
  onCancel?: () => void;
}

export default function MaterialSelectionWizard({
  projectDescription,
  projectType,
  estimatedSize,
  complexity,
  materialeAnalyse,
  onMaterialsConfirmed,
  onCancel
}: MaterialSelectionWizardProps) {
  const [loading, setLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<Material[]>([]);
  const [selectedMaterials, setSelectedMaterials] = useState<Material[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [step, setStep] = useState<'initial' | 'review' | 'manual'>('initial');
  const { toast } = useToast();

  const getAISuggestions = async () => {
    setLoading(true);
    try {
      console.log('Getting AI material suggestions...');
      
      const { data, error } = await supabase.functions.invoke('material-lookup', {
        body: {
          projectType,
          projectDescription,
          estimatedSize,
          complexity,
          materialeAnalyse
        }
      });

      if (error) throw error;

      const suggestions = (data.materials || []).map((m: any) => ({
        ...m,
        id: crypto.randomUUID(),
        validated: m.validated || false,
        user_modified: false
      }));

      setAiSuggestions(suggestions);
      setStep('review');

      toast({
        title: "AI forslag klar",
        description: `${suggestions.length} materialer foreslået`
      });
    } catch (error) {
      console.error('Error getting AI suggestions:', error);
      toast({
        title: "AI fejl",
        description: "Kunne ikke hente AI forslag. Du kan søge manuelt.",
        variant: "destructive"
      });
      setStep('manual');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptMaterial = (material: Material) => {
    setSelectedMaterials(prev => [...prev, material]);
    setAiSuggestions(prev => prev.filter(m => m.id !== material.id));
  };

  const handleRejectMaterial = (materialId: string) => {
    setAiSuggestions(prev => prev.filter(m => m.id !== materialId));
  };

  const handleEditMaterial = (materialId: string, updates: Partial<Material>) => {
    setSelectedMaterials(prev => prev.map(m => 
      m.id === materialId 
        ? { ...m, ...updates, user_modified: true, total_price: (updates.quantity || m.quantity) * (updates.unit_price || m.unit_price) }
        : m
    ));
  };

  const handleRemoveMaterial = (materialId: string) => {
    setSelectedMaterials(prev => prev.filter(m => m.id !== materialId));
  };

  const searchDatabase = async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('enhanced_supplier_prices')
        .select('*')
        .or(`normalized_text.ilike.%${searchQuery}%,short_description.ilike.%${searchQuery}%,long_description.ilike.%${searchQuery}%`)
        .limit(50);

      if (error) throw error;

      setSearchResults(data || []);
      setShowSearch(true);
    } catch (error) {
      console.error('Search error:', error);
      toast({
        title: "Søgefejl",
        description: "Kunne ikke søge i database",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const addFromSearch = (product: any) => {
    const newMaterial: Material = {
      id: crypto.randomUUID(),
      supplier_item_id: product.supplier_item_id,
      vvs_number: product.vvs_number,
      description: product.short_description || product.long_description,
      quantity: 1,
      unit_price: product.net_price || product.gross_price,
      unit: product.price_unit || 'stk',
      total_price: product.net_price || product.gross_price,
      validated: true,
      user_modified: true,
      in_stock: product.is_on_stock
    };

    setSelectedMaterials(prev => [...prev, newMaterial]);
    toast({
      title: "Materiale tilføjet",
      description: newMaterial.description
    });
  };

  const confirmMaterials = () => {
    const totalCost = selectedMaterials.reduce((sum, m) => sum + m.total_price, 0);
    onMaterialsConfirmed(selectedMaterials, totalCost);
  };

  const getTotalCost = () => {
    return selectedMaterials.reduce((sum, m) => sum + m.total_price, 0);
  };

  if (step === 'initial') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Materiale Valg Wizard
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <p className="mb-2">Projekt: {projectType.replace('_', ' ')}</p>
            <p className="mb-2">Størrelse: {estimatedSize} enheder</p>
            <p>Kompleksitet: {complexity}</p>
          </div>
          
          <div className="flex gap-2">
            <Button onClick={getAISuggestions} disabled={loading} className="flex-1">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  AI analyserer...
                </>
              ) : (
                <>
                  <Brain className="mr-2 h-4 w-4" />
                  Få AI Forslag
                </>
              )}
            </Button>
            
            <Button onClick={() => setStep('manual')} variant="outline">
              <Search className="mr-2 h-4 w-4" />
              Søg Selv
            </Button>
          </div>

          {onCancel && (
            <Button onClick={onCancel} variant="ghost" className="w-full">
              Annuller
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* AI Suggestions Review */}
      {step === 'review' && aiSuggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                AI Forslag ({aiSuggestions.length})
              </span>
              <Button onClick={() => setStep('manual')} variant="outline" size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Tilføj Flere
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                {aiSuggestions.map((material) => (
                  <div key={material.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium">{material.description}</div>
                        <div className="text-sm text-muted-foreground">
                          {material.supplier_item_id} • {material.quantity} {material.unit}
                        </div>
                        {material.reasoning && (
                          <div className="text-xs text-blue-600 mt-1 flex items-start gap-1">
                            <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                            {material.reasoning}
                          </div>
                        )}
                      </div>
                      <div className="text-right ml-4">
                        <div className="font-semibold">
                          {material.total_price.toLocaleString('da-DK')} kr
                        </div>
                        <Badge variant={material.validated ? "default" : "secondary"}>
                          {material.validated ? "Valideret" : "Estimeret"}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button 
                        onClick={() => handleAcceptMaterial(material)}
                        size="sm"
                        className="flex-1"
                      >
                        <Check className="mr-2 h-4 w-4" />
                        Accepter
                      </Button>
                      <Button 
                        onClick={() => handleRejectMaterial(material.id!)}
                        size="sm"
                        variant="outline"
                        className="flex-1"
                      >
                        <X className="mr-2 h-4 w-4" />
                        Afvis
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Manual Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Manuel Søgning
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Søg efter materialer..."
              onKeyPress={(e) => e.key === 'Enter' && searchDatabase()}
            />
            <Button onClick={searchDatabase} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>

          {showSearch && (
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {searchResults.map((product) => (
                  <div key={product.id} className="border rounded p-3 flex items-center justify-between hover:bg-muted/50">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{product.short_description}</div>
                      <div className="text-xs text-muted-foreground">
                        {product.supplier_item_id} • {product.net_price || product.gross_price} kr/{product.price_unit}
                      </div>
                    </div>
                    <Button onClick={() => addFromSearch(product)} size="sm">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Selected Materials */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Valgte Materialer ({selectedMaterials.length})
            </span>
            <div className="text-lg font-bold">
              {getTotalCost().toLocaleString('da-DK')} kr
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {selectedMaterials.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              Ingen materialer valgt endnu
            </div>
          ) : (
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-3">
                {selectedMaterials.map((material) => (
                  <div key={material.id} className="border rounded-lg p-3">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="font-medium">{material.description}</div>
                        {material.user_modified && (
                          <Badge variant="secondary" className="text-xs mt-1">Redigeret</Badge>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="ghost">
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Rediger Materiale</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-3">
                              <div>
                                <label className="text-sm font-medium">Mængde</label>
                                <Input
                                  type="number"
                                  defaultValue={material.quantity}
                                  onChange={(e) => handleEditMaterial(material.id!, { quantity: parseFloat(e.target.value) })}
                                />
                              </div>
                              <div>
                                <label className="text-sm font-medium">Enhedspris</label>
                                <Input
                                  type="number"
                                  defaultValue={material.unit_price}
                                  onChange={(e) => handleEditMaterial(material.id!, { unit_price: parseFloat(e.target.value) })}
                                />
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => handleRemoveMaterial(material.id!)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {material.quantity} {material.unit} × {material.unit_price} kr = {material.total_price.toLocaleString('da-DK')} kr
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          <div className="mt-4 flex gap-2">
            <Button 
              onClick={confirmMaterials}
              disabled={selectedMaterials.length === 0}
              className="flex-1"
            >
              <Check className="mr-2 h-4 w-4" />
              Bekræft Materialer ({getTotalCost().toLocaleString('da-DK')} kr)
            </Button>
            {onCancel && (
              <Button onClick={onCancel} variant="outline">
                Annuller
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}