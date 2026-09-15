import { Injectable } from '@nestjs/common';
import { DocumentAiProvider } from '@prisma/client';
import type { JwtPayload } from '../../../infrastructure/auth/types/jwt-payload';
import { DOCUMENT_AI_MODEL_OPTIONS } from '../../../infrastructure/document-ai/document-ai.constants';
import { OrgAccessService } from '../../../infrastructure/org-access/org-access.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  buildOrgAiSettingsCreate,
  buildOrgAiSettingsUpdate,
} from '../../organizations/utils/org-ai-settings.util';
import { toPublicOrgSettings } from '../../organizations/utils/org-settings.mapper';
import { UpdateSettingsDto } from '../dto/update-settings.dto';

const AI_SETTINGS_SELECT = {
  autoApproveProductRequests: true,
  documentAiProvider: true,
  documentAiModel: true,
  geminiApiKeyEncrypted: true,
  openaiApiKeyEncrypted: true,
} as const;

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgAccess: OrgAccessService,
  ) {}

  listAiModels() {
    return {
      message: 'Document AI models retrieved successfully',
      data: {
        models: DOCUMENT_AI_MODEL_OPTIONS,
        defaults: {
          [DocumentAiProvider.GEMINI]: 'gemini-3.5-flash-lite',
          [DocumentAiProvider.OPENAI]: 'gpt-5.6-luna',
        },
      },
    };
  }

  async getMine(currentUser: JwtPayload) {
    const membership = await this.orgAccess.requireManager(currentUser);
    const settings = await this.ensureSettings(membership.organizationId);

    return {
      message: 'Settings retrieved successfully',
      data: toPublicOrgSettings(settings),
    };
  }

  async updateMine(currentUser: JwtPayload, dto: UpdateSettingsDto) {
    const membership = await this.orgAccess.requireManager(currentUser);
    const current = await this.ensureSettings(membership.organizationId);

    const aiUpdate = buildOrgAiSettingsUpdate(dto, current);
    const settings = await this.prisma.organizationSettings.upsert({
      where: { organizationId: membership.organizationId },
      update: {
        ...(dto.autoApproveProductRequests !== undefined
          ? { autoApproveProductRequests: dto.autoApproveProductRequests }
          : {}),
        ...aiUpdate,
      },
      create: buildOrgAiSettingsCreate(membership.organizationId, dto),
      select: AI_SETTINGS_SELECT,
    });

    return {
      message: 'Settings updated successfully',
      data: toPublicOrgSettings(settings),
    };
  }

  private async ensureSettings(organizationId: string) {
    return this.prisma.organizationSettings.upsert({
      where: { organizationId },
      update: {},
      create: {
        organizationId,
        autoApproveProductRequests: false,
        documentAiProvider: DocumentAiProvider.NONE,
      },
      select: AI_SETTINGS_SELECT,
    });
  }
}
