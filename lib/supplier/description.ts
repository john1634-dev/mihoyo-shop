/** Build product description with preserved original supplier title. */
export function buildSupplierDescription(
  originalTitle: string,
  supplierDescription: string | null | undefined
): string {
  const header = `Original supplier title: ${originalTitle}`;
  if (!supplierDescription?.trim()) return header;
  return `${header}\n\n${supplierDescription.trim()}`;
}
