/**
 * Extract a JSON object/array from model text (fenced or bare).
 * Truncated objects are repaired by closing open strings and brackets.
 */
export function extractJsonPayload(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Empty model response; expected JSON");
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    /* continue */
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim()) as unknown;
    } catch {
      const repairedFence = repairTruncatedJson(fenced[1]);
      if (repairedFence) return repairedFence;
    }
  }

  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) {
    try {
      return JSON.parse(objectMatch[0]) as unknown;
    } catch {
      /* continue */
    }
  }

  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrayMatch?.[0]) {
    try {
      return JSON.parse(arrayMatch[0]) as unknown;
    } catch {
      /* continue */
    }
  }

  const repaired = repairTruncatedJson(trimmed);
  if (repaired !== null) return repaired;

  throw new Error("Could not extract JSON from model response");
}

export function repairTruncatedJson(text: string): unknown | null {
  const startObj = text.indexOf("{");
  const startArr = text.indexOf("[");
  if (startObj < 0 && startArr < 0) return null;
  const start =
    startObj < 0
      ? startArr
      : startArr < 0
        ? startObj
        : Math.min(startObj, startArr);
  let slice = text.slice(start);

  let inString = false;
  let escape = false;
  const stack: string[] = [];
  for (const ch of slice) {
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      if (inString) escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if ((ch === "}" || ch === "]") && stack.length) stack.pop();
  }
  if (inString) slice += '"';
  if (/[:,]\s*$/.test(slice)) slice += "null";
  while (stack.length) slice += stack.pop();
  try {
    return JSON.parse(slice) as unknown;
  } catch {
    return null;
  }
}

export function schemaHint(schema: { toJSONSchema?: () => unknown }): string {
  try {
    if (typeof schema.toJSONSchema === "function") {
      return JSON.stringify(schema.toJSONSchema(), null, 2);
    }
  } catch {
    /* fall through */
  }
  return '{"type":"object"}';
}
