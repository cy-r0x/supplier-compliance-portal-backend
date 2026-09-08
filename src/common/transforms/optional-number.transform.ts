import { Transform } from 'class-transformer';

/** Coerce multipart/form string fields to numbers (or undefined when empty). */
export function TransformOptionalNumber() {
  return Transform(({ value }: { value: unknown }) => {
    if (value === '' || value === null || value === undefined) {
      return undefined;
    }
    const num = Number(value);
    return num;
  });
}
