"use client";

import { useEffect } from "react";

export default function AttackLabRedirect() {
  useEffect(() => {
    window.location.replace(`${window.location.protocol}//${window.location.hostname}:3001/`);
  }, []);
  return <main className="application-page"><p>Opening the separate Attack Lab frontend…</p></main>;
}
