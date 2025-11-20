import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Send, Sparkles, Search, Plus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Message {
  role: 'user' | 'assistant';
  content: string;
  materials?: any[];
}

interface QuoteChatAssistantProps {
  caseId: string;
  projectType: string;
  onMaterialsUpdated?: (materials: any[]) => void;
}

export default function QuoteChatAssistant({ 
  caseId, 
  projectType, 
  onMaterialsUpdated 
}: QuoteChatAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Hej! Jeg kan hjælpe dig med at finde materialer til dette projekt. Prøv at skrive "tilføj 10m PEX rør" eller "søg efter toilet".'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const searchMaterials = async (query: string) => {
    const { data, error } = await supabase
      .from('enhanced_supplier_prices')
      .select('*')
      .or(`short_description.ilike.%${query}%,long_description.ilike.%${query}%,normalized_text.ilike.%${query}%`)
      .limit(10);
    
    if (!error && data) {
      return data;
    }
    return [];
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      // Check if it's a search query
      if (userMessage.toLowerCase().includes('søg') || userMessage.toLowerCase().includes('find')) {
        const searchQuery = userMessage.replace(/søg|find|efter/gi, '').trim();
        const results = await searchMaterials(searchQuery);
        
        setSearchResults(results);
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Jeg fandt ${results.length} produkter der matcher "${searchQuery}". Se resultaterne nedenfor.`,
          materials: results
        }]);
      } 
      // Check if it's an add command
      else if (userMessage.toLowerCase().includes('tilføj')) {
        const searchQuery = userMessage.replace(/tilføj/gi, '').trim();
        const results = await searchMaterials(searchQuery);
        
        if (results.length > 0) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `Fandt ${results.length} produkter til "${searchQuery}". Vælg hvilke du vil tilføje:`,
            materials: results.slice(0, 5)
          }]);
          setSearchResults(results.slice(0, 5));
        } else {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `Kunne ikke finde produkter der matcher "${searchQuery}". Prøv at søge mere specifikt.`
          }]);
        }
      }
      // General query
      else {
        const results = await searchMaterials(userMessage);
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Her er ${results.length} relevante produkter:`,
          materials: results.slice(0, 5)
        }]);
        setSearchResults(results.slice(0, 5));
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Beklager, der opstod en fejl. Prøv igen.'
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMaterial = (material: any) => {
    if (onMaterialsUpdated) {
      onMaterialsUpdated([{
        supplier_item_id: material.supplier_item_id,
        description: material.short_description,
        quantity: 1,
        unit_price: material.net_price || material.gross_price,
        unit: material.price_unit,
        total_price: material.net_price || material.gross_price,
        validated: true
      }]);
    }
    
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: `✅ Tilføjet: ${material.short_description} (${material.net_price || material.gross_price} kr)`
    }]);
  };

  return (
    <Card className="vvs-card h-[600px] flex flex-col">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          AI Materiale Assistent
        </CardTitle>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col p-4 overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 mb-4">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-lg px-4 py-2 ${
                msg.role === 'user' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted'
              }`}>
                <p className="text-sm">{msg.content}</p>
                
                {msg.materials && msg.materials.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {msg.materials.map((material, midx) => (
                      <div key={midx} className="bg-background rounded p-2 text-xs space-y-1">
                        <div className="font-medium flex items-center justify-between">
                          <span>{material.short_description}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleAddMaterial(material)}
                            className="h-6 px-2"
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="text-muted-foreground flex items-center justify-between">
                          <span>{material.supplier_item_id}</span>
                          <Badge variant="secondary" className="text-xs">
                            {material.net_price || material.gross_price} kr
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-4 py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Skriv 'tilføj toilet' eller 'søg PEX rør'..."
            disabled={loading}
          />
          <Button 
            onClick={handleSend} 
            disabled={loading || !input.trim()}
            className="vvs-button-primary"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
