import { expect, test } from "vitest";

test("test setup loads jest-dom matchers", () => {
  const element = document.createElement("div");
  document.body.append(element);
  expect(element).toBeInTheDocument();
  element.remove();
});
