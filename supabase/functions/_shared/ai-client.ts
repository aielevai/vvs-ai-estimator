// Shared AI Client for OpenAI Chat Completions API
// Supports gpt-4o, gpt-4o-mini, gpt-4-turbo and custom models

export type AIModel = 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4-turbo' | 'gpt-3.5-turbo' | string;

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIRequestOptions {
  model?: AIModel;
  max_tokens?: number;
  temperature?: number;
}

export interface AIResponse {
  output_text: string;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

const DEFAULT_OPTIONS: AIRequestOptions = {
  model: 'gpt-4o',
  max_tokens: 16000,
};

/**
 * Call OpenAI Chat Completions API
 * @param messages Array of messages to send
 * @param options Request options
 * @returns AI response
 */
export async function callAI(
  messages: AIMessage[],
  options: AIRequestOptions = {}
): Promise<AIResponse> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };

  const requestBody: Record<string, any> = {
    model: opts.model,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content
    })),
    max_completion_tokens: opts.max_tokens,
  };

  // Add temperature if specified
  if (opts.temperature !== undefined) {
    requestBody.temperature = opts.temperature;
  }

  console.log(`🤖 Calling ${opts.model} with ${messages.length} messages...`);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error('OpenAI API error:', response.status, errorData);
    throw new Error(`OpenAI API error: ${response.status} ${errorData}`);
  }

  const data = await response.json();

  // Extract response from chat completion format
  const output_text = data.choices?.[0]?.message?.content || '';

  console.log(`✅ ${opts.model} response received (${output_text.length} chars)`);

  return {
    output_text,
    model: opts.model!,
    usage: data.usage,
  };
}

/**
 * Parse JSON from AI response, handling markdown code blocks
 */
export function parseAIJson<T = any>(text: string): T {
  let cleanText = text.trim();

  // Remove markdown code blocks if present
  if (cleanText.startsWith('```json')) {
    cleanText = cleanText.slice(7);
  } else if (cleanText.startsWith('```')) {
    cleanText = cleanText.slice(3);
  }

  if (cleanText.endsWith('```')) {
    cleanText = cleanText.slice(0, -3);
  }

  cleanText = cleanText.trim();

  try {
    return JSON.parse(cleanText);
  } catch (e) {
    console.error('Failed to parse AI JSON:', e);
    console.error('Raw text:', text.substring(0, 500));
    throw new Error('Failed to parse AI response as JSON');
  }
}

/**
 * Quick AI call with GPT-4o-mini for simple tasks
 */
export async function quickAI(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const response = await callAI(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    {
      model: 'gpt-4o-mini',
      max_tokens: 2000,
    }
  );
  return response.output_text;
}
