export function buildCodexHandoffPrompt(
  repositoryUrl: string,
  appName: string,
  requestId: string,
) {
  return [
    `Open the managed GitHub repository ${repositoryUrl}.`,
    `This repo was created by the Cedarville App Portal for "${appName}" (request ${requestId}).`,
    "Use the managed repository as the source of truth, review the existing files, and help me customize the app.",
    "If GitHub access is required, use my connected GitHub account in Codex rather than asking for portal credentials.",
  ].join("\n");
}
