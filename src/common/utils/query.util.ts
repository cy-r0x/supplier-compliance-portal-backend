import { BadRequestException } from '@nestjs/common';

export type SortDirection = 'asc' | 'desc';

export type PrismaOrderBy = Record<string, SortDirection>;

const DEFAULT_SORT = 'createdAt:desc';

/**
 * Parses `field:asc|desc` into a Prisma `orderBy` object.
 * Rejects fields not in `allowedFields`.
 */
export function parseSortQuery(
  sort: string | undefined,
  allowedFields: readonly string[],
  fallback: string = DEFAULT_SORT,
): PrismaOrderBy {
  const value = sort?.trim() || fallback;
  const [rawField, rawDirection] = value.split(':');
  const field = rawField?.trim();
  const direction = rawDirection?.trim().toLowerCase();

  if (
    !field ||
    (direction !== 'asc' && direction !== 'desc') ||
    !allowedFields.includes(field)
  ) {
    throw new BadRequestException(
      `Invalid sort. Allowed fields: ${allowedFields.join(', ')}. Format: field:asc|desc`,
    );
  }

  return { [field]: direction };
}

export function getPagination(query: {
  page?: number;
  limit?: number;
}): { page: number; limit: number; skip: number } {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}
