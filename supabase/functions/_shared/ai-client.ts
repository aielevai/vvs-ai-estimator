// Shared AI Client for OpenAI Responses API
// Supports GPT-5.2, GPT-5-mini, GPT-5-nano

export type AIModel = 'gpt-5.2' | 'gpt-5-mini' | 'gpt-5-nano';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIRequestOptions {
  model?: AIModel;
  reasoning?: {
    effort: 'low' | 'medium' | 'high';
  };
  max_output_tokens?: number;
  temperature?: number;
}

export interface AIResponse {
  output_text: string;
  thinking?: string;
  model: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

const DEFAULT_OPTIONS: AIRequestOptions = {
  model: 'gpt-5.2',
  reasoning: { effort: 'medium' },
  max_output_tokens: 16000,
};

/**
 * Call OpenAI Responses API
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

  // Build input array from messages
  const input = messages.map(m => ({
    role: m.role,
    content: m.content
  }));

  const requestBody: Record<string, any> = {
    model: opts.model,
    input,
    max_output_tokens: opts.max_output_tokens,
  };

  // Add reasoning for GPT-5.2 (supports thinking/reasoning)
  if (opts.model === 'gpt-5.2' && opts.reasoning) {
    requestBody.reasoning = opts.reasoning;
  }

  // Add temperature if specified
  if (opts.temperature !== undefined) {
    requestBody.temperature = opts.temperature;
  }

  console.log(`🤖 Calling ${opts.model} with ${input.length} messages...`);

  const response = await fetch('https://api.openai.com/v1/responses', {
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

  // Extract response based on model
  let output_text = '';
  let thinking = '';

  if (data.output_text) {
    output_text = data.output_text;
  } else if (data.output && Array.isArray(data.output)) {
    // Handle multi-part response
    for (const part of data.output) {
      if (part.type === 'reasoning' || part.type === 'thinking') {
        thinking += part.content || part.summary || '';
      } else if (part.type === 'message' || part.type === 'text') {
        output_text += part.content || '';
      }
    }
  }

  console.log(`✅ ${opts.model} response received (${output_text.length} chars)`);

  return {
    output_text,
    thinking,
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
 * Quick AI call with GPT-5-nano for simple tasks
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
      model: 'gpt-5-nano',
      max_output_tokens: 2000,
    }
  );
  return response.output_text;
}

/**
 * Reasoning AI call with GPT-5.2 for complex analysis
 */
export async function reasoningAI(
  systemPrompt: string,
  userPrompt: string,
  effort: 'low' | 'medium' | 'high' = 'medium'
): Promise<{ output: string; thinking: string }> {
  const response = await callAI(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    {
      model: 'gpt-5.2',
      reasoning: { effort },
      max_output_tokens: 16000,
    }
  );
  return {
    output: response.output_text,
    thinking: response.thinking || ''
  };
}
