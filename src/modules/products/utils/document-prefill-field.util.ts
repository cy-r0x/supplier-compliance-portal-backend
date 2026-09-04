import { DocumentType } from '@prisma/client';

/** Multipart field name for a document prefill file. */
export function documentPrefillFieldName(
  type: DocumentType | string,
  customKey = '',
): string {
  if (type === DocumentType.OTHER || type === 'OTHER') {
    return `docPrefill__OTHER__${customKey}`;
  }
  return `docPrefill__${type}`;
}

export function parseDocumentPrefillFieldName(
  fieldname: string,
): { type: string; customKey: string } | null {
  const prefix = 'docPrefill__';
  if (!fieldname.startsWith(prefix)) {
    return null;
  }
  const rest = fieldname.slice(prefix.length);
  if (rest.startsWith('OTHER__')) {
    const customKey = rest.slice('OTHER__'.length);
    if (!customKey) {
      return null;
    }
    return { type: DocumentType.OTHER, customKey };
  }
  if (!rest || rest.includes('__')) {
    return null;
  }
  return { type: rest, customKey: '' };
}
