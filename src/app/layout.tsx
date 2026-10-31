import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CodeInsta",
  description: "Short systems lessons from Claude and GPT.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
