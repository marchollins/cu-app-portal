import React from "react";
import type { PortalTemplate } from "@/features/templates/types";

export function TemplateFormFields({ template }: { template: PortalTemplate }) {
  return (
    <>
      {template.fields.map((field) => {
        if (field.type === "textarea") {
          return (
            <label key={field.name}>
              {field.label}
              <textarea name={field.name} required={field.required} />
            </label>
          );
        }

        if (field.type === "select") {
          return (
            <label key={field.name}>
              {field.label}
              <select name={field.name} required={field.required}>
                <option value="">Select an option</option>
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          );
        }

        return (
          <label key={field.name}>
            {field.label}
            <input name={field.name} type="text" required={field.required} />
          </label>
        );
      })}
    </>
  );
}
