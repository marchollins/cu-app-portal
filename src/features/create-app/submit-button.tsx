import React from "react";
import { PendingSubmitButton } from "@/features/forms/pending-submit-button";

export function SubmitButton() {
  return (
    <PendingSubmitButton
      idleLabel="Generate App Package"
      pendingLabel="Generating..."
      statusText="Generating your app package. This can take a moment."
    />
  );
}
