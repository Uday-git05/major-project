export const compactNumber = (value: number) => new Intl.NumberFormat("en", { notation: value >= 1000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
export const formatTime = (value: string | null | undefined) => value ? new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value)) : "--:--:--";
export const formatUtcTime = (value: string | null | undefined) => value ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "UTC" }).format(new Date(value)) : "--:--:--";
export const titleCase = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
export const attackName = (value: string) => ({ Arp_Spoofing: "ARP Spoofing", HTTP_Flood: "HTTP Flood", ICMP_Flood: "ICMP Flood", MQTT_Flood: "MQTT Flood", Port_Scanning: "Port Scanning", TCP_Flood: "TCP Flood", UDP_Flood: "UDP Flood" } as Record<string, string>)[value] ?? titleCase(value);
export const relativeTime = (value: string | null) => {
  if (!value) return "No activity";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
};
export const severityRank: Record<string, number> = { informational: 0, low: 1, medium: 2, high: 3, critical: 4 };
