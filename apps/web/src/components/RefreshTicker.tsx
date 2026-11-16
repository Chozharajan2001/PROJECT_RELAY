"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-fetches the board on an interval so engine-side changes (assignment,
 * suspect flags) appear without a manual refresh (Q2). Interval is a data
 * attribute for assertability; the demo default is 4s.
 */
export default function RefreshTicker({ intervalMs = 4000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [router, intervalMs]);
  return <span data-refresh-interval-ms={intervalMs} hidden />;
}
