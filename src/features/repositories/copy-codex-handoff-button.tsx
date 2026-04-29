"use client";

import React from "react";
import { useState } from "react";

export function CopyCodexHandoffButton({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
  }

  return (
    <>
      <button type="button" onClick={() => void handleCopy()}>
        Copy Codex Handoff Prompt
      </button>
      {copied ? <span>Copied.</span> : null}
    </>
  );
}
