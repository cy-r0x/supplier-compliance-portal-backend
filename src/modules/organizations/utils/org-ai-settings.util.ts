import { BadRequestException } from '@nestjs/common';
import { DocumentAiProvider, Prisma } from '@prisma/client';
import { encryptSecret } from '../../../common/utils/secret-encryption.util';
import {
  DEFAULT_MODEL_BY_PROVIDER,
  isAllowedDocumentAiModel,
} from '../../../infrastructure/document-ai/document-ai.constants';

export type AiSettingsPatch = {
  documentAiProvider?: DocumentAiProvider;
  documentAiModel?: string | null;
  geminiApiKey?: string | null;
  openaiApiKey?: string | null;
};

export function buildOrgAiSettingsUpdate(
  dto: AiSettingsPatch,
  current: {
    documentAiProvider: DocumentAiProvider;
    documentAiModel: string | null;
  },
): Prisma.OrganizationSettingsUpdateInput {
  const nextProvider = dto.documentAiProvider ?? current.documentAiProvider;
  let nextModel =
    dto.documentAiModel !== undefined
      ? dto.documentAiModel
      : current.documentAiModel;

  if (nextProvider === DocumentAiProvider.NONE) {
    nextModel = null;
  } else if (
    dto.documentAiProvider !== undefined &&
    dto.documentAiModel === undefined
  ) {
    // Switching provider without an explicit model → use default for provider
    if (
      !isAllowedDocumentAiModel(nextProvider, nextModel) ||
      current.documentAiProvider !== nextProvider
    ) {
      nextModel = DEFAULT_MODEL_BY_PROVIDER[nextProvider];
    }
  }

  if (
    nextProvider !== DocumentAiProvider.NONE &&
    !isAllowedDocumentAiModel(nextProvider, nextModel)
  ) {
    throw new BadRequestException(
      `documentAiModel must be an allowlisted model for ${nextProvider}`,
    );
  }

  const update: Prisma.OrganizationSettingsUpdateInput = {};

  if (dto.documentAiProvider !== undefined) {
    update.documentAiProvider = dto.documentAiProvider;
  }
  if (dto.documentAiModel !== undefined || dto.documentAiProvider !== undefined) {
    update.documentAiModel = nextModel;
  }

  if (dto.geminiApiKey !== undefined) {
    update.geminiApiKeyEncrypted =
      dto.geminiApiKey === null || dto.geminiApiKey === ''
        ? null
        : encryptSecret(dto.geminiApiKey);
  }

  if (dto.openaiApiKey !== undefined) {
    update.openaiApiKeyEncrypted =
      dto.openaiApiKey === null || dto.openaiApiKey === ''
        ? null
        : encryptSecret(dto.openaiApiKey);
  }

  return update;
}

export function buildOrgAiSettingsCreate(
  organizationId: string,
  dto: AiSettingsPatch & { autoApproveProductRequests?: boolean },
): Prisma.OrganizationSettingsCreateInput {
  const provider = dto.documentAiProvider ?? DocumentAiProvider.NONE;
  let model = dto.documentAiModel ?? null;

  if (provider === DocumentAiProvider.NONE) {
    model = null;
  } else if (!model) {
    model = DEFAULT_MODEL_BY_PROVIDER[provider];
  }

  if (provider !== DocumentAiProvider.NONE && !isAllowedDocumentAiModel(provider, model)) {
    throw new BadRequestException(
      `documentAiModel must be an allowlisted model for ${provider}`,
    );
  }

  return {
    organization: { connect: { id: organizationId } },
    autoApproveProductRequests: dto.autoApproveProductRequests ?? false,
    documentAiProvider: provider,
    documentAiModel: model,
    geminiApiKeyEncrypted:
      dto.geminiApiKey === undefined ||
      dto.geminiApiKey === null ||
      dto.geminiApiKey === ''
        ? null
        : encryptSecret(dto.geminiApiKey),
    openaiApiKeyEncrypted:
      dto.openaiApiKey === undefined ||
      dto.openaiApiKey === null ||
      dto.openaiApiKey === ''
        ? null
        : encryptSecret(dto.openaiApiKey),
  };
}
