export interface ParseResult {
  parsed?: unknown;
  failureCategory?: 'invalid_json' | 'schema_invalid' | 'refusal' | 'truncated';
  rawTrimmed: string;
}

export function parseStructuredOutput(rawContent: string, finishReason: string | undefined, responseFormat: any): ParseResult {
  let content = rawContent.trim();
  
  if (finishReason === 'length') {
    return { rawTrimmed: content, failureCategory: 'truncated' };
  }

  if (!content) {
    return { rawTrimmed: content, failureCategory: 'invalid_json' };
  }

  const refusalPatterns = [/i cannot/i, /i'm sorry, but i can't/i, /as an ai/i];
  if (refusalPatterns.some(p => p.test(content))) {
    return { rawTrimmed: content, failureCategory: 'refusal' };
  }

  if (content.startsWith('```json')) {
    content = content.replace(/^```json\s*/, '');
    if (content.endsWith('```')) {
      content = content.replace(/\s*```$/, '');
    }
  } else if (content.startsWith('```')) {
    content = content.replace(/^```\s*/, '');
    if (content.endsWith('```')) {
      content = content.replace(/\s*```$/, '');
    }
  }

  content = content.trim();

  try {
    const parsed = JSON.parse(content);
    return { parsed, rawTrimmed: content };
  } catch (e) {
    return { rawTrimmed: content, failureCategory: 'invalid_json' };
  }
}
