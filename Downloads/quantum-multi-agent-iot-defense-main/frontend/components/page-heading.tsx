import { Activity, Bot, FlaskConical, Network, ShieldAlert, ShieldCheck } from "lucide-react";

const pageIcons = {
  "Virtual Smart Farm Testbed": Network,
  "Cyber Detection": Activity,
  "Incident Investigation": ShieldAlert,
  "Attack & Response": ShieldCheck,
  "Multi-Agent Intelligence": Bot,
  "Research Results": FlaskConical,
} as const;

export function PageHeading({ eyebrow, title, purpose }: { eyebrow: string; title: string; purpose: string }) {
  const Icon = pageIcons[title as keyof typeof pageIcons] ?? Activity;
  return <header className="page-heading"><span>{eyebrow}</span><div className="page-heading-title"><i aria-hidden="true"><Icon /></i><h1>{title}</h1></div><p>{purpose}</p></header>;
}
