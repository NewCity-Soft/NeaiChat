/**
 * Strip C-style comments (// and block comments) outside of string literals
 */
function stripComments(input: string): string {
  let result = '';
  let inString = false;
  let isEscaped = false;
  let inSingleComment = false;
  let inMultiComment = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const nextChar = input[i + 1];

    if (inSingleComment) {
      if (char === '\n' || char === '\r') {
        inSingleComment = false;
        result += char;
      }
      continue;
    }

    if (inMultiComment) {
      if (char === '*' && nextChar === '/') {
        inMultiComment = false;
        i++; // skip '/'
      }
      continue;
    }

    if (inString) {
      result += char;
      if (isEscaped) {
        isEscaped = false;
      } else if (char === '\\') {
        isEscaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }

    if (char === '/' && nextChar === '/') {
      inSingleComment = true;
      i++; // skip second '/'
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inMultiComment = true;
      i++; // skip '*'
      continue;
    }

    result += char;
  }

  return result;
}

/**
 * Normalizes unquoted keys or single quotes outside of existing valid double-quoted strings.
 */
function fixQuotesAndKeys(input: string): string {
  try {
    JSON.parse(input);
    return input;
  } catch {}

  let fixed = input.replace(/([{,]\s*)([a-zA-Z0-9_$]+)\s*:/g, '$1"$2":');

  fixed = fixed.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_match, p1) => {
    return '"' + p1.replace(/"/g, '\\"').replace(/\\'/g, "'") + '"';
  });

  return fixed;
}

/**
 * Repairs a broken, incomplete, or damaged JSON string and returns a valid JSON string.
 */
export function repairJSON(input: string | undefined | null): string {
  if (input === undefined || input === null) return '{}';
  if (typeof input !== 'string') {
    try {
      return JSON.stringify(input);
    } catch {
      return '{}';
    }
  }

  let cleaned = input.trim();
  if (!cleaned) return '{}';

  // 1. Remove markdown code block wraps if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  // 2. Direct fast path check
  try {
    const parsed = JSON.parse(cleaned);
    return JSON.stringify(parsed);
  } catch (e) {
    // Continue to repair attempts
  }

  // 3. Extract JSON object/array if embedded in commentary text
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  let startIdx = -1;

  if (firstBrace !== -1 && firstBracket !== -1) {
    startIdx = Math.min(firstBrace, firstBracket);
  } else if (firstBrace !== -1) {
    startIdx = firstBrace;
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
  }

  if (startIdx > 0) {
    cleaned = cleaned.slice(startIdx);
  }

  // 4. Sanitize raw unescaped newlines/tabs inside double-quoted string values & close quotes
  let repaired = '';
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];

    if (inString) {
      if (isEscaped) {
        repaired += char;
        isEscaped = false;
      } else if (char === '\\') {
        repaired += char;
        isEscaped = true;
      } else if (char === '"') {
        repaired += char;
        inString = false;
      } else if (char === '\n') {
        repaired += '\\n';
      } else if (char === '\r') {
        repaired += '\\r';
      } else if (char === '\t') {
        repaired += '\\t';
      } else {
        repaired += char;
      }
    } else {
      if (char === '"') {
        inString = true;
      }
      repaired += char;
    }
  }

  // If string was left unterminated at the end, close it
  if (inString) {
    if (isEscaped) {
      repaired = repaired.slice(0, -1);
    }
    repaired += '"';
  }

  // 5. Strip comments outside of strings
  repaired = stripComments(repaired);

  // 6. Fix quotes and unquoted keys
  repaired = fixQuotesAndKeys(repaired);

  // 7. Track bracket stack & unclosed quotes/brackets
  const stack: string[] = [];
  let inStr = false;
  let esc = false;

  for (let i = 0; i < repaired.length; i++) {
    const c = repaired[i];
    if (inStr) {
      if (esc) {
        esc = false;
      } else if (c === '\\') {
        esc = true;
      } else if (c === '"') {
        inStr = false;
      }
    } else {
      if (c === '"') {
        inStr = true;
      } else if (c === '{') {
        stack.push('}');
      } else if (c === '[') {
        stack.push(']');
      } else if (c === '}' || c === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === c) {
          stack.pop();
        }
      }
    }
  }

  if (inStr) {
    repaired += '"';
  }

  // 8. Clean up incomplete trailing elements (colons, commas, dangling key names)
  let resultStr = repaired.trim();

  // If ending with colon e.g. {"a": 1, "b":
  if (resultStr.endsWith(':')) {
    resultStr += ' null';
  }

  // Remove trailing commas
  while (resultStr.endsWith(',')) {
    resultStr = resultStr.slice(0, -1).trim();
    if (resultStr.endsWith(':')) {
      resultStr += ' null';
    }
  }

  // If ending with a key string without a colon, e.g. {"a": 1, "b"
  const trimmed = resultStr.trim();
  if (stack.length > 0 && stack[stack.length - 1] === '}') {
    if (/(?:[\{,]\s*)"[^"]+"$/.test(trimmed)) {
      resultStr += ': null';
    }
  }

  while (resultStr.endsWith(',')) {
    resultStr = resultStr.slice(0, -1).trim();
  }

  // Close remaining open brackets in reverse order
  while (stack.length > 0) {
    resultStr += stack.pop();
  }

  // 9. Check if resultStr parses as valid JSON
  try {
    const parsed = JSON.parse(resultStr);
    return JSON.stringify(parsed);
  } catch (err) {
    // Fallback: strip trailing comma before braces/brackets
    try {
      const sanitized = resultStr
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
      const parsed = JSON.parse(sanitized);
      return JSON.stringify(parsed);
    } catch (err2) {
      console.warn('repairJSON failed to parse/repair string:', input, err2);
      if (cleaned.startsWith('[')) return '[]';
      return '{}';
    }
  }
}

/**
 * Safely parse JSON strings generated by LLMs, handling raw unescaped newlines inside quotes,
 * missing closing quotes, trailing commas, markdown formatting, and unterminated brackets.
 */
export function safeParseJSON<T = any>(input: string | undefined | null, fallback: T = {} as T): T {
  if (input === undefined || input === null) return fallback;
  if (typeof input !== 'string') {
    if (typeof input === 'object') return input as T;
    return fallback;
  }

  const cleaned = input.trim();
  if (!cleaned) return fallback;

  // 1. Direct standard parse
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Continue to repair
  }

  // 2. Repair JSON string and parse
  try {
    const repaired = repairJSON(cleaned);
    return JSON.parse(repaired);
  } catch (e) {
    return fallback;
  }
}

/**
 * Check if a string is a potentially complete JSON object or array.
 */
export function isJSONComplete(input: string): boolean {
  if (!input || typeof input !== 'string') return false;
  const trimmed = input.trim();
  if (!trimmed) return false;

  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed);
      return true;
    } catch (e) {
      return false;
    }
  }
  return false;
}

