import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { deleteAppAction } from "@/features/app-deletion/actions";
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
import { PendingSubmitButton } from "@/features/forms/pending-submit-button";
import {
  prepareExistingAppAction,
  verifyExistingAppPreparationAction,
} from "@/features/repository-imports/actions";
import { prisma } from "@/lib/db";

const PREPARATION_REQUIRED_MESSAGE =
  "Azure publishing unavailable until repository preparation is committed.";

type BadgeVariant = "success" | "error" | "warning" | "info" | "default";

function statusBadge(status: string): { label: string; variant: BadgeVariant } {
  const s = status.toLowerCase();
  if (
    s === "ready" ||
    s === "succeeded" ||
    s === "granted" ||
    s === "completed"
  ) {
    return { label: formatStatus(status), variant: "success" };
  }
  if (s === "failed") return { label: "Failed", variant: "error" };
  if (s === "deleted") return { label: "Deleted", variant: "default" };
  if (s === "not_started") return { label: "Not started", variant: "default" };
  if (s === "invited") return { label: "Invited", variant: "info" };
  return { label: formatStatus(status), variant: "info" };
}

function formatStatus(status: string) {
  return status.toLowerCase().replaceAll("_", " ");
}

function isImportedRepositoryPrepared(
  sourceOfTruth: string | undefined,
  preparationStatus: string | null | undefined,
) {
  return (
    sourceOfTruth !== "IMPORTED_REPOSITORY" || preparationStatus === "COMMITTED"
  );
}

function getDisplayPublishUrl(
  primaryPublishUrl: string | null,
  publishUrl: string | null,
) {
  return publishUrl ?? primaryPublishUrl;
}

function renderActionButton(
  requestId: string,
  repositoryStatus: string,
  publishStatus: string,
  sourceOfTruth?: string,
  preparationStatus?: string | null,
) {
  if (repositoryStatus === "DELETED") {
    return (
      <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
        Repo deleted
      </span>
    );
  }

  if (repositoryStatus === "FAILED") {
    const retryAction = retryRepositoryBootstrapAction.bind(null, requestId);
    return (
      <form action={retryAction}>
        <PendingSubmitButton
          idleLabel="Retry Repo Setup"
          pendingLabel="Retrying..."
          statusText="Retrying managed repo setup…"
          variant="primary"
        />
      </form>
    );
  }

  if (repositoryStatus !== "READY") {
    return (
      <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
        Awaiting repo setup
      </span>
    );
  }

  if (!isImportedRepositoryPrepared(sourceOfTruth, preparationStatus)) {
    return (
      <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
        {PREPARATION_REQUIRED_MESSAGE}
      </span>
    );
  }

  if (publishStatus === "FAILED") {
    const retryAction = retryPublishAction.bind(null, requestId);
    return (
      <form action={retryAction}>
        <PendingSubmitButton
          idleLabel="Retry Publish"
          pendingLabel="Retrying..."
          statusText="Retrying publish…"
          variant="primary"
        />
      </form>
    );
  }

  if (publishStatus === "DELETED") {
    return (
      <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
        Deployment deleted
      </span>
    );
  }

  if (publishStatus === "NOT_STARTED" || publishStatus === "SUCCEEDED") {
    const publishAction = publishToAzureAction.bind(null, requestId);
    return (
      <form action={publishAction}>
        <PendingSubmitButton
          idleLabel="Publish to Azure"
          pendingLabel="Publishing..."
          statusText="Publishing to Azure. This can take a few minutes."
          variant="primary-solid"
        />
      </form>
    );
  }

  return (
    <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
      Publish in progress…
    </span>
  );
}

function renderImportedRepositoryStatus(request: {
  id: string;
  repositoryImport: {
    sourceRepositoryUrl: string;
    importStatus: string;
    importErrorSummary?: string | null;
    compatibilityStatus: string;
    preparationMode?: string | null;
    preparationStatus: string;
    preparationPullRequestUrl?: string | null;
    preparationErrorSummary?: string | null;
  } | null;
}) {
  const repositoryImport = request.repositoryImport;

  if (!repositoryImport) {
    return null;
  }

  const prepareAction = prepareExistingAppAction.bind(null, request.id);
  const verifyAction = verifyExistingAppPreparationAction.bind(
    null,
    request.id,
    undefined,
  );
  const hasPublishingFileConflict =
    repositoryImport.preparationStatus === "BLOCKED" &&
    repositoryImport.compatibilityStatus === "CONFLICTED";
  const retryPreparationMode =
    repositoryImport.preparationMode === "DIRECT_COMMIT" ||
    repositoryImport.preparationMode === "PULL_REQUEST"
      ? repositoryImport.preparationMode
      : null;
  const canRetryPreparation =
    repositoryImport.preparationStatus === "FAILED" &&
    retryPreparationMode !== null;
  const canVerifyReadiness =
    repositoryImport.preparationStatus === "PULL_REQUEST_OPENED" ||
    hasPublishingFileConflict;

  return (
    <section aria-label="Imported repository status" style={{ marginTop: "1rem" }}>
      <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem", color: "var(--text-secondary)" }}>
        Imported repository status
      </h3>
      <div className="status-table">
        <p>Source repo: {repositoryImport.sourceRepositoryUrl}</p>
        <p>Import: {formatStatus(repositoryImport.importStatus)}</p>
        {repositoryImport.importErrorSummary ? (
          <p>Import error: {repositoryImport.importErrorSummary}</p>
        ) : null}
        <p>Compatibility: {formatStatus(repositoryImport.compatibilityStatus)}</p>
        <p>Preparation: {formatStatus(repositoryImport.preparationStatus)}</p>
        {repositoryImport.preparationPullRequestUrl ? (
          <p>
            Preparation PR:{" "}
            <a href={repositoryImport.preparationPullRequestUrl}>
              {repositoryImport.preparationPullRequestUrl}
            </a>
          </p>
        ) : null}
        {repositoryImport.preparationErrorSummary ? (
          <p>Preparation error: {repositoryImport.preparationErrorSummary}</p>
        ) : null}
      </div>
      {hasPublishingFileConflict ? (
        <div className="warning-box" style={{ marginTop: "0.75rem" }}>
          The portal will not overwrite existing publishing files directly. Open
          a PR to review the generated changes in Git, or resolve them manually
          and verify readiness here.
        </div>
      ) : null}
      {repositoryImport.preparationStatus === "PENDING_USER_CHOICE" ? (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
          <form action={prepareAction}>
            <input name="preparationMode" type="hidden" value="DIRECT_COMMIT" />
            <PendingSubmitButton
              idleLabel="Commit Azure Publishing Additions"
              pendingLabel="Committing Azure Publishing Additions..."
              statusText="Committing Azure publishing additions. This can take a moment."
              variant="primary-solid"
              size="sm"
            />
          </form>
          <form action={prepareAction}>
            <input name="preparationMode" type="hidden" value="PULL_REQUEST" />
            <PendingSubmitButton
              idleLabel="Open Azure Publishing PR"
              pendingLabel="Opening Azure Publishing PR..."
              statusText="Opening Azure publishing pull request. This can take a moment."
              variant="ghost"
              size="sm"
            />
          </form>
        </div>
      ) : null}
      {hasPublishingFileConflict ? (
        <form action={prepareAction} style={{ marginTop: "0.75rem" }}>
          <input name="preparationMode" type="hidden" value="PULL_REQUEST" />
          <PendingSubmitButton
            idleLabel="Open Azure Publishing PR"
            pendingLabel="Opening Azure Publishing PR..."
            statusText="Opening Azure publishing pull request. This can take a moment."
            variant="primary-solid"
            size="sm"
          />
        </form>
      ) : null}
      {canRetryPreparation ? (
        <form action={prepareAction} style={{ marginTop: "0.75rem" }}>
          <input
            name="preparationMode"
            type="hidden"
            value={retryPreparationMode ?? ""}
          />
          <PendingSubmitButton
            idleLabel="Retry Azure Publishing Preparation"
            pendingLabel="Retrying Azure Publishing Preparation..."
            statusText="Retrying Azure publishing preparation. This can take a moment."
            variant="primary-solid"
            size="sm"
          />
        </form>
      ) : null}
      {canVerifyReadiness ? (
        <form action={verifyAction} style={{ marginTop: "0.75rem" }}>
          <PendingSubmitButton
            idleLabel={
              hasPublishingFileConflict
                ? "Verify Repository Readiness"
                : "Verify PR Merge"
            }
            pendingLabel="Verifying Readiness..."
            statusText="Checking the default branch for required publishing files."
            variant="ghost"
            size="sm"
          />
        </form>
      ) : null}
    </section>
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
      <div className="delete-panel__content">
        <form action={deleteAction} className="form-stack">
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
                <code style={{ fontSize: "0.875em" }}>
                  {request.repositoryOwner}/{request.repositoryName}
                </code>
              </label>
            ) : (
              <p
                style={{
                  fontSize: "0.875rem",
                  color: "var(--text-muted)",
                  margin: 0,
                }}
              >
                GitHub repository already deleted or not tracked.
              </p>
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
                    <> and PostgreSQL database {request.azureDatabaseName}</>
                  ) : null}
                </span>
              </label>
            ) : (
              <p
                style={{
                  fontSize: "0.875rem",
                  color: "var(--text-muted)",
                  margin: 0,
                }}
              >
                Azure deployment already deleted or not tracked.
              </p>
            )}
          </fieldset>
          <label>
            <input name="confirmDelete" type="checkbox" required />
            I understand selected resources will be deleted.
          </label>
          <div>
            <PendingSubmitButton
              idleLabel="Delete Selected Resources"
              pendingLabel="Deleting Selected Resources..."
              statusText="Deleting selected resources. This can take a moment."
              variant="danger"
              size="sm"
            />
          </div>
        </form>
      </div>
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
      repositoryImport: true,
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
        <span className="breadcrumb__sep" aria-hidden="true">
          /
        </span>
        <Link href="/create">Create New App</Link>
        <span className="breadcrumb__sep" aria-hidden="true">
          /
        </span>
        <span aria-current="page">My Apps</span>
      </nav>

      <div
        className="page-header"
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h1>My Apps</h1>
          <p>Manage your generated apps, repositories, and Azure deployments.</p>
        </div>
        <Link href="/create" className="btn btn--primary-solid btn--sm">
          + Create New App
        </Link>
      </div>

      {appRequests.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">📦</div>
          <div className="empty-state__title">No apps yet</div>
          <p className="empty-state__desc">
            Create your first Cedarville-approved app to get started.
          </p>
          <Link href="/create" className="btn btn--primary-solid">
            Create New App
          </Link>
        </div>
      ) : (
        <ul
          className="grid grid--2"
          style={{ gap: "1.25rem", listStyle: "none", padding: 0, margin: 0 }}
        >
          {appRequests.map((request) => {
            const displayPublishUrl = getDisplayPublishUrl(
              request.primaryPublishUrl,
              request.publishUrl,
            );
            const genBadge = statusBadge(request.generationStatus);
            const repoBadge = statusBadge(request.repositoryStatus);
            const pubBadge = statusBadge(request.publishStatus);
            const accessBadge = statusBadge(request.repositoryAccessStatus);

            return (
              <li key={request.id} className="app-card">
                <div className="app-card__header">
                  <h2 className="app-card__name">{request.appName}</h2>
                </div>

                <div className="app-card__body">
                  <div className="app-card__statuses">
                    <span
                      className={`badge badge--${genBadge.variant}`}
                      title="Generation"
                    >
                      Gen: {genBadge.label}
                    </span>
                    <span
                      className={`badge badge--${repoBadge.variant}`}
                      title="Repository"
                    >
                      Repo: {repoBadge.label}
                    </span>
                    <span
                      className={`badge badge--${pubBadge.variant}`}
                      title="Publish"
                    >
                      Publish: {pubBadge.label}
                    </span>
                    <span
                      className={`badge badge--${accessBadge.variant}`}
                      title="Repo Access"
                    >
                      Repo access: {accessBadge.label}
                    </span>
                  </div>

                  <div className="status-table">
                    {request.repositoryUrl ? (
                      <div className="status-row">
                        <span className="status-row__label">Repository</span>
                        <a
                          href={request.repositoryUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="meta-link"
                        >
                          {request.repositoryUrl.replace(
                            "https://github.com/",
                            "",
                          )}
                        </a>
                      </div>
                    ) : null}
                    {request.azureWebAppName ? (
                      <div className="status-row">
                        Azure app: {request.azureWebAppName}
                      </div>
                    ) : null}
                    {displayPublishUrl ? (
                      <div className="status-row">
                        <a
                          href={displayPublishUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="meta-link"
                        >
                          {displayPublishUrl}
                        </a>
                      </div>
                    ) : null}
                    {request.publishAttempts[0]?.githubWorkflowRunUrl ? (
                      <div className="status-row">
                        <a
                          href={request.publishAttempts[0].githubWorkflowRunUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="meta-link"
                        >
                          GitHub workflow
                        </a>
                      </div>
                    ) : null}
                  </div>

                  {request.repositoryStatus === "READY" &&
                  request.repositoryAccessStatus !== "GRANTED" ? (
                    <div style={{ marginTop: "1rem" }}>
                      <p
                        style={{
                          fontSize: "0.875rem",
                          marginBottom: "0.75rem",
                        }}
                      >
                        Need GitHub access for Codex?{" "}
                        <a
                          href="https://github.com/signup"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Create a GitHub account
                        </a>{" "}
                        then enter your username below.
                      </p>
                      <form
                        action={saveGitHubUsernameAndGrantAccessAction.bind(
                          null,
                          request.id,
                        )}
                        style={{
                          display: "flex",
                          gap: "0.5rem",
                          flexWrap: "wrap",
                        }}
                      >
                        <input
                          name="githubUsername"
                          type="text"
                          required
                          placeholder="GitHub username"
                          defaultValue={currentUser?.githubUsername ?? ""}
                          className="form-control"
                          style={{ maxWidth: "220px" }}
                        />
                        <button
                          type="submit"
                          className="btn btn--secondary-solid btn--sm"
                        >
                          {request.repositoryAccessStatus === "INVITED"
                            ? "Resend Invite"
                            : "Grant Access"}
                        </button>
                      </form>
                    </div>
                  ) : null}

                  {renderImportedRepositoryStatus({
                    id: request.id,
                    repositoryImport: request.repositoryImport,
                  })}

                  <div className="app-card__actions">
                    <Link
                      href={`/download/${request.id}`}
                      className="btn btn--ghost btn--sm"
                    >
                      App Details
                    </Link>
                    {request.repositoryUrl ? (
                      <CopyCodexHandoffButton
                        prompt={buildCodexHandoffPrompt(
                          request.repositoryUrl,
                          request.appName,
                          request.id,
                          {
                            defaultBranch: request.repositoryDefaultBranch,
                            sourceRepositoryUrl:
                              request.repositoryImport?.importStatus ===
                              "SUCCEEDED"
                                ? request.repositoryImport.sourceRepositoryUrl
                                : null,
                          },
                        )}
                      />
                    ) : null}
                    {renderActionButton(
                      request.id,
                      request.repositoryStatus,
                      request.publishStatus,
                      request.sourceOfTruth,
                      request.repositoryImport?.preparationStatus,
                    )}
                  </div>

                  {renderDeletePanel({
                    id: request.id,
                    repositoryOwner: request.repositoryOwner,
                    repositoryName: request.repositoryName,
                    repositoryStatus: request.repositoryStatus,
                    publishStatus: request.publishStatus,
                    azureWebAppName: request.azureWebAppName,
                    azureDatabaseName: request.azureDatabaseName,
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
