import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AiProvider } from "@/lib/providers/interfaces";
import type { AiResult, AiStructuredRequest } from "@/lib/providers/types";
import { getEnv } from "@/lib/env";
import { extractJsonPayload, schemaHint } from "@/lib/ai/json-parse";
import { promptVersionFor } from "@/lib/ai/prompt-versions";

const DEFAULT_TEMPERATURE = 0.1;

export type GeminiProviderOptions = {
  apiKey?: string;
  defaultModel?: string;
  client?: GoogleGenerativeAI;
};

export class GeminiProvider implements AiProvider {
  private readonly client: GoogleGenerativeAI;
  private readonly defaultModel: string;

  constructor(options: GeminiProviderOptions = {}) {
    const env = getEnv();
    const apiKey = options.apiKey ?? env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GeminiProvider requires GOOGLE_GENERATIVE_AI_API_KEY (missing or empty).",
      );
    }
    this.client = options.client ?? new GoogleGenerativeAI(apiKey);
    this.defaultModel = options.defaultModel ?? env.GEMINI_MODEL;
  }

  async generateStructured<T>(
    request: AiStructuredRequest<T>,
  ): Promise<AiResult<T>> {
    const started = Date.now();
    const modelName = request.model ?? this.defaultModel;
    const temperature = request.temperature ?? DEFAULT_TEMPERATURE;
    const promptVersion =
      request.promptVersion ?? promptVersionFor(request.task);

    const system = [
      request.systemPrompt ??
        "You are a financial research assistant. Return ONLY valid JSON matching the schema. Never invent prices or numbers not present in the user evidence.",
      "JSON schema:",
      schemaHint(request.schema),
    ].join("\n\n");

    const model = this.client.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature,
        maxOutputTokens: request.maxTokens ?? 4096,
        responseMimeType: "application/json",
      },
      systemInstruction: system,
    });

    const result = await model.generateContent(request.userPrompt);
    const content = result.response.text();
    if (!content?.trim()) {
      throw new Error("Gemini returned an empty response");
    }

    const raw = extractJsonPayload(content);
    const data = request.schema.parse(raw);

    const usageMeta = result.response.usageMetadata;

    return {
      data,
      providerName: "gemini",
      model: modelName,
      promptVersion,
      usage: {
        inputTokens: usageMeta?.promptTokenCount,
        outputTokens: usageMeta?.candidatesTokenCount,
      },
      latencyMs: Math.max(1, Date.now() - started),
    };
  }
}
