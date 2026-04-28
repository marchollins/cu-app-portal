import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import {
  publishToAzureAction,
  retryPublishAction,
} from "@/features/publishing/actions";
import { prisma } from "@/lib/db";

function renderAction(requestId: string, repositoryStatus: string, publishStatus: string) {
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

export default async function MyAppsPage() {
  const userId = await getCurrentUserIdOrNull();

  if (!userId) {
    redirect("/");
  }

  const appRequests = await prisma.appRequest.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main>
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
              <p>Publish: {request.publishStatus.toLowerCase().replaceAll("_", " ")}</p>
              {request.repositoryUrl ? (
                <p>
                  Repo URL: <a href={request.repositoryUrl}>{request.repositoryUrl}</a>
                </p>
              ) : null}
              {request.publishUrl ? (
                <p>
                  Published URL: <a href={request.publishUrl}>{request.publishUrl}</a>
                </p>
              ) : null}
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
