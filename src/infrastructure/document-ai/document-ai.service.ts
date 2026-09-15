import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  DocumentAiProvider,
  DocumentType,
  DocumentVisibility,
} from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { decryptSecret } from '../../common/utils/secret-encryption.util';
import { isAllowedDocumentAiModel } from './document-ai.constants';

export type DocumentRequirementCatalogItem = {
  id: string;
  type: DocumentType;
  label: string | null;
  level: string;
  customKey: string;
};

export type SuggestFileMeta = {
  clientId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type DocumentSuggestion = {
  clientId: string;
  requirementId: string;
  documentType: DocumentType;
  visibility: DocumentVisibility;
  confidence: number | null;
};

type OrgAiConfig = {
  documentAiProvider: DocumentAiProvider;
  documentAiModel: string | null;
  geminiApiKeyEncrypted: string | null;
  openaiApiKeyEncrypted: string | null;
};

@Injectable()
export class DocumentAiService {
  private readonly logger = new Logger(DocumentAiService.name);

  async suggestDocuments(params: {
    orgSettings: OrgAiConfig;
    requirements: DocumentRequirementCatalogItem[];
    files: SuggestFileMeta[];
  }): Promise<DocumentSuggestion[]> {
    const { orgSettings, requirements, files } = params;

    if (files.length === 0) {
      return [];
    }

    if (requirements.length === 0) {
      throw new BadRequestException(
        'Product has no document requirements to classify against',
      );
    }

    const fallback = () => this.buildFallbackSuggestions(files, requirements);

    if (
      orgSettings.documentAiProvider === DocumentAiProvider.NONE ||
      !orgSettings.documentAiModel ||
      !isAllowedDocumentAiModel(
        orgSettings.documentAiProvider,
        orgSettings.documentAiModel,
      )
    ) {
      return fallback();
    }

    try {
      if (orgSettings.documentAiProvider === DocumentAiProvider.GEMINI) {
        if (!orgSettings.geminiApiKeyEncrypted) {
          return fallback();
        }
        const apiKey = decryptSecret(orgSettings.geminiApiKeyEncrypted);
        return await this.suggestWithGemini({
          apiKey,
          model: orgSettings.documentAiModel,
          requirements,
          files,
        });
      }

      if (orgSettings.documentAiProvider === DocumentAiProvider.OPENAI) {
        if (!orgSettings.openaiApiKeyEncrypted) {
          return fallback();
        }
        const apiKey = decryptSecret(orgSettings.openaiApiKeyEncrypted);
        return await this.suggestWithOpenAi({
          apiKey,
          model: orgSettings.documentAiModel,
          requirements,
          files,
        });
      }
    } catch (error) {
      this.logger.warn(
        `Document AI suggestion failed; using fallback. ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return fallback();
    }

    return fallback();
  }

  private async suggestWithGemini(params: {
    apiKey: string;
    model: string;
    requirements: DocumentRequirementCatalogItem[];
    files: SuggestFileMeta[];
  }): Promise<DocumentSuggestion[]> {
    const genAI = new GoogleGenerativeAI(params.apiKey);
    const model = genAI.getGenerativeModel({
      model: params.model,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    const result = await model.generateContent(
      this.buildPrompt(params.requirements, params.files),
    );
    const text = result.response.text();
    return this.parseAndValidateSuggestions(
      text,
      params.files,
      params.requirements,
    );
  }

  private async suggestWithOpenAi(params: {
    apiKey: string;
    model: string;
    requirements: DocumentRequirementCatalogItem[];
    files: SuggestFileMeta[];
  }): Promise<DocumentSuggestion[]> {
    const client = new OpenAI({ apiKey: params.apiKey });
    const completion = await client.chat.completions.create({
      model: params.model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You classify supplier compliance document uploads. Reply with JSON only.',
        },
        {
          role: 'user',
          content: this.buildPrompt(params.requirements, params.files),
        },
      ],
    });

    const text = completion.choices[0]?.message?.content ?? '{}';
    return this.parseAndValidateSuggestions(
      text,
      params.files,
      params.requirements,
    );
  }

  private buildPrompt(
    requirements: DocumentRequirementCatalogItem[],
    files: SuggestFileMeta[],
  ): string {
    return [
      'Guess the best matching document requirement and visibility for each file.',
      'Use only requirement ids from the catalog. Prefer PUBLIC for PRODUCT_IMAGE and SAFETY_IMAGE; otherwise PRIVATE unless the filename clearly indicates a public certificate or marketing asset.',
      'Return JSON of the form:',
      '{"suggestions":[{"clientId":"...","requirementId":"...","documentType":"...","visibility":"PUBLIC|PRIVATE","confidence":0.0}]}',
      '',
      'Requirement catalog:',
      JSON.stringify(requirements),
      '',
      'Files:',
      JSON.stringify(files),
    ].join('\n');
  }

  private parseAndValidateSuggestions(
    raw: string,
    files: SuggestFileMeta[],
    requirements: DocumentRequirementCatalogItem[],
  ): DocumentSuggestion[] {
    const byId = new Map(requirements.map((row) => [row.id, row]));
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return this.buildFallbackSuggestions(files, requirements);
    }

    const list = Array.isArray(parsed)
      ? parsed
      : ((parsed as { suggestions?: unknown }).suggestions ?? []);

    if (!Array.isArray(list)) {
      return this.buildFallbackSuggestions(files, requirements);
    }

    const byClient = new Map<string, DocumentSuggestion>();
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const clientId = String(row.clientId ?? '');
      if (!clientId || !files.some((file) => file.clientId === clientId)) {
        continue;
      }

      const requirementId = String(row.requirementId ?? '');
      const requirement = byId.get(requirementId);
      if (!requirement) continue;

      const visibility =
        row.visibility === DocumentVisibility.PUBLIC
          ? DocumentVisibility.PUBLIC
          : DocumentVisibility.PRIVATE;

      const confidence =
        typeof row.confidence === 'number' &&
        Number.isFinite(row.confidence)
          ? Math.min(1, Math.max(0, row.confidence))
          : null;

      byClient.set(clientId, {
        clientId,
        requirementId: requirement.id,
        documentType: requirement.type,
        visibility,
        confidence,
      });
    }

    return files.map((file) => {
      const hit = byClient.get(file.clientId);
      if (hit) return hit;
      return this.fallbackForFile(file, requirements);
    });
  }

  private buildFallbackSuggestions(
    files: SuggestFileMeta[],
    requirements: DocumentRequirementCatalogItem[],
  ): DocumentSuggestion[] {
    return files.map((file) => this.fallbackForFile(file, requirements));
  }

  private fallbackForFile(
    file: SuggestFileMeta,
    requirements: DocumentRequirementCatalogItem[],
  ): DocumentSuggestion {
    const name = file.fileName.toLowerCase();
    const scored = requirements
      .map((req) => {
        const tokens = [
          req.type.toLowerCase().replace(/_/g, ' '),
          req.type.toLowerCase(),
          (req.label ?? '').toLowerCase(),
          req.customKey.toLowerCase(),
        ].filter(Boolean);
        const score = tokens.reduce(
          (sum, token) => (token && name.includes(token) ? sum + 1 : sum),
          0,
        );
        return { req, score };
      })
      .sort((a, b) => b.score - a.score);

    const best =
      scored.find((row) => row.score > 0)?.req ??
      requirements.find((row) => row.type === DocumentType.OTHER) ??
      requirements[0]!;

    const visibility =
      best.type === DocumentType.PRODUCT_IMAGE ||
      best.type === DocumentType.SAFETY_IMAGE
        ? DocumentVisibility.PUBLIC
        : DocumentVisibility.PRIVATE;

    return {
      clientId: file.clientId,
      requirementId: best.id,
      documentType: best.type,
      visibility,
      confidence: null,
    };
  }
}
