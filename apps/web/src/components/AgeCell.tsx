"use client";

import { useEffect, useState } from "react";
import { formatAge } from "../lib/board";

/** Ticks every second from the server-rendered starting age. */
export default function AgeCell({ initialAgeSeconds }: { initialAgeSeconds: number }) {
  const [age, setAge] = useState(initialAgeSeconds);
  useEffect(() => {
    const t = setInterval(() => setAge((a) => a + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return <span title="time since created">{formatAge(age)}</span>;
}
