// Shared AI Client for OpenAI Chat Completions API
// Supports GPT-5.2, GPT-5-mini, GPT-5-nano (Option A: All use GPT-5.2 with different reasoning levels)

export type AIModel = 'gpt-5.2' | 'gpt-5-mini' | 'gpt-5-nano';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIRequestOptions {
  model?: AIModel;
  reasoning_effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  max_completion_tokens?: number;
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
  model: 'gpt-5.2',
  reasoning_effort: 'medium',
  max_completion_tokens: 16000,
};

/**
 * Call OpenAI Chat Completions API
 * Uses /v1/chat/completions endpoint with GPT-5.x models
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

  // Build request body per OpenAI Chat Completions spec
  const requestBody: Record<string, any> = {
    model: opts.model,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content
    })),
    max_completion_tokens: opts.max_completion_tokens,
  };

  // Add reasoning_effort for thinking capability (GPT-5.2 supports this)
  if (opts.reasoning_effort && opts.reasoning_effort !== 'none') {
    requestBody.reasoning_effort = opts.reasoning_effort;
  }

  // Add temperature if specified
  if (opts.temperature !== undefined) {
    requestBody.temperature = opts.temperature;
  }

  console.log(`🤖 Calling ${opts.model} (reasoning: ${opts.reasoning_effort || 'none'}) with ${messages.length} messages...`);

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

  // Extract response from standard chat completion format
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
 * Quick AI call with GPT-5.2 (low reasoning) for simple tasks
 * Option A: Use GPT-5.2 for all tasks with different reasoning levels
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
      model: 'gpt-5.2',
      reasoning_effort: 'low',
      max_completion_tokens: 4000,
    }
  );
  return response.output_text;
}

/**
 * Reasoning AI call with GPT-5.2 (high reasoning) for complex analysis
 */
export async function reasoningAI(
  systemPrompt: string,
  userPrompt: string,
  effort: 'low' | 'medium' | 'high' | 'xhigh' = 'high'
): Promise<string> {
  const response = await callAI(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    {
      model: 'gpt-5.2',
      reasoning_effort: effort,
      max_completion_tokens: 20000,
    }
  );
  return response.output_text;
}
