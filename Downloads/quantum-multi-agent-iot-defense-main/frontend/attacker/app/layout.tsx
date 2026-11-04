import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "FarmFlow Attack Lab",
  description: "Authorized synthetic attack simulator for the FarmFlow virtual testbed",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
