"use client";

import { useEffect } from "react";
import { applyDlsTokens } from "@drkyana/types";

/**
 * Sources globals.css's @theme brand/accent/neutral colors from the DLS at
 * runtime instead of leaving them as hand-typed hex — see the comment in
 * globals.css's @theme block.
 */
export default function ApplyDlsTokens() {
  useEffect(() => {
    applyDlsTokens();
  }, []);
  return null;
}
