import React from "react";
import { notFound } from "next/navigation";
import { TemplateForm } from "@/features/create-app/template-form";
import { getActiveTemplateBySlug } from "@/features/templates/catalog";

export default async function TemplatePage({
  params,
}: {
  params: Promise<{ templateSlug: string }>;
}) {
  const { templateSlug } = await params;
  const template = getActiveTemplateBySlug(templateSlug);

  if (!template) {
    notFound();
  }

  return (
    <main>
      <h1>{template.name}</h1>
      <p>{template.description}</p>
      <p>
        If you do not have a GitHub account yet, you can still generate the app
        now. After creation, the portal will guide you to create a GitHub
        account, save your username, and receive repo access for Codex.
      </p>
      <TemplateForm template={template} />
    </main>
  );
}
