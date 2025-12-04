import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface CorrectionChange {
  field: string;
  original_value: number | string;
  new_value: number | string;
  label: string;
}

interface CorrectionDialogProps {
  open: boolean;
  onClose: () => void;
  changes: CorrectionChange[];
  caseId: string;
  quoteId: string;
  projectType: string;
  estimatedSize: number;
  complexity: string;
  emailContent?: string;
}

export const CorrectionDialog: React.FC<CorrectionDialogProps> = ({
  open,
  onClose,
  changes,
  caseId,
  quoteId,
  projectType,
  estimatedSize,
  complexity,
  emailContent
}) => {
  const [reasoning, setReasoning] = useState('');
  const [scope, setScope] = useState<'this_only' | 'similar' | 'always'>('similar');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const isFreeformNote = changes.length === 1 && changes[0]?.field === 'freeform_note';

  const handleSave = async () => {
    if (!reasoning.trim()) {
      toast({
        title: isFreeformNote ? "Mangler note" : "Mangler begrundelse",
        description: isFreeformNote 
          ? "Skriv venligst hvad systemet skal huske"
          : "Skriv venligst hvorfor du lavede denne rettelse",
        variant: "destructive"
      });
      return;
    }

    setSaving(true);
    try {
      // Build correction value based on changes
      const correctionValue: Record<string, any> = {};
      
      if (isFreeformNote) {
        correctionValue.note = reasoning;
      } else {
        for (const change of changes) {
          if (change.field === 'labor_hours') {
            const originalHours = Number(change.original_value);
            const newHours = Number(change.new_value);
            if (originalHours > 0) {
              correctionValue.hours_multiplier = newHours / originalHours;
            } else {
              correctionValue.hours_add = newHours;
            }
          }
          // Add more field types as needed (materials, complexity, etc.)
        }
      }

      const { error } = await supabase.functions.invoke('save-correction', {
        body: {
          correction_type: isFreeformNote ? 'freeform_note' : (changes[0]?.field === 'labor_hours' ? 'hours_adjustment' : 'general'),
          correction_value: correctionValue,
          original_value: isFreeformNote ? {} : Object.fromEntries(changes.map(c => [c.field, c.original_value])),
          corrected_value: isFreeformNote ? {} : Object.fromEntries(changes.map(c => [c.field, c.new_value])),
          project_type: projectType,
          complexity,
          size: estimatedSize,
          scope,
          user_reasoning: reasoning,
          email_content: emailContent,
          source_case_id: caseId,
          source_quote_id: quoteId
        }
      });

      if (error) throw error;

      toast({
        title: "Rettelse gemt",
        description: scope === 'this_only' 
          ? "Rettelsen er noteret for denne sag"
          : "Systemet vil huske dette til fremtidige lignende sager"
      });
      
      onClose();
    } catch (e) {
      console.error('Failed to save correction:', e);
      toast({
        title: "Fejl",
        description: "Kunne ikke gemme rettelsen",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const getScopeDescription = (s: string) => {
    switch (s) {
      case 'this_only': return 'Kun relevant for denne specifikke sag';
      case 'similar': return 'Anvend på lignende sager (samme type, størrelse, kompleksitet)';
      case 'always': return 'Anvend altid på denne projekttype';
      default: return '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-yellow-500" />
            {isFreeformNote ? 'Tilføj Note til AI' : 'Hjælp systemet med at lære'}
          </DialogTitle>
          <DialogDescription>
            {isFreeformNote 
              ? 'Skriv noget systemet skal huske til fremtidige lignende sager.'
              : 'Du har ændret tilbuddet. Fortæl os hvorfor, så systemet kan blive bedre.'
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Show what changed - only for non-freeform */}
          {!isFreeformNote && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Dine ændringer:</Label>
              <div className="space-y-1">
                {changes.map((change, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Badge variant="outline">{change.label}</Badge>
                    <span className="text-muted-foreground line-through">{change.original_value}</span>
                    <span>→</span>
                    <span className="font-medium">{change.new_value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reasoning / Freeform Note */}
          <div className="space-y-2">
            <Label htmlFor="reasoning">
              {isFreeformNote ? 'Hvad skal systemet huske?' : 'Hvorfor ændrede du dette?'}
            </Label>
            <Textarea
              id="reasoning"
              placeholder={isFreeformNote 
                ? "F.eks.: 'Denne kunde har altid ekstra ønsker' eller 'Adgangsforholdene er vanskelige her'"
                : "F.eks.: 'Kælderarbejde tager altid længere pga. vanskelig adgang' eller 'Kundens materialer er af lavere kvalitet'"
              }
              value={reasoning}
              onChange={(e) => setReasoning(e.target.value)}
              rows={4}
            />
          </div>

          {/* Scope */}
          <div className="space-y-2">
            <Label>Hvornår skal dette gælde?</Label>
            <RadioGroup value={scope} onValueChange={(v) => setScope(v as any)}>
              <div className="flex items-start space-x-2">
                <RadioGroupItem value="this_only" id="this_only" />
                <div className="grid gap-1">
                  <Label htmlFor="this_only" className="font-normal cursor-pointer">
                    Kun denne sag
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {getScopeDescription('this_only')}
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-2">
                <RadioGroupItem value="similar" id="similar" />
                <div className="grid gap-1">
                  <Label htmlFor="similar" className="font-normal cursor-pointer">
                    Lignende sager
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {getScopeDescription('similar')}
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-2">
                <RadioGroupItem value="always" id="always" />
                <div className="grid gap-1">
                  <Label htmlFor="always" className="font-normal cursor-pointer">
                    Alle {projectType?.replace('_', ' ')} projekter
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {getScopeDescription('always')}
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Spring over
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Gemmer...' : 'Gem rettelse'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
