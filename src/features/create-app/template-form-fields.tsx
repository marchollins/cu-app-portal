import React from "react";
import type { PortalTemplate } from "@/features/templates/types";

export function TemplateFormFields({ template }: { template: PortalTemplate }) {
  return (
    <>
      {template.fields.map((field) => {
        switch (field.type) {
          case "text":
            return (
              <label key={field.name}>
                {field.label}
                <input name={field.name} type="text" required={field.required} />
              </label>
            );
          case "textarea":
            return (
              <label key={field.name}>
                {field.label}
                <textarea name={field.name} required={field.required} />
              </label>
            );
          case "select":
            if (field.options.length === 1) {
              return (
                <input
                  key={field.name}
                  name={field.name}
                  type="hidden"
                  value={field.options[0]}
                />
              );
            }

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
          default:
            throw new Error("Unsupported template field type.");
        }
      })}
    </>
  );
}
