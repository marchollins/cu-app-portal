export function createSupportReference(date = new Date()) {
  const stamp = date.toISOString().slice(0, 10).replaceAll("-", "");
  const random = crypto.randomUUID().split("-")[0].toUpperCase();
  return `SUP-${stamp}-${random}`;
}
