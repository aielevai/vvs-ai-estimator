import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { supabaseAdmin } from '../_shared/supabase.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = supabaseAdmin;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting Gmail sync...');

    // ============================================
    // STEP 0: Retry failed cases (max 3 retries)
    // ============================================
    const { data: failedCases } = await supabase
      .from('cases')
      .select('id, subject, processing_status')
      .filter('processing_status->>step', 'eq', 'error');

    if (failedCases && failedCases.length > 0) {
      console.log(`🔄 Found ${failedCases.length} failed cases to retry`);
      
      for (const failedCase of failedCases) {
        const retries = (failedCase.processing_status as any)?.retries || 0;
        
        if (retries >= 3) {
          console.log(`⏭️ Case ${failedCase.id} has exceeded max retries (${retries}), skipping`);
          continue;
        }

        console.log(`🔄 Retrying case ${failedCase.id} (attempt ${retries + 1}/3)`);

        // Update status to retrying
        await supabase.from('cases').update({
          processing_status: {
            step: 'analyzing',
            progress: 10,
            message: `Prøver igen (forsøg ${retries + 1}/3)...`,
            retries: retries + 1
          }
        }).eq('id', failedCase.id);

        try {
          // Retry calculate-quote
          const quoteResponse = await fetch(`${supabaseUrl}/functions/v1/calculate-quote`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ caseId: failedCase.id }),
          });

          if (quoteResponse.ok) {
            const quoteData = await quoteResponse.json();
            console.log(`✅ Retry successful for case ${failedCase.id}`);
            
            await supabase.from('cases').update({
              status: 'quoted',
              processing_status: {
                step: 'complete',
                progress: 100,
                message: 'Tilbud klar!'
              }
            }).eq('id', failedCase.id);
          } else {
            const errorText = await quoteResponse.text();
            console.error(`❌ Retry failed for case ${failedCase.id}:`, errorText);
            
            await supabase.from('cases').update({
              processing_status: {
                step: 'error',
                progress: 0,
                message: `Fejl: ${errorText.substring(0, 100)}`,
                retries: retries + 1
              }
            }).eq('id', failedCase.id);
          }
        } catch (retryError) {
          console.error(`❌ Retry exception for case ${failedCase.id}:`, retryError);
          await supabase.from('cases').update({
            processing_status: {
              step: 'error',
              progress: 0,
              message: 'Fejl ved retry',
              retries: retries + 1
            }
          }).eq('id', failedCase.id);
        }
      }
    }

    // ============================================
    // STEP 1: Gmail sync - process new emails
    // ============================================
    
    // Get Gmail credentials from Supabase secrets
    const clientId = Deno.env.get('GMAIL_CLIENT_ID');
    const clientSecret = Deno.env.get('GMAIL_CLIENT_SECRET');
    const refreshToken = Deno.env.get('GMAIL_REFRESH_TOKEN');

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error('Missing Gmail credentials');
    }

    // Get last sync timestamp from database
    const { data: syncState, error: syncStateError } = await supabase
      .from('gmail_sync_state')
      .select('id, last_sync_at')
      .single();

    if (syncStateError) {
      console.log('No sync state found, will use 5 minute fallback');
    }

    // Use last sync time, or 5 minutes ago as fallback for first run
    const lastSyncAt = syncState?.last_sync_at
      ? new Date(syncState.last_sync_at)
      : new Date(Date.now() - 5 * 60 * 1000);

    console.log(`📅 Last sync: ${lastSyncAt.toISOString()}`);

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

    // Query Gmail for emails AFTER last sync
    const query = `after:${Math.floor(lastSyncAt.getTime() / 1000)}`;
    console.log(`📧 Gmail query: ${query}`);

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
      
      // Update sync state even if no emails
      if (syncState?.id) {
        await supabase
          .from('gmail_sync_state')
          .update({ 
            last_sync_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', syncState.id);
      }
      
      return new Response(JSON.stringify({ 
        message: 'No new emails found',
        processed: 0,
        retriedFailed: failedCases?.length || 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${messages.length} emails to process`);

    // Process each email - NO AGE FILTER, email_message_id uniqueness is sufficient
    let processedCount = 0;
    let skippedExisting = 0;
    
    for (const message of messages) {
      try {
        // Check if this email was already processed using message ID FIRST (before fetching full email)
        const { data: existingCase } = await supabase
          .from('cases')
          .select('id')
          .eq('email_message_id', message.id)
          .maybeSingle();

        if (existingCase) {
          console.log(`📋 Email ${message.id} already processed, skipping`);
          skippedExisting++;
          continue;
        }

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
            urgency: 'normal',
            processing_status: {
              step: 'analyzing',
              progress: 10,
              message: 'AI analyserer email...'
            }
          })
          .select()
          .single();

        if (caseError) {
          // Unique constraint violation (23505) = email already exists
          if (caseError.code === '23505') {
            console.log(`Email ${message.id} already exists (constraint), skipping`);
            skippedExisting++;
            continue;
          }
          console.error('Failed to create case:', caseError);
          continue;
        }

        console.log(`✅ Created case ${newCase.id} for email ${message.id}`);

        // ============================================
        // AUTOMATIC FLOW: analyze-email → calculate-quote
        // ============================================
        try {
          // Step 1: AI Analysis
          const analysisResponse = await fetch(`${supabaseUrl}/functions/v1/analyze-email`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              emailContent: body,
              subject: subject,
              caseId: newCase.id
            }),
          });

          if (analysisResponse.ok) {
            const analysisResult = await analysisResponse.json();
            const analysisData = analysisResult?.data || analysisResult;

            // Update case with analysis + processing status
            await supabase
              .from('cases')
              .update({
                extracted_data: analysisData,
                status: 'analyzed',
                processing_status: {
                  step: 'materials',
                  progress: 50,
                  message: 'Finder materialer...'
                },
                updated_at: new Date().toISOString()
              })
              .eq('id', newCase.id);

            console.log(`Analysis completed for case ${newCase.id}`);

            // Step 2: Quote Calculation
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
                const quoteResult = await quoteResponse.json();
                const quoteData = quoteResult.data || quoteResult;

                console.log(`✅ Quote generated for case ${newCase.id}:`, {
                  quote_number: quoteData.quote?.quote_number,
                  total: quoteData.total,
                  labor_hours: quoteData.laborHours
                });

                // Mark as complete
                await supabase
                  .from('cases')
                  .update({
                    status: 'quoted',
                    processing_status: {
                      step: 'complete',
                      progress: 100,
                      message: 'Tilbud klar!'
                    }
                  })
                  .eq('id', newCase.id);
                
                console.log(`✅ Case ${newCase.id} fully processed`);

              } else {
                const errorText = await quoteResponse.text();
                console.error(`❌ Failed to generate quote for case ${newCase.id}:`, errorText);
                await supabase
                  .from('cases')
                  .update({
                    processing_status: {
                      step: 'error',
                      progress: 0,
                      message: `Tilbudsfejl: ${errorText.substring(0, 100)}`,
                      retries: 0
                    }
                  })
                  .eq('id', newCase.id);
              }
            } catch (quoteError) {
              console.error(`❌ Error generating quote for case ${newCase.id}:`, quoteError);
              await supabase
                .from('cases')
                .update({
                  processing_status: {
                    step: 'error',
                    progress: 0,
                    message: 'Fejl ved tilbudsberegning',
                    retries: 0
                  }
                })
                .eq('id', newCase.id);
            }
          } else {
            const errorText = await analysisResponse.text();
            console.error(`Failed to analyze case ${newCase.id}:`, errorText);
            await supabase
              .from('cases')
              .update({
                processing_status: {
                  step: 'error',
                  progress: 0,
                  message: `Analysefejl: ${errorText.substring(0, 100)}`,
                  retries: 0
                }
              })
              .eq('id', newCase.id);
          }
        } catch (analysisError) {
          console.error(`Error analyzing case ${newCase.id}:`, analysisError);
          await supabase
            .from('cases')
            .update({
              processing_status: {
                step: 'error',
                progress: 0,
                message: 'Fejl ved AI-analyse',
                retries: 0
              }
            })
            .eq('id', newCase.id);
        }

        processedCount++;
      } catch (emailError) {
        console.error(`Error processing email ${message.id}:`, emailError);
      }
    }

    // Update sync state with current timestamp AFTER successful processing
    if (syncState?.id) {
      await supabase
        .from('gmail_sync_state')
        .update({ 
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', syncState.id);
      console.log('📅 Updated last_sync_at to now');
    }

    console.log(`Gmail sync completed. Processed: ${processedCount}, Skipped existing: ${skippedExisting}, Retried failed: ${failedCases?.length || 0}`);

    return new Response(JSON.stringify({ 
      message: 'Gmail sync completed',
      emailsFound: messages.length,
      processed: processedCount,
      skippedExisting,
      retriedFailed: failedCases?.length || 0
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
