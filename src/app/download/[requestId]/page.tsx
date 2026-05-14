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
  "Publishing is unavailable until the publishing setup has been applied to your repository.";
const SETUP_REPAIR_REQUIRED_MESSAGE =
  "Publishing setup needs to be repaired before you can publish.";
const SETUP_READY_REQUIRED_MESSAGE =
  "Publishing setup must be ready before you can publish.";

function isImportedRepositoryPrepared(
  sourceOfTruth: string,
  preparationStatus: string | null | undefined,
) {
  return (
    sourceOfTruth !== "IMPORTED_REPOSITORY" || preparationStatus === "COMMITTED"
  );
}

function needsPublishingSetupRepair(status: string | null | undefined) {
  return status === "NEEDS_REPAIR";
}

function isPublishingSetupBlocking(status: string | null | undefined) {
  return (
    status === "NEEDS_REPAIR" ||
    status === "REPAIRING" ||
    status === "BLOCKED"
  );
}

function canPublishWithSetup(
  sourceOfTruth: string | null | undefined,
  publishingSetupStatus: string | null | undefined,
) {
  const status = publishingSetupStatus ?? "NOT_CHECKED";

  if (sourceOfTruth === "IMPORTED_REPOSITORY") {
    return status === "READY";
  }

  return status === "NOT_CHECKED" || status === "READY";
}

function getPublishingSetupBlockMessage(
  sourceOfTruth: string | null | undefined,
  publishingSetupStatus: string | null | undefined,
) {
  if (isPublishingSetupBlocking(publishingSetupStatus)) {
    return SETUP_REPAIR_REQUIRED_MESSAGE;
  }

  if (!canPublishWithSetup(sourceOfTruth, publishingSetupStatus)) {
    return SETUP_READY_REQUIRED_MESSAGE;
  }

  return null;
}

const CHECK_KEY_LABELS: Record<string, string> = {
  azure_resource_access: "Azure hosting access",
  azure_app_settings: "Azure app configuration",
  entra_redirect_uri: "Login configuration",
  github_federated_credential: "GitHub publish credential",
  github_actions_secrets: "GitHub publish secrets",
  github_workflow_file: "GitHub workflow file",
  github_workflow_dispatch: "GitHub workflow trigger",
};

function formatCheckKey(key: string) {
  return CHECK_KEY_LABELS[key] ?? formatStatus(key);
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
      <p>Status: {formatStatus(status)}</p>
      {request.publishingSetupErrorSummary ? (
        <p className="setup-status__summary">
          {request.publishingSetupErrorSummary}
        </p>
      ) : null}
      {request.publishSetupChecks?.length ? (
        <ul className="setup-status__checks">
          {request.publishSetupChecks.map((check) => (
            <li key={check.checkKey}>
              {formatCheckKey(check.checkKey)}: {formatStatus(check.status)} —{" "}
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
            statusText="Refreshing your Azure hosting, Microsoft login, and GitHub publishing settings."
            variant="primary-solid"
            size="sm"
            title="Attempts to automatically fix the publishing configuration so your app can be deployed to Azure"
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
      <p className="section-title">Publishing Setup Status</p>
      <div className="status-table" style={{ marginBottom: "1rem" }}>
        {repositoryImport.sourceRepositoryUrl ? (
          <p>Original repository: {repositoryImport.sourceRepositoryUrl}</p>
        ) : null}
        {repositoryImport.importStatus ? (
          <p>Copy status: {formatStatus(repositoryImport.importStatus)}</p>
        ) : null}
        {repositoryImport.importErrorSummary ? (
          <p>Copy error: {repositoryImport.importErrorSummary}</p>
        ) : null}
        {repositoryImport.compatibilityStatus ? (
          <p>
            Compatibility: {formatStatus(repositoryImport.compatibilityStatus)}
          </p>
        ) : null}
        {repositoryImport.preparationStatus ? (
          <p>Publishing setup: {formatStatus(repositoryImport.preparationStatus)}</p>
        ) : null}
        {repositoryImport.preparationPullRequestUrl ? (
          <p>
            Review link:{" "}
            <a href={repositoryImport.preparationPullRequestUrl}>
              {repositoryImport.preparationPullRequestUrl}
            </a>
          </p>
        ) : null}
        {repositoryImport.preparationErrorSummary ? (
          <p>Setup error: {repositoryImport.preparationErrorSummary}</p>
        ) : null}
      </div>
      {hasPublishingFileConflict ? (
        <div className="warning-box" style={{ marginBottom: "1rem" }}>
          Your repository already contains publishing configuration files. The
          portal can open a review page on GitHub so you can approve the
          changes, or you can resolve them manually and confirm readiness here.
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
              idleLabel="Apply Publishing Setup"
              pendingLabel="Applying Publishing Setup..."
              statusText="Saving publishing configuration to your repository. This can take a moment."
              variant="primary-solid"
              size="sm"
              title="Saves the publishing configuration files directly to your repository so Azure can deploy your app"
            />
          </form>
          <form action={prepareAction}>
            <input name="preparationMode" type="hidden" value="PULL_REQUEST" />
            <PendingSubmitButton
              idleLabel="Review Publishing Changes"
              pendingLabel="Opening review page..."
              statusText="Opening a review page on GitHub. This can take a moment."
              variant="ghost"
              size="sm"
              title="Opens a page on GitHub where you can review and approve the publishing configuration changes before they're applied"
            />
          </form>
        </div>
      ) : null}
      {hasPublishingFileConflict ? (
        <form action={prepareAction}>
          <input name="preparationMode" type="hidden" value="PULL_REQUEST" />
          <PendingSubmitButton
            idleLabel="Review Publishing Changes"
            pendingLabel="Opening review page..."
            statusText="Opening a review page on GitHub. This can take a moment."
            variant="primary-solid"
            size="sm"
            title="Opens a page on GitHub where you can review and approve the publishing configuration changes before they're applied"
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
            idleLabel="Retry Publishing Setup"
            pendingLabel="Retrying Publishing Setup..."
            statusText="Retrying publishing setup. This can take a moment."
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
                ? "Confirm Repository is Ready"
                : "Confirm Changes Were Merged"
            }
            pendingLabel="Checking..."
            statusText="Checking the repository for required publishing files."
            variant="ghost"
            size="sm"
            title={
              hasPublishingFileConflict
                ? "Check whether the conflicts in your repository have been resolved manually"
                : "Check whether the publishing changes you approved on GitHub have been merged"
            }
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
          idleLabel="Retry Repository Setup"
          pendingLabel="Retrying Repository Setup…"
          statusText="Retrying repository setup. This can take a moment."
          variant="primary"
        />
      </form>
    );
  }

  if (repositoryStatus !== "READY") return null;

  if (!isImportedRepositoryPrepared(sourceOfTruth, preparationStatus)) {
    return <p>{PREPARATION_REQUIRED_MESSAGE}</p>;
  }

  const setupBlockMessage = getPublishingSetupBlockMessage(
    sourceOfTruth,
    publishingSetupStatus,
  );

  if (setupBlockMessage) {
    return (
      <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem" }}>
        {setupBlockMessage}
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
          <p className="section-title">Your Code Repository</p>
          {appRequest.repositoryStatus === "READY" && appRequest.repositoryUrl ? (
            <>
              <div className="status-table" style={{ marginBottom: "1rem" }}>
                <div className="status-row">
                  <span>
                    Repository ready:{" "}
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
              Repository setup failed.
              {appRequest.artifact ? " Your ZIP download is still available." : ""}{" "}
              A portal administrator may need to fix the configuration before publishing can continue.
            </div>
          ) : (
            <div className="info-box">
              Setting up your code repository — check back shortly.
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
            <p className="section-title">Connect Codex to Your Repository</p>
            {appRequest.repositoryAccessStatus === "GRANTED" ? (
              <div className="success-box">
                Repository access granted
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
                  Want Codex to edit your app&rsquo;s code?{" "}
                  <a
                    href="https://github.com/signup"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Create a free GitHub account
                  </a>
                  , then enter your username below. The portal will send you an invite to the repository.
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
                      : "Send Repository Invite"}
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
            <p className="section-title">Syncing Your Local Code</p>
            <p>
              If you have a copy of this code on your computer, it is likely
              still connected to the original source. Keep that connection and
              also add the portal&rsquo;s repository as a second destination
              for publishing. The commands below do this — run them in your
              terminal inside the project folder.
            </p>
            <ol className="step-list">
              <li>
                Connect to the portal repository:{" "}
                <code>
                  git remote add portal{" "}
                  {importedRepositoryRemoteWorkflow.portalRepositoryUrl}
                </code>
              </li>
              <li>
                Download the portal&rsquo;s latest files: <code>git fetch portal</code>
              </li>
              <li>
                Sync portal changes into your local copy:{" "}
                <code>
                  git pull portal {importedRepositoryRemoteWorkflow.defaultBranch}
                </code>
              </li>
              <li>
                Send your completed work to the portal for publishing:{" "}
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
              <li>Open your code repository in Codex on your computer.</li>
              <li>
                Let Codex download the code, make your customizations, and save the changes.
              </li>
              <li>
                Return here when you&rsquo;re ready to publish your app to Azure.
              </li>
              <li>
                Use the Publish button on this page — no extra software needed on your computer.
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
                  title="View the automated process that deployed your app to Azure — useful for troubleshooting if a publish fails"
                >
                  Deployment log
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
