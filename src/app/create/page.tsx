import React from "react";
import Link from "next/link";
import { LogoutButton } from "@/features/auth/logout-button";
import { getActiveTemplates } from "@/features/templates/catalog";

export default async function CreatePage() {
  const templates = getActiveTemplates();

  return (
    <main>
      <LogoutButton />
      <h1>Create New App</h1>
      <ul>
        {templates.map((template) => (
          <li key={template.id}>
            <h2>{template.name}</h2>
            <p>{template.description}</p>
            <Link href={`/create/${template.slug}`}>
              Use {template.name}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
