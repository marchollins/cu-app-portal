import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { deleteAppAction } from "@/features/app-deletion/actions";
import { LogoutButton } from "@/features/auth/logout-button";
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
  if (repositoryStatus === "DELETED") {
    return <span>The managed repo has been deleted.</span>;
  }

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

  if (publishStatus === "DELETED") {
    return <span>The Azure deployment has been deleted.</span>;
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

function formatStatus(status: string) {
  return status.toLowerCase().replaceAll("_", " ");
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

function renderDeletePanel(request: {
  id: string;
  repositoryOwner: string | null;
  repositoryName: string | null;
  repositoryStatus: string;
  publishStatus: string;
  azureWebAppName: string | null;
  azureDatabaseName: string | null;
}) {
  const deleteAction = deleteAppAction.bind(null, request.id);
  const canDeleteGitHub =
    request.repositoryStatus !== "DELETED" &&
    Boolean(request.repositoryOwner && request.repositoryName);
  const canDeleteAzure =
    request.publishStatus !== "DELETED" &&
    Boolean(request.azureWebAppName || request.azureDatabaseName);

  return (
    <details className="delete-panel">
      <summary>Delete App</summary>
      <form action={deleteAction}>
        <p className="delete-warning">
          Anything you leave unchecked must be deleted manually later.
        </p>
        <fieldset>
          <legend>Resources to delete</legend>
          <label>
            <input name="deletePortal" type="checkbox" />
            Delete portal record and generated ZIP
          </label>
          {canDeleteGitHub ? (
            <label>
              <input name="deleteGithub" type="checkbox" />
              Delete GitHub repository{" "}
              {`${request.repositoryOwner}/${request.repositoryName}`}
            </label>
          ) : (
            <p>GitHub repository is already deleted or not tracked.</p>
          )}
          {canDeleteAzure ? (
            <label>
              <input name="deleteAzure" type="checkbox" />
              <span>
                Delete Azure deployment
                {request.azureWebAppName ? (
                  <>: Web App {request.azureWebAppName}</>
                ) : null}
                {request.azureDatabaseName ? (
                  <>
                    {" "}
                    and PostgreSQL database {request.azureDatabaseName}
                  </>
                ) : null}
              </span>
            </label>
          ) : (
            <p>Azure deployment is already deleted or not tracked.</p>
          )}
        </fieldset>
        <label>
          <input name="confirmDelete" type="checkbox" required />
          I understand selected resources will be deleted.
        </label>
        <button type="submit">Delete Selected Resources</button>
      </form>
    </details>
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
      <LogoutButton />
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
              <p>Repo: {formatStatus(request.repositoryStatus)}</p>
              <p>
                Repo access: {formatStatus(request.repositoryAccessStatus)}
              </p>
              <p>Publish: {formatStatus(request.publishStatus)}</p>
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
              {renderDeletePanel({
                id: request.id,
                repositoryOwner: request.repositoryOwner,
                repositoryName: request.repositoryName,
                repositoryStatus: request.repositoryStatus,
                publishStatus: request.publishStatus,
                azureWebAppName: request.azureWebAppName,
                azureDatabaseName: request.azureDatabaseName,
              })}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
