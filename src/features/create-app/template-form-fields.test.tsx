import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TemplateFormFields } from "./template-form-fields";

describe("TemplateFormFields", () => {
  it("fails fast for unsupported field types", () => {
    expect(() =>
      render(
        <TemplateFormFields
          template={
            {
              id: "invalid",
              slug: "invalid",
              name: "Invalid",
              description: "Invalid",
              version: "1.0.0",
              status: "ACTIVE",
              fields: [
                {
                  name: "mystery",
                  label: "Mystery",
                  type: "checkbox",
                  required: true,
                },
              ],
            } as never
          }
        />,
      ),
    ).toThrow(/unsupported template field type/i);
  });
});
