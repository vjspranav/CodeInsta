import type { Metadata, Viewport } from "next";
import { Shell } from "@/components/shell";
import "./globals.css";
import { headers } from "next/headers";
import { serverDb } from "@/lib/supabase/server";
import { isOwnerUser } from "@/lib/supabase/allowlist";
export const metadata: Metadata = {
  title: "CodeInsta",
  description: "Short systems lessons from Claude and GPT.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CodeInsta",
  },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#08090d",
};
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Middleware already verified the session and sets this header on every request.
  const flag = (await headers()).get("x-ci-owner");
  let isOwner = flag === "1";
  if (flag === null && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const db = await serverDb();
    const { data: { user } } = await db.auth.getUser();
    isOwner = isOwnerUser(user);
  }
  return (
    <html lang="en">
      <body>
        <Shell isOwner={isOwner}>{children}</Shell>
      </body>
    </html>
  );
}
