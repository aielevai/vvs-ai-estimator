import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/lib/supabase-client";
import { Mail, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TestEmailProps {
  onCaseCreated?: () => void;
}

export default function TestEmail({ onCaseCreated }: TestEmailProps) {
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!content.trim()) {
      toast({
        title: "Fejl",
        description: "Indtast venligst email indhold",
        variant: "destructive"
      });
      return;
    }

    setSending(true);
    try {
      const newCase = await db.createCase({
        subject: subject || 'Test henvendelse',
        description: content,
        email_content: JSON.stringify({ 
          subject, 
          content, 
          from: 'test@kunde.dk', 
          date: new Date().toISOString() 
        }),
        status: 'new'
      });

      toast({
        title: "Sag Oprettet",
        description: `Test sag ${newCase.id} er oprettet og klar til analyse`
      });

      // Clear form
      setSubject('');
      setContent('');
      
      // Notify parent component
      onCaseCreated?.();
    } catch (error) {
      console.error('Failed to create test case:', error);
      toast({
        title: "Fejl",
        description: "Kunne ikke oprette test sag",
        variant: "destructive"
      });
    } finally {
      setSending(false);
    }
  };

  const loadSampleData = () => {
    setSubject('Nyt badeværelse 12m²');
    setContent(`Hej Valentin VVS,

Jeg skal have renoveret mit badeværelse på 12 m². Huset er fra 1970, så det er et ældre anlæg der skal skiftes ud.

Badeværelset ligger i kælderen, og jeg ønsker komplet renovering med nyt flisegulv, nyt toilet, brusekabine og vask.

Kan I komme og lave et tilbud?

Mvh
Lars Larsen
Telefon: 12345678
Email: lars@test.dk
Adresse: Testvej 123, 2000 Frederiksberg`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Test Email System
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="subject">Email Emne</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="f.eks. Nyt badeværelse 12m²"
            />
          </div>

          <div>
            <Label htmlFor="content">Email Indhold</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Indtast email indhold fra kunde..."
              rows={8}
              className="resize-none"
            />
          </div>

          <div className="flex gap-3">
            <Button 
              type="submit" 
              disabled={sending}
              className="vvs-button-primary"
            >
              <Send className="h-4 w-4 mr-2" />
              {sending ? 'Opretter...' : 'Opret Test Sag'}
            </Button>
            
            <Button 
              type="button"
              variant="outline"
              onClick={loadSampleData}
              disabled={sending}
            >
              Indlæs Eksempel
            </Button>
          </div>
        </form>

        <div className="mt-6 p-4 bg-muted rounded-lg">
          <h4 className="font-medium mb-2">Test Flow:</h4>
          <ol className="text-sm space-y-1 text-muted-foreground">
            <li>1. Opret test sag med email indhold</li>
            <li>2. Klik på sagen i dashboardet</li>
            <li>3. Tryk "Analyser med AI" for GPT-5 analyse</li>
            <li>4. Tryk "Generer Tilbud" for automatisk prisberegning</li>
            <li>5. Gennemse tilbud og godkend til E-regnskab</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}