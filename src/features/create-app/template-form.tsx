import React from "react";
import { createAppAction } from "@/app/create/actions";
import type { PortalTemplate } from "@/features/templates/types";
import { TemplateFormFields } from "./template-form-fields";

export function TemplateForm({ template }: { template: PortalTemplate }) {
  return (
    <form action={createAppAction}>
      <input type="hidden" name="templateSlug" value={template.slug} />
      <TemplateFormFields template={template} />
      <button type="submit">Generate App Package</button>
    </form>
  );
}
