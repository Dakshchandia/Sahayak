import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SAHAYAK | Personnel Welfare",
  description:
    "Confidential personnel support, explainable welfare indicators and responsible workload planning.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
