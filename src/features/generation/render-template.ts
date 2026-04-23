export function renderTemplateString(
  source: string,
  values: Record<string, string>,
) {
  return Object.entries(values).reduce((result, [key, value]) => {
    return result.replaceAll(`{{${key}}}`, value);
  }, source);
}
