import React from "react";
import { createAppAction } from "@/app/create/actions";
import { supportsGeneratedTemplateOneStep } from "@/features/publishing/providers";
import type { PortalTemplate } from "@/features/templates/types";
import { SubmitButton } from "./submit-button";
import { TemplateFormFields } from "./template-form-fields";

export function TemplateForm({ template }: { template: PortalTemplate }) {
  const hostingTargetField = template.fields.find(
    (field) => field.name === "hostingTarget" && field.type === "select",
  );
  const canCreateAndPublish =
    hostingTargetField?.options.some((option) =>
      supportsGeneratedTemplateOneStep(option),
    ) ?? false;

  return (
    <form action={createAppAction} className="form-stack">
      <input type="hidden" name="templateSlug" value={template.slug} />
      <TemplateFormFields template={template} />
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <SubmitButton />
        {canCreateAndPublish ? (
          <SubmitButton
            idleLabel="Create and Publish"
            pendingLabel="Publishing..."
            statusText="Creating your app and starting Azure publishing."
            variant="secondary-solid"
            value="createAndPublish"
          />
        ) : null}
      </div>
    </form>
  );
}
