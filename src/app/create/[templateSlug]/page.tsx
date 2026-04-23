import React from "react";
import { notFound } from "next/navigation";
import { TemplateForm } from "@/features/create-app/template-form";
import { getTemplateBySlug } from "@/features/templates/catalog";

export default async function TemplatePage({
  params,
}: {
  params: Promise<{ templateSlug: string }>;
}) {
  const { templateSlug } = await params;
  const template = getTemplateBySlug(templateSlug);

  if (!template || template.status !== "ACTIVE") {
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
