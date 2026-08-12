import Anthropic from "@anthropic-ai/sdk";
import type { AiProvider } from "@/lib/providers/interfaces";
import type { AiResult, AiStructuredRequest } from "@/lib/providers/types";
import { getEnv } from "@/lib/env";
import { extractJsonPayload, schemaHint } from "@/lib/ai/json-parse";
import { promptVersionFor } from "@/lib/ai/prompt-versions";

const DEFAULT_TEMPERATURE = 0.1;

export type AnthropicProviderOptions = {
  apiKey?: string;
  defaultModel?: string;
  client?: Anthropic;
};

export class AnthropicProvider implements AiProvider {
  private readonly client: Anthropic;
  private readonly defaultModel: string;

  constructor(options: AnthropicProviderOptions = {}) {
    const env = getEnv();
    const apiKey = options.apiKey ?? env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "AnthropicProvider requires ANTHROPIC_API_KEY (missing or empty).",
      );
    }
    this.client =
      options.client ??
      new Anthropic({
        apiKey,
      });
    this.defaultModel = options.defaultModel ?? env.ANTHROPIC_MODEL;
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
      "Respond with a single JSON object and no markdown.",
    ].join("\n\n");

    const message = await this.client.messages.create({
      model,
      max_tokens: request.maxTokens ?? 4096,
      temperature,
      system,
      messages: [{ role: "user", content: request.userPrompt }],
    });

    const textBlocks = message.content.filter((b) => b.type === "text");
    const content = textBlocks.map((b) => (b.type === "text" ? b.text : "")).join("\n");
    if (!content.trim()) {
      throw new Error("Anthropic returned an empty message");
    }

    const raw = extractJsonPayload(content);
    const data = request.schema.parse(raw);

    return {
      data,
      providerName: "anthropic",
      model,
      promptVersion,
      usage: {
        inputTokens: message.usage?.input_tokens,
        outputTokens: message.usage?.output_tokens,
      },
      latencyMs: Math.max(1, Date.now() - started),
    };
  }
}
