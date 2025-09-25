import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting Gmail sync...');

    // Get Gmail credentials from Supabase secrets
    const clientId = Deno.env.get('GMAIL_CLIENT_ID');
    const clientSecret = Deno.env.get('GMAIL_CLIENT_SECRET');
    const refreshToken = Deno.env.get('GMAIL_REFRESH_TOKEN');

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error('Missing Gmail credentials');
    }

    // Get new access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Failed to get access token: ${tokenResponse.statusText}`);
    }

    const { access_token } = await tokenResponse.json();
    console.log('Got access token successfully');

    // Check for emails from the last hour to avoid processing old emails
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const query = `after:${Math.floor(oneHourAgo.getTime() / 1000)}`;

    // Get recent emails
    const gmailResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=10`,
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
        },
      }
    );

    if (!gmailResponse.ok) {
      throw new Error(`Failed to fetch emails: ${gmailResponse.statusText}`);
    }

    const { messages } = await gmailResponse.json();
    
    if (!messages || messages.length === 0) {
      console.log('No new emails found');
      return new Response(JSON.stringify({ 
        message: 'No new emails found',
        processed: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${messages.length} emails to process`);

    // Process each email
    let processedCount = 0;
    for (const message of messages) {
      try {
        // Get full email details
        const emailResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}`,
          {
            headers: {
              'Authorization': `Bearer ${access_token}`,
            },
          }
        );

        if (!emailResponse.ok) {
          console.error(`Failed to fetch email ${message.id}: ${emailResponse.statusText}`);
          continue;
        }

        const emailData = await emailResponse.json();
        
        // Extract email details
        const headers = emailData.payload?.headers || [];
        const subjectHeader = headers.find((h: any) => h.name.toLowerCase() === 'subject');
        const fromHeader = headers.find((h: any) => h.name.toLowerCase() === 'from');
        const dateHeader = headers.find((h: any) => h.name.toLowerCase() === 'date');
        
        const subject = subjectHeader?.value || 'No Subject';
        const from = fromHeader?.value || 'Unknown Sender';
        const receivedDate = dateHeader?.value || new Date().toISOString();

        // Extract email body
        let body = '';
        if (emailData.payload?.body?.data) {
          body = atob(emailData.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        } else if (emailData.payload?.parts) {
          for (const part of emailData.payload.parts) {
            if (part.mimeType === 'text/plain' && part.body?.data) {
              body = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
              break;
            }
          }
        }

        // Check if this email was already processed using message ID
        const { data: existingCase } = await supabase
          .from('cases')
          .select('id')
          .eq('email_message_id', message.id)
          .single();

        if (existingCase) {
          console.log(`Email ${message.id} already processed, skipping`);
          continue;
        }

        // Create new case
        const { data: newCase, error: caseError } = await supabase
          .from('cases')
          .insert({
            subject,
            description: body,
            email_message_id: message.id,
            email_content: JSON.stringify({
              id: message.id,
              subject,
              from,
              body,
              receivedDate,
              fullPayload: emailData
            }),
            status: 'new',
            urgency: 'normal'
          })
          .select()
          .single();

        if (caseError) {
          console.error('Failed to create case:', caseError);
          continue;
        }

        console.log(`Created case ${newCase.id} for email ${message.id}`);

        // Automatically trigger AI analysis
        try {
          const analysisResponse = await fetch(`${supabaseUrl}/functions/v1/analyze-email`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              emailContent: body,
              subject: subject
            }),
          });

          if (analysisResponse.ok) {
            const analysisResult = await analysisResponse.json();
            
            // Update case with analysis
            await supabase
              .from('cases')
              .update({
                extracted_data: analysisResult,
                status: 'analyzed',
                updated_at: new Date().toISOString()
              })
              .eq('id', newCase.id);

            console.log(`Analysis completed for case ${newCase.id}`);

            // Automatically trigger quote calculation
            try {
              const quoteResponse = await fetch(`${supabaseUrl}/functions/v1/calculate-quote`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${supabaseKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  caseId: newCase.id
                }),
              });

              if (quoteResponse.ok) {
                console.log(`Quote generated for case ${newCase.id}`);
              } else {
                console.error(`Failed to generate quote for case ${newCase.id}:`, await quoteResponse.text());
              }
            } catch (quoteError) {
              console.error(`Error generating quote for case ${newCase.id}:`, quoteError);
            }
          } else {
            console.error(`Failed to analyze case ${newCase.id}:`, await analysisResponse.text());
          }
        } catch (analysisError) {
          console.error(`Error analyzing case ${newCase.id}:`, analysisError);
        }

        processedCount++;
      } catch (emailError) {
        console.error(`Error processing email ${message.id}:`, emailError);
      }
    }

    console.log(`Gmail sync completed. Processed ${processedCount} emails.`);

    return new Response(JSON.stringify({ 
      message: 'Gmail sync completed',
      emailsFound: messages.length,
      processed: processedCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in gmail-sync function:', error);
    return new Response(JSON.stringify({ 
      error: (error as any).message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});