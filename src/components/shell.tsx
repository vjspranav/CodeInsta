"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Compass, House, MessageCircle, Users } from "lucide-react";
import { useEffect, useRef, type CSSProperties, type MouseEvent } from "react";
import { Startup } from "./startup";
import { MotionConfig } from "framer-motion";
import { DataProvider, useData } from "./data";
function PendingBadge() {
  const { isOwner, pendingRequests } = useData();
  return isOwner && pendingRequests > 0 ? <span className="pending-badge" aria-label={`${pendingRequests} pending topic requests`}>{pendingRequests}</span> : null;
}
export function Shell({ children, isOwner }: { children: React.ReactNode; isOwner: boolean }) {
  const path = usePathname();
  const router = useRouter();
  const pending = useRef<(() => void) | null>(null);
  useEffect(() => {
    pending.current?.();
    pending.current = null;
  }, [path]);
  useEffect(() => () => pending.current?.(), []);
  const navigate = (event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
    if (!link || link.target || link.hasAttribute("download")) return;
    const url = new URL(link.href);
    if (url.origin !== location.origin || url.pathname === path || url.hash) return;
    if (!document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    event.preventDefault();
    pending.current?.();
    const transition = document.startViewTransition(() => new Promise<void>((resolve) => {
      // Resolve after the App Router commits, not immediately after router.push.
      const timeout = setTimeout(resolve, 4000);
      pending.current = () => { clearTimeout(timeout); resolve(); };
      router.push(url.pathname + url.search);
    }));
    void transition.finished.catch(() => {});
  };
  useEffect(() => {
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  const publicPage = ["/login", "/join", "/not-invited", "/auth/callback", "/auth/google", "/auth/google/nonce", "/privacy", "/about"].includes(path);
  const hideNav = publicPage || path === "/onboarding";
  return (
    <MotionConfig reducedMotion="user">
      <DataProvider isOwner={isOwner}>
        <Startup key={publicPage ? "public" : "member"} publicPage={publicPage}>
        <div className={publicPage ? "" : "app-shell"} onClickCapture={navigate}>
          <div key={path} className="route-content">{children}</div>
          {!hideNav && (
            <nav className="bottom-nav" aria-label="Main navigation" style={{ "--active-tab": path === "/" ? 0 : path.startsWith("/explore") ? 1 : path.startsWith("/inbox") ? 2 : 3 } as CSSProperties}>
              <div className="nav-indicator-track" aria-hidden="true"><span className="nav-indicator" /></div>
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
        </Startup>
      </DataProvider>
    </MotionConfig>
  );
}
