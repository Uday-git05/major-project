import type { Metadata } from "next";
import "@/styles/globals.css";
import { LiveRuntimeProvider } from "@/components/live-runtime-provider";

export const metadata: Metadata = { title: "FarmFlow Security Operations", description: "Live virtual IoT cyber-defense command center" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><LiveRuntimeProvider>{children}</LiveRuntimeProvider></body></html>; }
