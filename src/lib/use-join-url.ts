"use client";

import { useEffect, useState } from "react";

/**
 * Client hook that resolves the live deployed origin without leaking a localhost fallback during SSR.
 */
export function useJoinUrl(path = "/play"): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const [joinUrl, setJoinUrl] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setJoinUrl(`${window.location.origin}${normalizedPath}`);
    }
  }, [normalizedPath]);

  return joinUrl;
}
