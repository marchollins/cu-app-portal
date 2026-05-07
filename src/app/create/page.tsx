import React from "react";
import Link from "next/link";
import { getActiveTemplates } from "@/features/templates/catalog";

export default async function CreatePage() {
  const templates = getActiveTemplates();

  return (
    <main>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/">Home</Link>
        <span className="breadcrumb__sep" aria-hidden="true">/</span>
        <span aria-current="page">Create New App</span>
      </nav>

      <div className="page-header">
        <h1>Create New App</h1>
        <p>Choose a template to generate your Cedarville-approved app package.</p>
      </div>

      <div className="grid grid--2">
        {templates.map((template) => (
          <div key={template.id} className="card card--interactive card--navy-border">
            <div className="card__title">{template.name}</div>
            <p className="card__desc">{template.description}</p>
            <Link href={`/create/${template.slug}`} className="btn btn--primary-solid btn--sm">
              Use {template.name}
            </Link>
          </div>
        ))}
      </div>
    </main>
  );
}
