import { ChangesetDefinition } from "../types";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
  reasoning_details?: unknown;
}

export interface LLMProvider {
  generateCompletion(
    messages: LLMMessage[],
    options?: {
      temperature?: number;
      maxTokens?: number;
      enableReasoning?: boolean;
    },
  ): Promise<string>;
}

export interface LLMResponse {
  choices?: Array<{
    message: {
      content: string;
      reasoning_details?: unknown;
    };
  }>;
}

export class OpenRouterLLMProvider implements LLMProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = "openai/gpt-oss-120b:free") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateCompletion(
    messages: LLMMessage[],
    options?: {
      temperature?: number;
      maxTokens?: number;
      enableReasoning?: boolean;
    },
  ): Promise<string> {
    const reasoningEnabled =
      options?.enableReasoning ??
      process.env.OPENROUTER_ENABLE_REASONING === "true";
    const requestBody = {
      model: this.model,
      messages: messages,
      ...(options?.temperature !== undefined
        ? { temperature: options.temperature }
        : {}),
      ...(options?.maxTokens !== undefined
        ? { max_tokens: options.maxTokens }
        : {}),
      ...(reasoningEnabled ? { reasoning: { enabled: true } } : {}),
    };

    const debugLogging = process.env.LLM_DEBUG === "true";
    if (debugLogging) {
      console.log("---- LLM REQUEST ----");
      console.log(JSON.stringify(requestBody, null, 2));
    }

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("---- LLM ERROR RESPONSE ----");
      console.error(errorText);
      throw new Error(
        `OpenRouter API error: ${response.status} - ${errorText}`,
      );
    }

    const result = (await response.json()) as LLMResponse;
    if (debugLogging) {
      console.log("---- LLM SUCCESS RESPONSE ----");
      console.log(JSON.stringify(result, null, 2));
    }

    if (!result.choices || result.choices.length === 0) {
      throw new Error("No choices returned from OpenRouter API.");
    }
    const message = result.choices[0].message;
    return message.content;
  }
}

export class CopilotLLMProvider implements LLMProvider {
  async generateCompletion(
    messages: LLMMessage[],
    options?: {
      temperature?: number;
      maxTokens?: number;
      enableReasoning?: boolean;
    },
  ): Promise<string> {
    throw new Error("Copilot provider is not yet fully implemented.");
  }
}

export class LLMFactory {
  static getProvider(): LLMProvider {
    const providerType = process.env.LLM_PROVIDER || "openrouter";

    switch (providerType.toLowerCase()) {
      case "openrouter": {
        const apiKey = process.env.OPENROUTER_API_KEY || "";
        const model =
          process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b:free";
        return new OpenRouterLLMProvider(apiKey, model);
      }
      case "copilot":
        return new CopilotLLMProvider();
      default:
        throw new Error(`Unsupported LLM provider: ${providerType}`);
    }
  }
}
