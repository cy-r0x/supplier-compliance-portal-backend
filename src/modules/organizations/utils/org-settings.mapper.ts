import { DocumentAiProvider } from '@prisma/client';

export type OrgSettingsRecord = {
  autoApproveProductRequests: boolean;
  documentAiProvider: DocumentAiProvider;
  documentAiModel: string | null;
  geminiApiKeyEncrypted: string | null;
  openaiApiKeyEncrypted: string | null;
};

export type PublicOrgSettings = {
  autoApproveProductRequests: boolean;
  documentAiProvider: DocumentAiProvider;
  documentAiModel: string | null;
  geminiApiKeyConfigured: boolean;
  openaiApiKeyConfigured: boolean;
};

export function toPublicOrgSettings(
  settings: OrgSettingsRecord,
): PublicOrgSettings {
  return {
    autoApproveProductRequests: settings.autoApproveProductRequests,
    documentAiProvider: settings.documentAiProvider,
    documentAiModel: settings.documentAiModel,
    geminiApiKeyConfigured: Boolean(settings.geminiApiKeyEncrypted),
    openaiApiKeyConfigured: Boolean(settings.openaiApiKeyEncrypted),
  };
}
