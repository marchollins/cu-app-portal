export type ParsedGitHubRepositoryUrl = {
  owner: string;
  name: string;
  normalizedUrl: string;
  fullName: string;
};

const SSH_GITHUB_REPO_PATTERN = /^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i;

function stripGitSuffix(value: string) {
  return value.endsWith(".git") ? value.slice(0, -4) : value;
}

function assertOwnerAndName(owner: string | undefined, name: string | undefined) {
  if (!owner || !name) {
    throw new Error(
      "Enter a GitHub repository URL in the form https://github.com/owner/repo.",
    );
  }
}

export function parseGitHubRepositoryUrl(
  value: string,
): ParsedGitHubRepositoryUrl {
  const trimmed = value.trim();
  const sshMatch = SSH_GITHUB_REPO_PATTERN.exec(trimmed);

  if (sshMatch) {
    const owner = sshMatch[1];
    const name = stripGitSuffix(sshMatch[2]);
    assertOwnerAndName(owner, name);

    return {
      owner,
      name,
      normalizedUrl: `https://github.com/${owner}/${name}`,
      fullName: `${owner}/${name}`,
    };
  }

  let url: URL;

  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Enter a GitHub repository URL.");
  }

  if (url.hostname.toLowerCase() !== "github.com") {
    throw new Error("Enter a GitHub repository URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Enter a GitHub repository URL.");
  }

  const pathSegments = url.pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (pathSegments.length !== 2) {
    throw new Error(
      "Enter a GitHub repository URL in the form https://github.com/owner/repo.",
    );
  }

  const [owner, rawName] = pathSegments;
  const name = rawName ? stripGitSuffix(rawName) : undefined;
  assertOwnerAndName(owner, name);

  return {
    owner,
    name: name as string,
    normalizedUrl: `https://github.com/${owner}/${name}`,
    fullName: `${owner}/${name}`,
  };
}
