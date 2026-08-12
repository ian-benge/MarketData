import OpenAI from "openai";
import type { AiProvider } from "@/lib/providers/interfaces";
import type { AiResult, AiStructuredRequest } from "@/lib/providers/types";
import { getEnv } from "@/lib/env";
import { extractJsonPayload, schemaHint } from "@/lib/ai/json-parse";
import { promptVersionFor } from "@/lib/ai/prompt-versions";

const DEFAULT_TEMPERATURE = 0.1;

export type OpenAiProviderOptions = {
  apiKey?: string;
  defaultModel?: string;
  client?: OpenAI;
};

export class OpenAiProvider implements AiProvider {
  private readonly client: OpenAI;
  private readonly defaultModel: string;

  constructor(options: OpenAiProviderOptions = {}) {
    const env = getEnv();
    const apiKey = options.apiKey ?? env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OpenAiProvider requires OPENAI_API_KEY (missing or empty).",
      );
    }
    this.client =
      options.client ??
      new OpenAI({
        apiKey,
      });
    this.defaultModel = options.defaultModel ?? env.OPENAI_MODEL;
  }

  async generateStructured<T>(
    request: AiStructuredRequest<T>,
  ): Promise<AiResult<T>> {
    const started = Date.now();
    const model = request.model ?? this.defaultModel;
    const temperature = request.temperature ?? DEFAULT_TEMPERATURE;
    const promptVersion =
      request.promptVersion ?? promptVersionFor(request.task);

    const system = [
      request.systemPrompt ??
        "You are a financial research assistant. Return ONLY valid JSON matching the schema. Never invent prices or numbers not present in the user evidence.",
      "JSON schema:",
      schemaHint(request.schema),
    ].join("\n\n");

    const completion = await this.client.chat.completions.create({
      model,
      temperature,
      max_tokens: request.maxTokens ?? 4096,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: request.userPrompt },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned an empty completion");
    }

    const raw = extractJsonPayload(content);
    const data = request.schema.parse(raw);

    return {
      data,
      providerName: "openai",
      model,
      promptVersion,
      usage: {
        inputTokens: completion.usage?.prompt_tokens,
        outputTokens: completion.usage?.completion_tokens,
      },
      latencyMs: Math.max(1, Date.now() - started),
    };
  }
}
