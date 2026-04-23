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
      <TemplateForm template={template} />
    </main>
  );
}
