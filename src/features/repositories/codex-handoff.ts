const CODEX_BASE_URL = "https://chatgpt.com/codex";

export function buildCodexHandoffUrl(
  repositoryUrl: string,
  appName: string,
  requestId: string,
) {
  const prompt = [
    `Open the managed GitHub repository ${repositoryUrl}.`,
    `This repo was created by the Cedarville App Portal for "${appName}" (request ${requestId}).`,
    "Use the managed repository as the source of truth, review the existing files, and help me customize the app.",
    "If GitHub access is required, use my connected GitHub account in Codex rather than asking for portal credentials.",
  ].join("\n");

  const url = new URL(CODEX_BASE_URL);
  url.searchParams.set("prompt", prompt);

  return url.toString();
}
