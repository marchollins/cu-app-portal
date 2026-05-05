"use client";

import React from "react";
import { useFormStatus } from "react-dom";

export function PendingSubmitButton({
  idleLabel,
  pendingLabel,
  statusText,
}: {
  idleLabel: string;
  pendingLabel: string;
  statusText: string;
}) {
  const { pending } = useFormStatus();

  return (
    <>
      <button type="submit" disabled={pending}>
        {pending ? pendingLabel : idleLabel}
      </button>
      {pending ? (
        <p aria-live="polite" role="status">
          {statusText}
        </p>
      ) : null}
    </>
  );
}
