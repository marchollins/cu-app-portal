"use client";

import React from "react";
import { useFormStatus } from "react-dom";

export function PendingSubmitButton({
  idleLabel,
  pendingLabel,
  statusText,
  variant = "primary-solid",
  size,
  name,
  value,
}: {
  idleLabel: string;
  pendingLabel: string;
  statusText: string;
  variant?:
    | "primary-solid"
    | "secondary-solid"
    | "primary"
    | "secondary"
    | "danger"
    | "ghost";
  size?: "sm" | "lg";
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  const sizeClass = size ? ` btn--${size}` : "";

  return (
    <>
      <button
        type="submit"
        name={name}
        value={value}
        disabled={pending}
        className={`btn btn--${variant}${sizeClass}`}
      >
        {pending ? (
          <>
            <span style={{ display: "inline-block", width: "14px", height: "14px", border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} aria-hidden="true" />
            {pendingLabel}
          </>
        ) : (
          idleLabel
        )}
      </button>
      {pending ? (
        <p className="pending-status" aria-live="polite" role="status">
          {statusText}
        </p>
      ) : null}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
