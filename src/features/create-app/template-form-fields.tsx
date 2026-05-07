import React from "react";
import type { PortalTemplate } from "@/features/templates/types";

export function TemplateFormFields({ template }: { template: PortalTemplate }) {
  return (
    <>
      {template.fields.map((field) => {
        switch (field.type) {
          case "text":
            return (
              <div key={field.name} className="form-group">
                <label className="form-label" htmlFor={field.name}>
                  {field.label}
                </label>
                <input
                  id={field.name}
                  name={field.name}
                  type="text"
                  required={field.required}
                  className="form-control"
                />
              </div>
            );
          case "textarea":
            return (
              <div key={field.name} className="form-group">
                <label className="form-label" htmlFor={field.name}>
                  {field.label}
                </label>
                <textarea
                  id={field.name}
                  name={field.name}
                  required={field.required}
                  className="form-control"
                />
              </div>
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
              <div key={field.name} className="form-group">
                <label className="form-label" htmlFor={field.name}>
                  {field.label}
                </label>
                <select
                  id={field.name}
                  name={field.name}
                  required={field.required}
                  className="form-control"
                >
                  <option value="">Select an option</option>
                  {field.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            );
          default:
            throw new Error("Unsupported template field type.");
        }
      })}
    </>
  );
}
