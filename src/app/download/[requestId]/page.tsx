import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import {
  publishToAzureAction,
  retryPublishAction,
} from "@/features/publishing/actions";
import { repairPublishingSetupAction } from "@/features/publishing/setup/actions";
import {
  retryRepositoryBootstrapAction,
  saveGitHubUsernameAndGrantAccessAction,
} from "@/features/repositories/actions";
import {
  prepareExistingAppAction,
  verifyExistingAppPreparationAction,
} from "@/features/repository-imports/actions";
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
    case "SUCCEEDED":
      return { label: "Published", variant: "success" };
    case "FAILED":
      return { label: "Failed", variant: "error" };
    case "IN_PROGRESS":
      return { label: "In progress", variant: "info" };
    case "DELETED":
      return { label: "Deleted", variant: "default" };
    default:
      return { label: formatStatus(status), variant: "default" };
  }
}

function getDisplayPublishUrl(
  primaryPublishUrl: string | null,
  publishUrl: string | null,
) {
  return publishUrl ?? primaryPublishUrl;
}

const PREPARATION_REQUIRED_MESSAGE =
  "Azure publishing unavailable until repository preparation is committed.";

function isImportedRepositoryPrepared(
  sourceOfTruth: string,
  preparationStatus: string | null | undefined,
) {
  return (
    sourceOfTruth !== "IMPORTED_REPOSITORY" || preparationStatus === "COMMITTED"
  );
}

function needsPublishingSetupRepair(status: string | null | undefined) {
  return status === "NEEDS_REPAIR" || status === "BLOCKED";
}

function renderPublishingSetupStatus(request: {
  id: string;
  publishingSetupStatus?: string | null;
  publishingSetupErrorSummary?: string | null;
  publishSetupChecks?: Array<{
    checkKey: string;
    status: string;
    message: string;
  }>;
}) {
  const status = request.publishingSetupStatus ?? "NOT_CHECKED";
  const repairAction = repairPublishingSetupAction.bind(null, request.id);

  return (
    <section aria-label="Publishing setup status" className="setup-status">
      <h3 className="setup-status__title">Publishing setup</h3>
      <p>Setup: {formatStatus(status)}</p>
      {request.publishingSetupErrorSummary ? (
        <p className="setup-status__summary">
          {request.publishingSetupErrorSummary}
        </p>
      ) : null}
      {request.publishSetupChecks?.length ? (
        <ul className="setup-status__checks">
          {request.publishSetupChecks.map((check) => (
            <li key={check.checkKey}>
              {formatStatus(check.checkKey)}: {formatStatus(check.status)} -{" "}
              {check.message}
            </li>
          ))}
        </ul>
      ) : null}
      {needsPublishingSetupRepair(status) ? (
        <form action={repairAction}>
          <PendingSubmitButton
            idleLabel="Repair Publishing Setup"
            pendingLabel="Repairing Publishing Setup..."
            statusText="Refreshing Azure, Entra, and GitHub publishing setup."
            variant="primary-solid"
            size="sm"
          />
        </form>
      ) : null}
    </section>
  );
}

function getImportedRepositoryRemoteWorkflow({
  repositoryImport,
  repositoryUrl,
  repositoryDefaultBranch,
}: {
  repositoryImport: {
    importStatus?: string | null;
    sourceRepositoryUrl?: string | null;
  } | null;
  repositoryUrl: string | null;
  repositoryDefaultBranch?: string | null;
}) {
  if (
    !repositoryUrl ||
    repositoryImport?.importStatus !== "SUCCEEDED" ||
    !repositoryImport.sourceRepositoryUrl
  ) {
    return null;
  }

  const defaultBranch = repositoryDefaultBranch ?? "main";

  return {
    defaultBranch,
    portalRepositoryUrl: repositoryUrl,
    sourceRepositoryUrl: repositoryImport.sourceRepositoryUrl,
  };
}

function renderImportedRepositoryStatus({
  requestId,
  repositoryImport,
}: {
  requestId: string;
  repositoryImport: {
    sourceRepositoryUrl?: string | null;
    importStatus?: string | null;
    importErrorSummary?: string | null;
    compatibilityStatus?: string | null;
    preparationMode?: string | null;
    preparationStatus?: string | null;
    preparationPullRequestUrl?: string | null;
    preparationErrorSummary?: string | null;
  } | null;
}) {
  if (!repositoryImport) {
    return null;
  }

  const prepareAction = prepareExistingAppAction.bind(null, requestId);
  const verifyAction = verifyExistingAppPreparationAction.bind(
    null,
    requestId,
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
    <section
      aria-label="Imported repository status"
      className="card card--gold-border"
    >
      <p className="section-title">Imported Repository Status</p>
      <div className="status-table" style={{ marginBottom: "1rem" }}>
        {repositoryImport.sourceRepositoryUrl ? (
          <p>Source repo: {repositoryImport.sourceRepositoryUrl}</p>
        ) : null}
        {repositoryImport.importStatus ? (
          <p>Import: {formatStatus(repositoryImport.importStatus)}</p>
        ) : null}
        {repositoryImport.importErrorSummary ? (
          <p>Import error: {repositoryImport.importErrorSummary}</p>
        ) : null}
        {repositoryImport.compatibilityStatus ? (
          <p>
            Compatibility: {formatStatus(repositoryImport.compatibilityStatus)}
          </p>
        ) : null}
        {repositoryImport.preparationStatus ? (
          <p>Preparation: {formatStatus(repositoryImport.preparationStatus)}</p>
        ) : null}
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
        <div className="warning-box" style={{ marginBottom: "1rem" }}>
          The portal will not overwrite existing publishing files directly. Open
          a PR to review the generated changes in Git, or resolve them manually
          and verify readiness here.
        </div>
      ) : null}
      {repositoryImport.preparationStatus === "PENDING_USER_CHOICE" ? (
        <div
          style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
        >
          <form action={prepareAction}>
            <input
              name="preparationMode"
              type="hidden"
              value="DIRECT_COMMIT"
            />
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
        <form action={prepareAction}>
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
        <form action={prepareAction}>
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
        <form action={verifyAction}>
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

function renderPublishAction({
  requestId,
  publishStatus,
  repositoryStatus,
  sourceOfTruth,
  preparationStatus,
  publishingSetupStatus,
}: {
  requestId: string;
  publishStatus: string;
  repositoryStatus: string;
  sourceOfTruth: string;
  preparationStatus: string | null | undefined;
  publishingSetupStatus: string | null | undefined;
}) {
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

  if (!isImportedRepositoryPrepared(sourceOfTruth, preparationStatus)) {
    return <p>{PREPARATION_REQUIRED_MESSAGE}</p>;
  }

  if (needsPublishingSetupRepair(publishingSetupStatus)) {
    return (
      <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem" }}>
        Repair publishing setup before publishing.
      </p>
    );
  }

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
      repositoryImport: true,
      publishSetupChecks: {
        orderBy: { checkedAt: "desc" },
        take: 7,
      },
    },
  });

  if (!appRequest) {
    notFound();
  }

  const isImportedApp = appRequest.sourceOfTruth === "IMPORTED_REPOSITORY";

  if (!appRequest.artifact && !isImportedApp) {
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
  const importedRepositoryRemoteWorkflow = getImportedRepositoryRemoteWorkflow({
    repositoryImport: appRequest.repositoryImport,
    repositoryUrl: appRequest.repositoryUrl,
    repositoryDefaultBranch: appRequest.repositoryDefaultBranch,
  });

  return (
    <main>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/">Home</Link>
        <span className="breadcrumb__sep" aria-hidden="true">
          /
        </span>
        <Link href="/apps">My Apps</Link>
        <span className="breadcrumb__sep" aria-hidden="true">
          /
        </span>
        <span aria-current="page">{appRequest.appName}</span>
      </nav>

      <div
        className="page-header"
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h1>{isImportedApp ? "Imported App Details" : "Your App Is Ready"}</h1>
          <p>
            {isImportedApp
              ? `The portal tracks ${appRequest.appName} for Azure publishing.`
              : `${appRequest.appName} — Download the ZIP, set up Codex, and publish to Azure.`}
          </p>
        </div>
        {appRequest.repositoryStatus === "FAILED" && appRequest.artifact ? (
          <Link
            href={`/api/download/${requestId}`}
            className="btn btn--secondary-solid"
          >
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
                    <a
                      href={appRequest.repositoryUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="meta-link"
                    >
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
                  {
                    defaultBranch:
                      importedRepositoryRemoteWorkflow?.defaultBranch,
                    sourceRepositoryUrl:
                      importedRepositoryRemoteWorkflow?.sourceRepositoryUrl,
                  },
                )}
              />
            </>
          ) : appRequest.repositoryStatus === "FAILED" ? (
            <div className="error-box">
              Repo setup failed.
              {appRequest.artifact ? " The ZIP is still available." : ""} An
              operator may need to fix the GitHub App or org configuration before
              portal publishing can continue.
            </div>
          ) : (
            <div className="info-box">
              Managed repo setup in progress — check back shortly.
            </div>
          )}

          {appRequest.publishErrorSummary &&
          appRequest.repositoryStatus === "FAILED" ? (
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
                Repo access granted
                {currentUser?.githubUsername
                  ? ` for @${currentUser.githubUsername}`
                  : ""}
                .
              </div>
            ) : (
              <>
                <p
                  style={{
                    fontSize: "0.9375rem",
                    marginBottom: "0.875rem",
                  }}
                >
                  Need Codex access to this repo?{" "}
                  <a
                    href="https://github.com/signup"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Create a GitHub account
                  </a>
                  , then enter your username so the portal can invite you.
                </p>
                {appRequest.repositoryAccessNote ? (
                  <div
                    className="warning-box"
                    style={{ marginBottom: "0.875rem" }}
                  >
                    {appRequest.repositoryAccessNote}
                  </div>
                ) : null}
                <form
                  action={saveGitHubUsernameAndGrantAccessAction.bind(
                    null,
                    requestId,
                  )}
                  style={{
                    display: "flex",
                    gap: "0.625rem",
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
                    style={{ maxWidth: "240px" }}
                  />
                  <button
                    type="submit"
                    className="btn btn--secondary-solid"
                  >
                    {appRequest.repositoryAccessStatus === "INVITED"
                      ? "Resend Repo Access Invite"
                      : "Grant Repo Access"}
                  </button>
                </form>
              </>
            )}
          </div>
        ) : null}

        {/* Imported repository status section */}
        {isImportedApp
          ? renderImportedRepositoryStatus({
              requestId,
              repositoryImport: appRequest.repositoryImport,
            })
          : null}

        {importedRepositoryRemoteWorkflow ? (
          <div className="card">
            <p className="section-title">Imported Repository Workflow</p>
            <p>
              Your local clone may still have origin pointed at the original
              source repo. Keep that remote intact and add the portal-managed
              repository as the publishing remote.
            </p>
            <ol className="step-list">
              <li>
                Add the portal remote:{" "}
                <code>
                  git remote add portal{" "}
                  {importedRepositoryRemoteWorkflow.portalRepositoryUrl}
                </code>
              </li>
              <li>
                Fetch portal updates: <code>git fetch portal</code>
              </li>
              <li>
                Pull portal changes before publishing work:{" "}
                <code>
                  git pull portal {importedRepositoryRemoteWorkflow.defaultBranch}
                </code>
              </li>
              <li>
                Push completed work to the portal repo:{" "}
                <code>
                  git push portal HEAD:
                  {importedRepositoryRemoteWorkflow.defaultBranch}
                </code>
              </li>
            </ol>
          </div>
        ) : null}

        {/* Codex workflow steps */}
        {!isImportedApp ? (
          <div className="card">
            <p className="section-title">Codex Workflow</p>
            <ol className="step-list">
              <li>Open the managed repo locally in Codex on your machine.</li>
              <li>
                Let Codex clone, customize, commit, and push your changes.
              </li>
              <li>
                Return here when the repo is ready to publish to Azure.
              </li>
              <li>
                Use portal publishing instead of setting up Azure tooling
                locally.
              </li>
            </ol>
          </div>
        ) : null}

        {/* Publish section */}
        <div className="card card--navy-border">
          <p className="section-title">Azure Publishing</p>
          <div className="status-table" style={{ marginBottom: "1rem" }}>
            <div className="status-row">
              <span className="status-row__label">Status</span>
              <span className={`badge badge--${pub.variant}`}>
                {pub.label}
              </span>
            </div>
            {appRequest.azureWebAppName ? (
              <div className="status-row">
                Azure app: {appRequest.azureWebAppName}
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
            {appRequest.publishAttempts[0]?.githubWorkflowRunUrl ? (
              <div className="status-row">
                <a
                  href={
                    appRequest.publishAttempts[0].githubWorkflowRunUrl
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="meta-link"
                >
                  GitHub workflow
                </a>
              </div>
            ) : null}
          </div>

          {appRequest.publishErrorSummary &&
          appRequest.repositoryStatus !== "FAILED" ? (
            <div
              className="warning-box"
              style={{ marginBottom: "0.875rem" }}
            >
              Last publish note: {appRequest.publishErrorSummary}
            </div>
          ) : null}

          {renderPublishingSetupStatus({
            id: appRequest.id,
            publishingSetupStatus: appRequest.publishingSetupStatus,
            publishingSetupErrorSummary: appRequest.publishingSetupErrorSummary,
            publishSetupChecks: appRequest.publishSetupChecks,
          })}

          {renderPublishAction({
            requestId,
            publishStatus: appRequest.publishStatus,
            repositoryStatus: appRequest.repositoryStatus,
            sourceOfTruth: appRequest.sourceOfTruth,
            preparationStatus: appRequest.repositoryImport?.preparationStatus,
            publishingSetupStatus: appRequest.publishingSetupStatus,
          })}
        </div>

      </div>

      <div
        style={{
          marginTop: "1.5rem",
          fontSize: "0.875rem",
          color: "var(--text-secondary)",
        }}
      >
        Need to revisit this later? Go to <Link href="/apps">My Apps</Link>.
      </div>
    </main>
  );
}
