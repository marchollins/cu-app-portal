import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
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

function renderAction(requestId: string, repositoryStatus: string, publishStatus: string) {
  if (repositoryStatus === "FAILED") {
    const retryAction = retryRepositoryBootstrapAction.bind(null, requestId);

    return (
      <form action={retryAction}>
        <button type="submit">Retry Repo Setup</button>
      </form>
    );
  }

  if (repositoryStatus !== "READY") {
    return <span>Portal publish unavailable until the managed repo is ready.</span>;
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

  return <span>Publish is already in progress.</span>;
}

function getDisplayPublishUrl(
  primaryPublishUrl: string | null,
  publishUrl: string | null,
) {
  return publishUrl ?? primaryPublishUrl;
}

function renderPublishMetadata({
  azureWebAppName,
  primaryPublishUrl,
  publishUrl,
  githubWorkflowRunUrl,
}: {
  azureWebAppName: string | null;
  primaryPublishUrl: string | null;
  publishUrl: string | null;
  githubWorkflowRunUrl: string | null;
}) {
  const displayPublishUrl = getDisplayPublishUrl(primaryPublishUrl, publishUrl);

  if (!azureWebAppName && !displayPublishUrl && !githubWorkflowRunUrl) {
    return null;
  }

  return (
    <>
      {azureWebAppName ? <p>Azure app: {azureWebAppName}</p> : null}
      {displayPublishUrl ? (
        <p>
          Publish URL: <a href={displayPublishUrl}>{displayPublishUrl}</a>
        </p>
      ) : null}
      {githubWorkflowRunUrl ? (
        <p>
          <a href={githubWorkflowRunUrl}>GitHub workflow</a>
        </p>
      ) : null}
    </>
  );
}

export default async function MyAppsPage() {
  const userId = await getCurrentUserIdOrNull();

  if (!userId) {
    redirect("/");
  }

  const appRequests = await prisma.appRequest.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      publishAttempts: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { githubUsername: true },
  });

  return (
    <main>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <Link href="/create">Create New App</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">My Apps</span>
      </nav>
      <h1>My Apps</h1>
      <p>Revisit your generated apps, managed repos, and portal publish status.</p>
      {appRequests.length === 0 ? (
        <p>No app requests yet.</p>
      ) : (
        <ul>
          {appRequests.map((request) => (
            <li key={request.id}>
              <h2>{request.appName}</h2>
              <p>Generation: {request.generationStatus.toLowerCase()}</p>
              <p>Repo: {request.repositoryStatus.toLowerCase()}</p>
              <p>
                Repo access: {request.repositoryAccessStatus.toLowerCase().replaceAll("_", " ")}
              </p>
              <p>Publish: {request.publishStatus.toLowerCase().replaceAll("_", " ")}</p>
              {request.repositoryUrl ? (
                <>
                  <p>
                    Repo URL: <a href={request.repositoryUrl}>{request.repositoryUrl}</a>
                  </p>
                  <p>
                    <CopyCodexHandoffButton
                      prompt={buildCodexHandoffPrompt(
                        request.repositoryUrl,
                        request.appName,
                        request.id,
                      )}
                    />
                  </p>
                </>
              ) : null}
              {request.repositoryStatus === "READY" &&
              request.repositoryAccessStatus !== "GRANTED" ? (
                <>
                  <p>
                    Need GitHub access for Codex? Create an account at{" "}
                    <a
                      href="https://github.com/signup"
                      target="_blank"
                      rel="noreferrer"
                    >
                      GitHub sign up
                    </a>
                    , then enter your username here.
                  </p>
                  {request.repositoryAccessNote ? (
                    <p>Repo access note: {request.repositoryAccessNote}</p>
                  ) : null}
                  <form
                    action={saveGitHubUsernameAndGrantAccessAction.bind(
                      null,
                      request.id,
                    )}
                  >
                    <label>
                      GitHub Username
                      <input
                        name="githubUsername"
                        type="text"
                        required
                        defaultValue={currentUser?.githubUsername ?? ""}
                      />
                    </label>
                    <button type="submit">
                      {request.repositoryAccessStatus === "INVITED"
                        ? "Resend Repo Access Invite"
                        : "Save Username and Grant Repo Access"}
                    </button>
                  </form>
                </>
              ) : null}
              {renderPublishMetadata({
                azureWebAppName: request.azureWebAppName,
                primaryPublishUrl: request.primaryPublishUrl,
                publishUrl: request.publishUrl,
                githubWorkflowRunUrl:
                  request.publishAttempts[0]?.githubWorkflowRunUrl ?? null,
              })}
              <p>
                <Link href={`/download/${request.id}`}>Open app details</Link>
              </p>
              {renderAction(
                request.id,
                request.repositoryStatus,
                request.publishStatus,
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
