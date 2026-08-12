/**
 * Extract a JSON object/array from model text (fenced or bare).
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
    return JSON.parse(fenced[1].trim()) as unknown;
  }

  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) {
    return JSON.parse(objectMatch[0]) as unknown;
  }

  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrayMatch?.[0]) {
    return JSON.parse(arrayMatch[0]) as unknown;
  }

  throw new Error("Could not extract JSON from model response");
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
