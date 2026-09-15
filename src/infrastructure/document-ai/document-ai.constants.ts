import { DocumentAiProvider } from '@prisma/client';

export type DocumentAiModelOption = {
  provider: Exclude<DocumentAiProvider, 'NONE'>;
  id: string;
  label: string;
  description: string;
};

/**
 * Curated allowlist (checked against current provider docs, Sep 2026).
 * Tuned for lightweight filename/mime classification — not agentic coding.
 */
export const DOCUMENT_AI_MODEL_OPTIONS: DocumentAiModelOption[] = [
  {
    provider: DocumentAiProvider.GEMINI,
    id: 'gemini-3.5-flash-lite',
    label: 'Gemini 3.5 Flash-Lite',
    description: 'Best cost/latency for high-volume classification',
  },
  {
    provider: DocumentAiProvider.GEMINI,
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    description: 'Stronger reasoning when filenames are ambiguous',
  },
  {
    provider: DocumentAiProvider.OPENAI,
    id: 'gpt-5.6-luna',
    label: 'GPT-5.6 Luna',
    description: 'Cost-sensitive high-volume workloads',
  },
  {
    provider: DocumentAiProvider.OPENAI,
    id: 'gpt-5.6-terra',
    label: 'GPT-5.6 Terra',
    description: 'Balanced intelligence and cost',
  },
];

export const DEFAULT_MODEL_BY_PROVIDER: Record<
  Exclude<DocumentAiProvider, 'NONE'>,
  string
> = {
  [DocumentAiProvider.GEMINI]: 'gemini-3.5-flash-lite',
  [DocumentAiProvider.OPENAI]: 'gpt-5.6-luna',
};

export function isAllowedDocumentAiModel(
  provider: DocumentAiProvider,
  model: string | null | undefined,
): boolean {
  if (provider === DocumentAiProvider.NONE || !model) {
    return false;
  }
  return DOCUMENT_AI_MODEL_OPTIONS.some(
    (option) => option.provider === provider && option.id === model,
  );
}

export function modelsForProvider(provider: DocumentAiProvider) {
  if (provider === DocumentAiProvider.NONE) {
    return [];
  }
  return DOCUMENT_AI_MODEL_OPTIONS.filter(
    (option) => option.provider === provider,
  );
}
