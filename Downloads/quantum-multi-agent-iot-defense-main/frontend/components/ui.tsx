import type { ReactNode } from "react";
import { Inbox, LoaderCircle } from "lucide-react";

export function Panel({ title, kicker, action, className = "", children }: { title: string; kicker?: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return <section className={`panel ${className}`}><header className="panel-header"><div><h2>{title}</h2>{kicker && <p className="panel-description">{kicker}</p>}</div>{action}</header><div className="panel-body">{children}</div></section>;
}
export function Badge({ value, tone }: { value: string; tone?: string }) { return <span className={`badge ${tone ?? value.toLowerCase()}`}><i />{value.replaceAll("_", " ")}</span>; }
export function Empty({ children }: { children: ReactNode }) { return <div className="empty-state"><Inbox size={22} aria-hidden="true" /><span>{children}</span></div>; }
export function LoadingScreen() { return <main className="state-screen"><LoaderCircle className="spin" size={28} /><p>Establishing secure telemetry channel</p><span>Connecting to FarmFlow control plane</span></main>; }
export function ErrorScreen({ message, retry }: { message: string; retry: () => void }) { return <main className="state-screen error-screen"><span className="eyebrow">CONNECTION FAULT</span><h1>Backend unavailable</h1><p>{message}</p><button className="button primary" onClick={retry}>Retry connection</button></main>; }
