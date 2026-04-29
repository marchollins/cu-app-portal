import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import {
  publishToAzureAction,
  retryPublishAction,
} from "@/features/publishing/actions";
import {
  retryRepositoryBootstrapAction,
  saveGitHubUsernameAndGrantAccessAction,
} from "@/features/repositories/actions";
import { buildCodexHandoffPrompt } from "@/features/repositories/codex-handoff";
import { CopyCodexHandoffButton } from "@/features/repositories/copy-codex-handoff-button";
import { prisma } from "@/lib/db";

function renderRepositoryStatus(
  status: string,
  repositoryUrl: string | null,
  appName: string,
  requestId: string,
) {
  if (status === "READY" && repositoryUrl) {
    const codexPrompt = buildCodexHandoffPrompt(
      repositoryUrl,
      appName,
      requestId,
    );

    return (
      <>
        <p>
          Managed repo ready: <a href={repositoryUrl}>{repositoryUrl}</a>
        </p>
        <p>
          <CopyCodexHandoffButton prompt={codexPrompt} />
        </p>
      </>
    );
  }

  if (status === "FAILED") {
    return (
      <p>
        Repo setup failed. The ZIP is still available, and an operator may need
        to fix the GitHub App or org configuration before portal publishing can
        continue.
      </p>
    );
  }

  return <p>Repo setup in progress.</p>;
}

function renderRepositoryNote(
  repositoryStatus: string,
  publishErrorSummary: string | null,
) {
  if (!publishErrorSummary) {
    return null;
  }

  if (repositoryStatus === "FAILED") {
    return <p>Repo setup note: {publishErrorSummary}</p>;
  }

  return <p>Last publish note: {publishErrorSummary}</p>;
}

function renderRepositoryAccessSection(
  requestId: string,
  repositoryStatus: string,
  repositoryAccessStatus: string,
  repositoryAccessNote: string | null,
  githubUsername: string | null,
) {
  if (repositoryStatus !== "READY") {
    return null;
  }

  if (repositoryAccessStatus === "GRANTED") {
    return <p>Repo access granted{githubUsername ? ` for @${githubUsername}` : ""}.</p>;
  }

  const grantAccessAction = saveGitHubUsernameAndGrantAccessAction.bind(
    null,
    requestId,
  );

  return (
    <>
      <p>
        Need GitHub access for Codex? Create an account at{" "}
        <a href="https://github.com/signup" target="_blank" rel="noreferrer">
          GitHub sign up
        </a>
        , then enter your username here so the portal can invite you to the managed repo.
      </p>
      {repositoryAccessNote ? <p>Repo access note: {repositoryAccessNote}</p> : null}
      <form action={grantAccessAction}>
        <label>
          GitHub Username
          <input
            name="githubUsername"
            type="text"
            required
            defaultValue={githubUsername ?? ""}
          />
        </label>
        <button type="submit">
          {repositoryAccessStatus === "INVITED"
            ? "Resend Repo Access Invite"
            : "Save Username and Grant Repo Access"}
        </button>
      </form>
    </>
  );
}

function renderPublishAction(requestId: string, publishStatus: string, repositoryStatus: string) {
  if (repositoryStatus === "FAILED") {
    const retryAction = retryRepositoryBootstrapAction.bind(null, requestId);

    return (
      <form action={retryAction}>
        <button type="submit">Retry Repo Setup</button>
      </form>
    );
  }

  if (repositoryStatus !== "READY") {
    return null;
  }

  if (publishStatus === "FAILED") {
    const retryAction = retryPublishAction.bind(null, requestId);

    return (
      <form action={retryAction}>
        <button type="submit">Retry Publish</button>
      </form>
    );
  }

  if (publishStatus === "NOT_STARTED" || publishStatus === "SUCCEEDED") {
    const publishAction = publishToAzureAction.bind(null, requestId);

    return (
      <form action={publishAction}>
        <button type="submit">Publish to Azure</button>
      </form>
    );
  }

  return <p>Publish status: {publishStatus.toLowerCase().replaceAll("_", " ")}</p>;
}

export default async function DownloadPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  const userId = await getCurrentUserIdOrNull();

  if (!userId) {
    notFound();
  }

  const appRequest = await prisma.appRequest.findFirst({
    where: {
      id: requestId,
      userId,
    },
    include: {
      artifact: true,
    },
  });

  if (!appRequest?.artifact) {
    notFound();
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { githubUsername: true },
  });

  return (
    <main>
      <h1>Your App Is Ready</h1>
      <p>
        The portal generated the ZIP artifact and tracks the managed GitHub
        repository for supported publishing.
      </p>
      <Link href={`/api/download/${requestId}`}>Download ZIP</Link>
      {renderRepositoryStatus(
        appRequest.repositoryStatus,
        appRequest.repositoryUrl,
        appRequest.appName,
        requestId,
      )}
      {renderRepositoryAccessSection(
        requestId,
        appRequest.repositoryStatus,
        appRequest.repositoryAccessStatus,
        appRequest.repositoryAccessNote,
        currentUser?.githubUsername ?? null,
      )}
      <ol>
        <li>Open the managed repo locally in Codex on your machine.</li>
        <li>Let Codex clone, customize, commit, and push your changes.</li>
        <li>Return here when the tracked GitHub repo is ready to publish.</li>
        <li>Use portal publishing instead of setting up Azure tooling locally.</li>
      </ol>
      <p>Publish status: {appRequest.publishStatus.toLowerCase().replaceAll("_", " ")}</p>
      {appRequest.publishUrl ? (
        <p>
          Published URL: <a href={appRequest.publishUrl}>{appRequest.publishUrl}</a>
        </p>
      ) : null}
      {renderRepositoryNote(
        appRequest.repositoryStatus,
        appRequest.publishErrorSummary,
      )}
      {renderPublishAction(
        requestId,
        appRequest.publishStatus,
        appRequest.repositoryStatus,
      )}
      <p>
        Need to revisit this later? Go to <Link href="/apps">My Apps</Link>.
      </p>
    </main>
  );
}
