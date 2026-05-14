import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { PendingSubmitButton } from "@/features/forms/pending-submit-button";
import { addExistingAppAction } from "@/features/repository-imports/actions";

async function submitExistingAppAction(formData: FormData) {
  "use server";

  const result = await addExistingAppAction(formData);
  redirect(`/download/${result.requestId}`);
}

export default async function AddExistingAppPage() {
  const userId = await getCurrentUserIdOrNull();

  if (!userId) {
    redirect("/");
  }

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
        <span aria-current="page">Add Existing App</span>
      </nav>

      <div className="page-header">
        <h1>Add Existing App</h1>
        <p>
          Connect an existing GitHub repository so the portal can handle Azure
          publishing for it. You&rsquo;ll find the repository URL on GitHub by
          opening the repository and copying the address from your browser.
        </p>
      </div>

      <div className="card" style={{ maxWidth: "640px" }}>
        <form action={submitExistingAppAction} className="form-stack">
          <div className="form-group">
            <label htmlFor="repositoryUrl" className="form-label">
              GitHub Repository URL
            </label>
            <input
              id="repositoryUrl"
              name="repositoryUrl"
              type="url"
              required
              placeholder="https://github.com/owner/repo"
              className="form-control"
            />
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "0.375rem" }}>
              The web address of the repository — looks like <code>https://github.com/your-org/your-repo</code>
            </p>
          </div>

          <div className="form-group">
            <label htmlFor="appName" className="form-label">
              App Name
            </label>
            <input
              id="appName"
              name="appName"
              type="text"
              required
              className="form-control"
            />
          </div>

          <div className="form-group">
            <label htmlFor="description" className="form-label">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={4}
              className="form-control"
            />
          </div>

          <div>
            <PendingSubmitButton
              idleLabel="Check Repository"
              pendingLabel="Checking Repository..."
              statusText="Checking your repository for compatibility and preparing to import. This can take a moment."
              variant="primary-solid"
              title="Checks whether the repository is compatible with Azure publishing and begins setting it up in the portal"
            />
          </div>
        </form>
      </div>
    </main>
  );
}
