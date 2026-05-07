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
          Import an existing GitHub repository so the portal can manage Azure
          publishing for it.
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
              idleLabel="Analyze Repository"
              pendingLabel="Analyzing Repository..."
              statusText="Analyzing repository and preparing import. This can take a moment."
              variant="primary-solid"
            />
          </div>
        </form>
      </div>
    </main>
  );
}
