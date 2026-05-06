import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { addExistingAppAction } from "@/features/repository-imports/actions";

type FormAction = (formData: FormData) => void | Promise<void>;

const addExistingAppFormAction = addExistingAppAction as unknown as FormAction;

export default async function AddExistingAppPage() {
  const userId = await getCurrentUserIdOrNull();

  if (!userId) {
    redirect("/");
  }

  return (
    <main>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <Link href="/apps">My Apps</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Add Existing App</span>
      </nav>
      <h1>Add Existing App</h1>
      <form action={addExistingAppFormAction}>
        <label>
          GitHub Repository URL
          <input
            name="repositoryUrl"
            type="url"
            required
            placeholder="https://github.com/owner/repo"
          />
        </label>
        <label>
          App Name
          <input name="appName" type="text" required />
        </label>
        <label>
          Description
          <textarea name="description" rows={4} />
        </label>
        <button type="submit">Analyze Repository</button>
      </form>
    </main>
  );
}
