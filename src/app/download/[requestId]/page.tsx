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
import { PendingSubmitButton } from "@/features/forms/pending-submit-button";
import { buildCodexHandoffPrompt } from "@/features/repositories/codex-handoff";
import { CopyCodexHandoffButton } from "@/features/repositories/copy-codex-handoff-button";
import { prisma } from "@/lib/db";

function formatStatus(status: string) {
  return status.toLowerCase().replaceAll("_", " ");
}

type BadgeVariant = "success" | "error" | "warning" | "info" | "default";

function publishBadge(status: string): { label: string; variant: BadgeVariant } {
  switch (status) {
    case "SUCCEEDED": return { label: "Published", variant: "success" };
    case "FAILED": return { label: "Failed", variant: "error" };
    case "IN_PROGRESS": return { label: "In progress", variant: "info" };
    case "DELETED": return { label: "Deleted", variant: "default" };
    default: return { label: formatStatus(status), variant: "default" };
  }
}

function getDisplayPublishUrl(
  primaryPublishUrl: string | null,
  publishUrl: string | null,
) {
  return publishUrl ?? primaryPublishUrl;
}

function renderPublishAction(requestId: string, publishStatus: string, repositoryStatus: string) {
  if (repositoryStatus === "FAILED") {
    const retryAction = retryRepositoryBootstrapAction.bind(null, requestId);
    return (
      <form action={retryAction}>
        <PendingSubmitButton
          idleLabel="Retry Repo Setup"
          pendingLabel="Retrying Repo Setup…"
          statusText="Retrying managed repo setup. This can take a moment."
          variant="primary"
        />
      </form>
    );
  }

  if (repositoryStatus !== "READY") return null;

  if (publishStatus === "FAILED") {
    const retryAction = retryPublishAction.bind(null, requestId);
    return (
      <form action={retryAction}>
        <PendingSubmitButton
          idleLabel="Retry Publish"
          pendingLabel="Retrying Publish…"
          statusText="Retrying publish to Azure…"
          variant="primary"
        />
      </form>
    );
  }

  if (publishStatus === "NOT_STARTED" || publishStatus === "SUCCEEDED") {
    const publishAction = publishToAzureAction.bind(null, requestId);
    return (
      <form action={publishAction}>
        <PendingSubmitButton
          idleLabel="Publish to Azure"
          pendingLabel="Publishing to Azure…"
          statusText="Publishing to Azure. This can take a few minutes."
          variant="primary-solid"
        />
      </form>
    );
  }

  return (
    <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem" }}>
      Publish is in progress — check back shortly.
    </p>
  );
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
    where: { id: requestId, userId },
    include: {
      artifact: true,
      publishAttempts: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!appRequest?.artifact) {
    notFound();
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { githubUsername: true },
  });

  const displayPublishUrl = getDisplayPublishUrl(
    appRequest.primaryPublishUrl,
    appRequest.publishUrl,
  );
  const pub = publishBadge(appRequest.publishStatus);

  return (
    <main>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/">Home</Link>
        <span className="breadcrumb__sep" aria-hidden="true">/</span>
        <Link href="/apps">My Apps</Link>
        <span className="breadcrumb__sep" aria-hidden="true">/</span>
        <span aria-current="page">{appRequest.appName}</span>
      </nav>

      <div className="page-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1>Your App Is Ready</h1>
          <p>{appRequest.appName} — Download the ZIP, set up Codex, and publish to Azure.</p>
        </div>
        {appRequest.repositoryStatus === "FAILED" ? (
          <Link href={`/api/download/${requestId}`} className="btn btn--secondary-solid">
            ⬇ Download ZIP
          </Link>
        ) : null}
      </div>

      <div style={{ display: "grid", gap: "1.25rem" }}>

        {/* Repository section */}
        <div className="card card--navy-border">
          <p className="section-title">Managed Repository</p>
          {appRequest.repositoryStatus === "READY" && appRequest.repositoryUrl ? (
            <>
              <div className="status-table" style={{ marginBottom: "1rem" }}>
                <div className="status-row">
                  <span>
                    Managed repo ready:{" "}
                    <a href={appRequest.repositoryUrl} target="_blank" rel="noreferrer" className="meta-link">
                      {appRequest.repositoryUrl}
                    </a>
                  </span>
                </div>
              </div>
              <CopyCodexHandoffButton
                prompt={buildCodexHandoffPrompt(
                  appRequest.repositoryUrl,
                  appRequest.appName,
                  requestId,
                )}
              />
            </>
          ) : appRequest.repositoryStatus === "FAILED" ? (
            <div className="error-box">
              Repo setup failed. The ZIP is still available. An operator may need to
              fix the GitHub App or org configuration before portal publishing can continue.
            </div>
          ) : (
            <div className="info-box">Managed repo setup in progress — check back shortly.</div>
          )}

          {appRequest.publishErrorSummary && appRequest.repositoryStatus === "FAILED" ? (
            <div className="warning-box" style={{ marginTop: "0.75rem" }}>
              Repo setup note: {appRequest.publishErrorSummary}
            </div>
          ) : null}
        </div>

        {/* GitHub access section */}
        {appRequest.repositoryStatus === "READY" ? (
          <div className="card card--gold-border">
            <p className="section-title">GitHub Access for Codex</p>
            {appRequest.repositoryAccessStatus === "GRANTED" ? (
              <div className="success-box">
                Repo access granted{currentUser?.githubUsername ? ` for @${currentUser.githubUsername}` : ""}.
              </div>
            ) : (
              <>
                <p style={{ fontSize: "0.9375rem", marginBottom: "0.875rem" }}>
                  Need Codex access to this repo?{" "}
                  <a href="https://github.com/signup" target="_blank" rel="noreferrer">
                    Create a GitHub account
                  </a>
                  , then enter your username so the portal can invite you.
                </p>
                {appRequest.repositoryAccessNote ? (
                  <div className="warning-box" style={{ marginBottom: "0.875rem" }}>
                    {appRequest.repositoryAccessNote}
                  </div>
                ) : null}
                <form
                  action={saveGitHubUsernameAndGrantAccessAction.bind(null, requestId)}
                  style={{ display: "flex", gap: "0.625rem", flexWrap: "wrap" }}
                >
                  <input
                    name="githubUsername"
                    type="text"
                    required
                    placeholder="GitHub username"
                    defaultValue={currentUser?.githubUsername ?? ""}
                    className="form-control"
                    style={{ maxWidth: "240px" }}
                  />
                  <button type="submit" className="btn btn--secondary-solid">
                    {appRequest.repositoryAccessStatus === "INVITED"
                      ? "Resend Repo Access Invite"
                      : "Grant Repo Access"}
                  </button>
                </form>
              </>
            )}
          </div>
        ) : null}

        {/* Codex workflow steps */}
        <div className="card">
          <p className="section-title">Codex Workflow</p>
          <ol className="step-list">
            <li>Open the managed repo locally in Codex on your machine.</li>
            <li>Let Codex clone, customize, commit, and push your changes.</li>
            <li>Return here when the repo is ready to publish to Azure.</li>
            <li>Use portal publishing instead of setting up Azure tooling locally.</li>
          </ol>
        </div>

        {/* Publish section */}
        <div className="card card--navy-border">
          <p className="section-title">Azure Publishing</p>
          <div className="status-table" style={{ marginBottom: "1rem" }}>
            <div className="status-row">
              <span className="status-row__label">Status</span>
              <span className={`badge badge--${pub.variant}`}>{pub.label}</span>
            </div>
            {appRequest.azureWebAppName ? (
              <div className="status-row">
                Azure app: {appRequest.azureWebAppName}
              </div>
            ) : null}
            {displayPublishUrl ? (
              <div className="status-row">
                <a href={displayPublishUrl} target="_blank" rel="noreferrer" className="meta-link">
                  {displayPublishUrl}
                </a>
              </div>
            ) : null}
            {appRequest.publishAttempts[0]?.githubWorkflowRunUrl ? (
              <div className="status-row">
                <a href={appRequest.publishAttempts[0].githubWorkflowRunUrl} target="_blank" rel="noreferrer" className="meta-link">
                  GitHub workflow
                </a>
              </div>
            ) : null}
          </div>

          {appRequest.publishErrorSummary && appRequest.repositoryStatus !== "FAILED" ? (
            <div className="warning-box" style={{ marginBottom: "0.875rem" }}>
              Last publish note: {appRequest.publishErrorSummary}
            </div>
          ) : null}

          {renderPublishAction(requestId, appRequest.publishStatus, appRequest.repositoryStatus)}
        </div>

      </div>

      <div style={{ marginTop: "1.5rem", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
        Need to revisit this later? Go to <Link href="/apps">My Apps</Link>.
      </div>
    </main>
  );
}
