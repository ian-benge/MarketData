import { generateText } from "ai";
import type { AiProvider } from "@/lib/providers/interfaces";
import type { AiResult, AiStructuredRequest } from "@/lib/providers/types";
import { extractJsonPayload, schemaHint } from "@/lib/ai/json-parse";
import { promptVersionFor } from "@/lib/ai/prompt-versions";
import { getEnv } from "@/lib/env";
import {
  DEFAULT_GATEWAY_FALLBACKS,
  DEFAULT_GATEWAY_STRONG,
  gatewayConfigured,
} from "@/lib/desk-intel/models";

function asGatewayModel(model?: string): string {
  if (model && model.includes("/")) return model;
  return DEFAULT_GATEWAY_STRONG;
}

export class GatewayAiProvider implements AiProvider {
  async generateStructured<T>(
    request: AiStructuredRequest<T>,
  ): Promise<AiResult<T>> {
    const env = getEnv();
    if (!gatewayConfigured(env)) {
      throw new Error(
        "GatewayAiProvider requires AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN.",
      );
    }
    const started = Date.now();
    const model = asGatewayModel(request.model);
    const promptVersion =
      request.promptVersion ?? promptVersionFor(request.task);
    const system = [
      request.systemPrompt ??
        "Return ONLY valid JSON matching the schema. Never invent prices or numbers not present in the user evidence.",
      "JSON schema:",
      schemaHint(request.schema),
    ].join("\n\n");

    const result = await generateText({
      model,
      system,
      prompt: request.userPrompt,
      temperature: request.temperature ?? 0.1,
      maxOutputTokens: request.maxTokens ?? 4096,
      providerOptions: {
        gateway: {
          models: DEFAULT_GATEWAY_FALLBACKS.filter((id) => id !== model),
          tags: ["app:ib-market-data", `task:${request.task}`],
        },
      },
    });

    const data = request.schema.parse(extractJsonPayload(result.text));
    return {
      data,
      providerName: "ai-gateway",
      model,
      promptVersion,
      usage: {
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
      },
      latencyMs: Math.max(1, Date.now() - started),
    };
  }
}
