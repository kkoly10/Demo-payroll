import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "B&S Reconciliation Demo",
  description: "Synthetic payroll reconciliation concept for B&S.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
