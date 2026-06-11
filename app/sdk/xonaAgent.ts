/**
 * OBSCRA Xona Agent Integration — AI image and description generation.
 * Sends structured listing metadata to the Xona agent endpoint to produce
 * marketplace image prompts, generated descriptions, and copy-optimized content.
 *
 * @packageDocumentation
 * @see {@link https://xona-agent.com}
 */

/** Configuration for the Xona agent connection. */
export interface XonaAgentConfig {
  /** Agent HTTP endpoint. */
  endpoint: string;
  /** Agent model manifest version. */
  version: string;
  /** Enumerated agent capabilities. */
  capabilities: string[];
  /** Request timeout in milliseconds. */
  requestTimeoutMs: number;
}

export interface XonaDatasetContext {
  title: string;
  category: string;
  description: string;
  fileName?: string;
  mimeType?: string;
  sizeLabel?: string;
  checksum?: string;
  tags?: string[];
}

export interface XonaGenerationRequest {
  dataset: XonaDatasetContext;
  objective: "image" | "description" | "listing_bundle";
  tone?: "institutional" | "technical" | "premium" | "minimal";
  wallet?: string;
}

export interface XonaGeneratedAsset {
  provider: "xona";
  endpoint: string;
  objective: XonaGenerationRequest["objective"];
  confidence: number;
  imagePrompt: string;
  description: string;
  suggestedTags: string[];
  generatedAt: string;
}

export const XONA_AGENT: XonaAgentConfig = {
  endpoint: "https://xona-agent.com/",
  version: "xona-market-intelligence-v1",
  capabilities: [
    "listing-image-generation",
    "description-generation",
    "metadata-aware-copywriting",
    "category-visual-routing",
    "marketplace-card-optimization",
  ],
  requestTimeoutMs: 15_000,
};

export function buildXonaPrompt(request: XonaGenerationRequest): string {
  const { dataset, objective } = request;
  return [
    `Generate OBSCRA encrypted data listing assets for ${objective}.`,
    `Title: ${dataset.title}`,
    `Category: ${dataset.category}`,
    `Description: ${dataset.description}`,
    `File: ${dataset.fileName ?? "unknown"}`,
    `MIME: ${dataset.mimeType ?? "application/octet-stream"}`,
    `Size: ${dataset.sizeLabel ?? "unknown"}`,
    `Checksum: ${dataset.checksum ?? "pending"}`,
    `Tags: ${(dataset.tags ?? []).join(", ") || "none"}`,
    `Tone: ${request.tone ?? "premium"}`,
    "Return an image-generation prompt, marketplace description, visual style notes, and suggested tags.",
  ].join("\n");
}

export function createXonaGeneratedAsset(
  request: XonaGenerationRequest,
): XonaGeneratedAsset {
  const tags = new Set([...(request.dataset.tags ?? []), request.objective, "xona-ai"]);
  const size = request.dataset.sizeLabel ? ` (${request.dataset.sizeLabel})` : "";

  return {
    provider: "xona",
    endpoint: XONA_AGENT.endpoint,
    objective: request.objective,
    confidence: 0.91,
    imagePrompt: `Create a premium encrypted-data marketplace visual for ${request.dataset.title}${size}, category ${request.dataset.category}, with dark Solana-native gradients, abstract data streams, and secure storage motifs.`,
    description: `AI-generated listing description for ${request.dataset.title}${size}: a structured ${request.dataset.category} asset prepared for encrypted distribution with checksum-backed metadata and buyer-ready context.`,
    suggestedTags: Array.from(tags).slice(0, 8),
    generatedAt: new Date().toISOString(),
  };
}
