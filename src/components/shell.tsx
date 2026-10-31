"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, House, MessageCircle, Users } from "lucide-react";
import { useEffect } from "react";
import { MotionConfig } from "framer-motion";
import { DataProvider } from "./data";
export function Shell({ children, isOwner }: { children: React.ReactNode; isOwner: boolean }) {
  const path = usePathname();
  useEffect(() => {
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  const publicPage = ["/login", "/join", "/not-invited", "/auth/callback"].includes(path);
  return (
    <MotionConfig reducedMotion="user">
      <DataProvider isOwner={isOwner}>
        <div className={publicPage ? "" : "app-shell"}>
          {children}
          {!publicPage && (
            <nav className="bottom-nav" aria-label="Main navigation">
              {[
                { href: "/", label: "Feed", Icon: House },
                { href: "/explore", label: "Explore", Icon: Compass },
                { href: "/inbox", label: "Inbox", Icon: MessageCircle },
                { href: "/profiles", label: "Profiles", Icon: Users },
              ].filter(({ href }) => href !== "/inbox" || isOwner).map(({ href, label, Icon }) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={
                    path === href ||
                    (href === "/profiles" && path.startsWith("/c/"))
                      ? "page"
                      : undefined
                  }
                >
                  <Icon size={23} />
                  <span>{label}</span>
                </Link>
              ))}
            </nav>
          )}
        </div>
      </DataProvider>
    </MotionConfig>
  );
}
