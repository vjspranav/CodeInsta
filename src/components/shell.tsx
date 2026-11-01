"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, House, MessageCircle, Users } from "lucide-react";
import { useEffect } from "react";
import { MotionConfig } from "framer-motion";
import { DataProvider, useData } from "./data";
function PendingBadge() {
  const { isOwner, pendingRequests } = useData();
  return isOwner && pendingRequests > 0 ? <span className="pending-badge" aria-label={`${pendingRequests} pending topic requests`}>{pendingRequests}</span> : null;
}
export function Shell({ children, isOwner }: { children: React.ReactNode; isOwner: boolean }) {
  const path = usePathname();
  useEffect(() => {
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  const publicPage = ["/login", "/join", "/not-invited", "/auth/callback", "/auth/google", "/auth/google/nonce", "/privacy", "/about"].includes(path);
  const hideNav = publicPage || path === "/onboarding";
  return (
    <MotionConfig reducedMotion="user">
      <DataProvider isOwner={isOwner}>
        <div className={publicPage ? "" : "app-shell"}>
          {children}
          {!hideNav && (
            <nav className="bottom-nav" aria-label="Main navigation">
              {[
                { href: "/", label: "Feed", Icon: House },
                { href: "/explore", label: "Explore", Icon: Compass },
                { href: "/inbox", label: "Inbox", Icon: MessageCircle },
                { href: "/profiles", label: "Profiles", Icon: Users },
              ].map(({ href, label, Icon }) => (
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
                  <Icon size={24} strokeWidth={1.75} />
                  <span>{label}</span>
                  {href === "/profiles" && <PendingBadge />}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </DataProvider>
    </MotionConfig>
  );
}
