"use client";

import React from "react";
import { useState } from "react";

export function CopyCodexHandoffButton({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className={`btn btn--sm ${copied ? "btn--secondary-solid" : "btn--secondary"}`}
      title="Copies a set of instructions you can paste into Codex to tell it about your app and get started customizing"
    >
      {copied ? "✓ Copied!" : "Copy Codex Handoff Prompt"}
    </button>
  );
}
