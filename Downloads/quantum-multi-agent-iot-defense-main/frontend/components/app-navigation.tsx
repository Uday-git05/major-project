"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Bot, FlaskConical, LayoutDashboard, Network, ShieldCheck, ShieldAlert, Sprout } from "lucide-react";
import type { LiveConnectionState } from "@/types/api";

export const navigationItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/iot-testbed", label: "Smart Farm", icon: Network },
  { href: "/detection", label: "AI Detection", icon: Activity },
  { href: "/incidents", label: "Threat Center", icon: ShieldAlert },
  { href: "/attack-response", label: "Defense & Recovery", icon: ShieldCheck },
  { href: "/multi-agent", label: "AI Agents", icon: Bot },
] as const;

export function AppNavigation({ connection }: { connection: LiveConnectionState }) {
  const pathname = usePathname();
  return <aside className="app-sidebar">
    <Link className="sidebar-brand" href="/" aria-label="FarmFlow Dashboard"><Sprout aria-hidden="true" /><b>FarmFlow</b></Link>
    <div className="navigation-label">WORKSPACE</div>
    <nav aria-label="Primary navigation">
      {navigationItems.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const Icon = item.icon;
        return <Link key={item.href} href={item.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}><Icon aria-hidden="true" />{item.label}</Link>;
      })}
    </nav>
    <Link className={`secondary-navigation ${pathname === "/research-results" ? "active" : ""}`} href="/research-results"><FlaskConical aria-hidden="true" />Model Performance</Link>
    <div className="sidebar-connection"><i className={connection} /><span><b>{connection === "live" ? "System Online · Live" : connection === "paused" ? "System Online · Paused" : connection === "offline" ? "System Offline" : connection === "degraded" ? "System Degraded" : "Connecting"}</b><small>Shared runtime</small></span></div>
  </aside>;
}
