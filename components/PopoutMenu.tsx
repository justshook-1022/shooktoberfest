"use client";

import { RegistrationLink } from "./RegistrationStatus";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { getBrowserClient } from "../lib/supabase/client";

const emptySubscribe = () => () => undefined;

const menuLinks = [
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "Tee Times", href: "/tee-times" },
  { label: "Hall of Fame", href: "/hall-of-fame" },
  { label: "Past events", href: "/photos" },
];

export default function PopoutMenu({ activePath }: { activePath?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const isHydrated = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const pathname = usePathname();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const supabase = getBrowserClient();
    if (!supabase) return;

    void supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user)));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session?.user)));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [isOpen]);

  const currentPath = activePath || pathname;

  return (
    <>
      <button
        ref={triggerRef}
        className={`menu-trigger ${isOpen ? "is-open" : ""}`}
        type="button"
        aria-label={isOpen ? "Close menu" : "Open menu"}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls="site-menu"
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="menu-trigger-icon" aria-hidden="true"><i /><i /><i /></span>
      </button>

      {isHydrated ? createPortal(
        <div className={`menu-popout ${isOpen ? "is-open" : ""}`} aria-hidden={!isOpen}>
          <button className="menu-backdrop" type="button" aria-label="Close menu" tabIndex={isOpen ? 0 : -1} onClick={() => setIsOpen(false)} />

          <section ref={panelRef} id="site-menu" className="menu-panel" role="dialog" aria-modal="true" aria-label="Site menu">
            <div className="menu-panel-top">
              <button ref={closeButtonRef} className="menu-trigger menu-trigger-close is-open" type="button" aria-label="Close menu" onClick={() => setIsOpen(false)}>
                <span className="menu-trigger-icon" aria-hidden="true"><i /><i /><i /></span>
              </button>
              <Link className="menu-brand" href="/" onClick={() => setIsOpen(false)}>Shooktoberfest</Link>
              <span className="menu-panel-spacer" aria-hidden="true" />
            </div>

            <nav className="menu-links" aria-label="Menu navigation">
              {menuLinks.map((link) => {
                const isActive = currentPath === link.href;
                return (
                  <Link key={link.href} className={isActive ? "active" : ""} href={link.href} aria-current={isActive ? "page" : undefined} onClick={() => setIsOpen(false)}>
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            <div className="menu-account">
              <p>{signedIn ? "Your tournament hub" : "Ready for Shooktoberfest?"}</p>
              {signedIn ? (
                <Link className="menu-account-primary" href="/me" onClick={() => setIsOpen(false)}>My profile</Link>
              ) : (
                <div className="menu-account-actions">
                  <RegistrationLink className="menu-account-primary" onClick={() => setIsOpen(false)} />
                  <Link className="menu-account-secondary" href="/login?next=/me" onClick={() => setIsOpen(false)}>Log in</Link>
                </div>
              )}
            </div>
          </section>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
