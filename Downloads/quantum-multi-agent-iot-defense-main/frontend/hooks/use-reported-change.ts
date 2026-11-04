"use client";

import { useEffect, useRef } from "react";

/** One finite cue for a changed reported value; never a timer-driven activity loop. */
export function useReportedChange<T extends HTMLElement>(value: string | number, active: boolean) {
  const node = useRef<T>(null);
  const previous = useRef(value);
  useEffect(() => {
    const changed = previous.current !== value;
    previous.current = value;
    if (!changed || !active || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const animation = node.current?.animate?.([
      { boxShadow: "inset 0 0 0 2px #91bfb4" },
      { boxShadow: "inset 0 0 0 2px transparent" },
    ], { duration: 650, easing: "ease-out" });
    return () => animation?.cancel();
  }, [value, active]);
  return node;
}
