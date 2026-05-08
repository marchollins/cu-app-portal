export function buildCodexHandoffPrompt(
  repositoryUrl: string,
  appName: string,
  requestId: string,
  options: {
    defaultBranch?: string | null;
    sourceRepositoryUrl?: string | null;
  } = {},
) {
  const prompt = [
    `Open the managed GitHub repository ${repositoryUrl}.`,
    `This repo was created by the Cedarville App Portal for "${appName}" (request ${requestId}).`,
    "Use the managed repository as the source of truth, review the existing files, and help me customize the app.",
    "If GitHub access is required, use my connected GitHub account in Codex rather than asking for portal credentials.",
  ];

  if (options.sourceRepositoryUrl) {
    const defaultBranch = options.defaultBranch ?? "main";

    prompt.push(
      "",
      `This app was imported from ${options.sourceRepositoryUrl}.`,
      "Keep the existing origin remote pointed at the source repository.",
      "Add the portal-managed repository as a separate remote named portal:",
      `git remote add portal ${repositoryUrl}`,
      "git fetch portal",
      `git pull portal ${defaultBranch}`,
      `git push portal HEAD:${defaultBranch}`,
      "Use the portal remote when preparing work for Cedarville App Portal publishing.",
    );
  }

  return prompt.join("\n");
}
