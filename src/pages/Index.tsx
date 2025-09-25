import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Dashboard from '@/components/Dashboard';
import TestEmail from '@/components/TestEmail';
import EnhancedQuoteGenerator from '@/components/EnhancedQuoteGenerator';
import { DataImporter } from '@/components/DataImporter';

const Index = () => {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleCaseCreated = () => {
    // Force dashboard refresh when new case is created
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-background">
      <Tabs defaultValue="dashboard" className="w-full">
        <div className="vvs-header text-white py-4">
          <div className="vvs-container">
            <TabsList className="bg-white/20 border-0">
              <TabsTrigger 
                value="dashboard" 
                className="text-white data-[state=active]:bg-white data-[state=active]:text-primary"
              >
                Dashboard
              </TabsTrigger>
                <TabsTrigger 
                  value="test" 
                  className="text-white data-[state=active]:bg-white data-[state=active]:text-primary"
                >
                  Test System
                </TabsTrigger>
                <TabsTrigger 
                  value="enhanced" 
                  className="text-white data-[state=active]:bg-white data-[state=active]:text-primary"
                >
                  AI Tilbud
                </TabsTrigger>
                <TabsTrigger 
                  value="import" 
                  className="text-white data-[state=active]:bg-white data-[state=active]:text-primary"
                >
                  Import Data
                </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <TabsContent value="dashboard" className="mt-0">
          <Dashboard key={refreshKey} />
        </TabsContent>
        
        <TabsContent value="test" className="mt-0">
          <div className="vvs-container py-8">
            <TestEmail onCaseCreated={handleCaseCreated} />
          </div>
        </TabsContent>
        
        <TabsContent value="enhanced" className="mt-0">
          <div className="vvs-container py-8">
            <EnhancedQuoteGenerator />
          </div>
        </TabsContent>
        
        <TabsContent value="import" className="mt-0">
          <div className="vvs-container py-8">
            <DataImporter />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Index;
