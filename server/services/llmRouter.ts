import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { OpenAIEmbeddings } from "@langchain/openai";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Embeddings } from "@langchain/core/embeddings";
import { storage } from "../storage";
import { db } from "../db";
import { llmConfig, documentChunkEmbeddings } from "@shared/schema";
import { eq, and } from "drizzle-orm";

export type LLMProvider = "OpenAI" | "Gemini";

export interface LLMRouterConfig {
  provider: LLMProvider;
  embeddingProvider: LLMProvider;
  openAIConfig?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
  geminiConfig?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
}

export interface LLMLogEntry {
  provider: LLMProvider;
  model: string;
  prompt: string;
  response?: string;
  latency: number;
  error?: string;
  timestamp: Date;
  userId: string;
}

export class LLMRouter {
  private chatModel: BaseChatModel | null = null;
  private embeddingModel: Embeddings | null = null;
  private currentConfig: LLMRouterConfig | null = null;
  private logs: LLMLogEntry[] = [];

  constructor() {
    this.initializeDefaults();
  }

  private initializeDefaults() {
    // Initialize with OpenAI as default
    this.currentConfig = {
      provider: "OpenAI",
      embeddingProvider: "OpenAI",
      openAIConfig: {
        model: "gpt-4o",
        temperature: 0.7,
        maxTokens: 4000,
      },
    };
    this.updateModels();
  }

  async loadUserConfig(userId: string): Promise<LLMRouterConfig> {
    try {
      // Check if user has custom LLM configuration
      const [userConfig] = await db
        .select()
        .from(llmConfig)
        .where(eq(llmConfig.userId, userId));

      if (userConfig) {
        const config: LLMRouterConfig = {
          provider: userConfig.provider as LLMProvider,
          embeddingProvider: userConfig.embeddingProvider as LLMProvider,
          ...(userConfig.configData as any),
        };

        this.currentConfig = config;
        this.updateModels();
        return config;
      }

      // Return default configuration
      return this.currentConfig!;
    } catch (error) {
      console.error("Error loading user LLM config:", error);
      return this.currentConfig!;
    }
  }

  async updateUserConfig(userId: string, config: Partial<LLMRouterConfig>): Promise<void> {
    try {
      const updatedConfig = { ...this.currentConfig, ...config };

      // Check if provider changed - if so, we need to invalidate embeddings
      const oldEmbeddingProvider = this.currentConfig?.embeddingProvider;
      const newEmbeddingProvider = updatedConfig.embeddingProvider;

      if (oldEmbeddingProvider && oldEmbeddingProvider !== newEmbeddingProvider) {
        console.log(`🔄 LLM provider changed from ${oldEmbeddingProvider} to ${newEmbeddingProvider} - flagging embeddings for re-processing`);
        await this.invalidateUserEmbeddings(userId, oldEmbeddingProvider);
      }

      // Update configuration in database
      const [existingConfig] = await db
        .select()
        .from(llmConfig)
        .where(eq(llmConfig.userId, userId));

      const configData = {
        openAIConfig: updatedConfig.openAIConfig,
        geminiConfig: updatedConfig.geminiConfig,
      };

      if (existingConfig) {
        await db
          .update(llmConfig)
          .set({
            provider: updatedConfig.provider,
            embeddingProvider: updatedConfig.embeddingProvider,
            configData: configData,
            updatedAt: new Date(),
          })
          .where(eq(llmConfig.id, existingConfig.id));
      } else {
        await db.insert(llmConfig).values({
          userId,
          provider: updatedConfig.provider,
          embeddingProvider: updatedConfig.embeddingProvider,
          configData: configData,
        });
      }

      this.currentConfig = updatedConfig;
      this.updateModels();

      console.log(`✅ LLM configuration updated for user ${userId}: ${updatedConfig.provider} (embeddings: ${updatedConfig.embeddingProvider})`);
    } catch (error) {
      console.error("Error updating user LLM config:", error);
      throw new Error("Failed to update LLM configuration");
    }
  }

  private async invalidateUserEmbeddings(userId: string, oldProvider: LLMProvider): Promise<void> {
    try {
      // Get all documents for this user that have embeddings from the old provider
      const documentsWithOldEmbeddings = await db
        .select({ documentId: documentChunkEmbeddings.documentId })
        .from(documentChunkEmbeddings)
        .where(eq(documentChunkEmbeddings.embeddingProvider, oldProvider))
        .groupBy(documentChunkEmbeddings.documentId);

      if (documentsWithOldEmbeddings.length > 0) {
        // Delete old embeddings
        await db
          .delete(documentChunkEmbeddings)
          .where(eq(documentChunkEmbeddings.embeddingProvider, oldProvider));

        console.log(`🗑️ Deleted ${documentsWithOldEmbeddings.length} document embeddings from ${oldProvider} provider`);

        // Note: In a production system, you might want to queue these documents for re-embedding
        // rather than deleting immediately
      }
    } catch (error) {
      console.error("Error invalidating user embeddings:", error);
    }
  }

  private updateModels(): void {
    if (!this.currentConfig) return;

    try {
      // Initialize chat model based on provider
      if (this.currentConfig.provider === "OpenAI") {
        this.chatModel = new ChatOpenAI({
          model: this.currentConfig.openAIConfig?.model || "gpt-4o",
          temperature: this.currentConfig.openAIConfig?.temperature || 0.7,
          maxTokens: this.currentConfig.openAIConfig?.maxTokens || 4000,
          openAIApiKey: process.env.OPENAI_API_KEY,
        });
      } else if (this.currentConfig.provider === "Gemini") {
        if (!process.env.GEMINI_API_KEY) {
          throw new Error("GEMINI_API_KEY is required for Gemini provider");
        }
        this.chatModel = new ChatGoogleGenerativeAI({
          model: this.currentConfig.geminiConfig?.model || "gemini-2.5-flash",
          temperature: this.currentConfig.geminiConfig?.temperature || 0.7,
          maxOutputTokens: this.currentConfig.geminiConfig?.maxTokens || 4000,
          apiKey: process.env.GEMINI_API_KEY,
        });
      }

      // Initialize embedding model based on embedding provider
      if (this.currentConfig.embeddingProvider === "OpenAI") {
        this.embeddingModel = new OpenAIEmbeddings({
          model: "text-embedding-3-small",
          openAIApiKey: process.env.OPENAI_API_KEY,
        });
      } else if (this.currentConfig.embeddingProvider === "Gemini") {
        if (!process.env.GEMINI_API_KEY) {
          throw new Error("GEMINI_API_KEY is required for Gemini embedding provider");
        }
        this.embeddingModel = new GoogleGenerativeAIEmbeddings({
          model: "text-embedding-004",
          apiKey: process.env.GEMINI_API_KEY,
        });
      }

      console.log(`🤖 LLM Router initialized: Chat=${this.currentConfig.provider}, Embeddings=${this.currentConfig.embeddingProvider}`);
    } catch (error) {
      console.error("Error initializing models:", error);
      throw error;
    }
  }

  async chat(messages: any[], userId: string, options?: { streaming?: boolean }): Promise<string> {
    const startTime = Date.now();
    let response = "";
    let error: string | undefined;

    try {
      if (!this.chatModel) {
        throw new Error("Chat model not initialized");
      }

      await this.loadUserConfig(userId);

      const result = await this.chatModel.invoke(messages);
      response = result.content as string;

      return response;
    } catch (err) {
      error = err instanceof Error ? err.message : "Unknown error";
      console.error("LLM chat error:", error);
      throw err;
    } finally {
      // Log the interaction
      const logEntry: LLMLogEntry = {
        provider: this.currentConfig?.provider || "OpenAI",
        model: this.currentConfig?.provider === "OpenAI" 
          ? (this.currentConfig.openAIConfig?.model || "gpt-4o")
          : (this.currentConfig.geminiConfig?.model || "gemini-2.5-flash"),
        prompt: JSON.stringify(messages),
        response,
        latency: Date.now() - startTime,
        error,
        timestamp: new Date(),
        userId,
      };

      this.logs.push(logEntry);
      console.log(`📊 LLM Log: ${logEntry.provider}/${logEntry.model} - ${logEntry.latency}ms${error ? ` (Error: ${error})` : ""}`);
    }
  }

  async generateEmbedding(text: string, userId: string): Promise<number[]> {
    const startTime = Date.now();

    try {
      if (!this.embeddingModel) {
        throw new Error("Embedding model not initialized");
      }

      await this.loadUserConfig(userId);

      const embedding = await this.embeddingModel.embedQuery(text);

      console.log(`🔢 Generated embedding: ${this.currentConfig?.embeddingProvider} - ${Date.now() - startTime}ms`);
      return embedding;
    } catch (error) {
      console.error("Embedding generation error:", error);
      throw error;
    }
  }

  async generateEmbeddings(texts: string[], userId: string): Promise<number[][]> {
    const config = await this.loadUserConfig(userId);

    try {
      if (config.embeddingProvider === "Gemini") {
        // Use Gemini embeddings
        const { GoogleGenerativeAI } = await import("@google/generative-ai");

        if (!process.env.GEMINI_API_KEY) {
          console.log("🔄 Gemini API key not found, falling back to OpenAI embeddings");
          return await this.generateOpenAIEmbeddings(texts);
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "text-embedding-004" });

        console.log(`🔢 Generating ${texts.length} Gemini embeddings`);

        const embeddings: number[][] = [];

        // Process in batches to avoid rate limits
        for (let i = 0; i < texts.length; i += 5) {
          const batch = texts.slice(i, i + 5);
          const batchPromises = batch.map(async (text) => {
            try {
              const result = await model.embedContent(text.trim());
              if (result.embedding && result.embedding.values) {
                console.log(`✅ Gemini embedding generated: ${result.embedding.values.length} dimensions`);
                return result.embedding.values;
              } else {
                console.error("Invalid Gemini embedding response:", result);
                return new Array(768).fill(0);
              }
            } catch (error) {
              console.error("Error generating Gemini embedding for text:", error);
              // Fallback to a zero vector with correct dimensions
              return new Array(768).fill(0);
            }
          });

          const batchResults = await Promise.all(batchPromises);
          embeddings.push(...batchResults);

          // Small delay between batches
          if (i + 5 < texts.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }

        console.log(`✅ Generated ${embeddings.length} Gemini embeddings successfully`);
        return embeddings;
      } else {
        // Use OpenAI embeddings
        return await this.generateOpenAIEmbeddings(texts);
      }
    } catch (error) {
      console.error("Error in generateEmbeddings:", error);
      console.log("🔄 Falling back to OpenAI embeddings due to error");
      return await this.generateOpenAIEmbeddings(texts);
    }
  }

  // Helper method to update existing embeddings with new provider data
  async updateEmbeddingWithProvider(documentId: number, chunkIndex: number, newEmbedding: number[], provider: string): Promise<void> {
    try {
      // Get existing embedding JSON
      const [existingVector] = await db.select()
        .from(documentVectors)
        .where(
          and(
            eq(documentVectors.documentId, documentId),
            eq(documentVectors.chunkIndex, chunkIndex)
          )
        );

      if (existingVector) {
        // Use embeddingMulti column, initialize if null
        const currentEmbedding = (existingVector.embeddingMulti as { openai?: number[]; gemini?: number[] }) || {};
        const updatedEmbedding = {
          ...currentEmbedding,
          [provider.toLowerCase()]: newEmbedding
        };

        await db.update(documentVectors)
          .set({ embeddingMulti: updatedEmbedding })
          .where(eq(documentVectors.id, existingVector.id));

        console.log(`✅ Updated multi-embedding for doc ${documentId} chunk ${chunkIndex} with ${provider} data`);
      }
    } catch (error) {
      console.error(`Error updating multi-embedding for doc ${documentId} chunk ${chunkIndex}:`, error);
    }
  }

  getCurrentConfig(): LLMRouterConfig | null {
    return this.currentConfig;
  }

  getLogs(): LLMLogEntry[] {
    return [...this.logs]; // Return copy to prevent mutation
  }

  clearLogs(): void {
    this.logs = [];
  }

  async checkEmbeddingCompatibility(userId: string): Promise<{
    compatible: boolean;
    requiresReembedding: boolean;
    incompatibleDocuments: number[];
  }> {
    try {
      await this.loadUserConfig(userId);

      const currentProvider = this.currentConfig?.embeddingProvider;
      if (!currentProvider) {
        return { compatible: true, requiresReembedding: false, incompatibleDocuments: [] };
      }

      // Check for embeddings from different providers
      const incompatibleEmbeddings = await db
        .select({ documentId: documentChunkEmbeddings.documentId })
        .from(documentChunkEmbeddings)
        .where(
          and(
            eq(documentChunkEmbeddings.embeddingProvider, currentProvider === "OpenAI" ? "Gemini" : "OpenAI")
          )
        )
        .groupBy(documentChunkEmbeddings.documentId);

      return {
        compatible: incompatibleEmbeddings.length === 0,
        requiresReembedding: incompatibleEmbeddings.length > 0,
        incompatibleDocuments: incompatibleEmbeddings.map(e => e.documentId),
      };
    } catch (error) {
      console.error("Error checking embedding compatibility:", error);
      return { compatible: true, requiresReembedding: false, incompatibleDocuments: [] };
    }
  }
}

// Singleton instance
export const llmRouter = new LLMRouter();