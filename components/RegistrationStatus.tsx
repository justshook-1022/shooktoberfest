"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const RegistrationContext = createContext(false);

export function RegistrationStatusProvider({ initialOpen, children }: { initialOpen: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(initialOpen);
  useEffect(() => {
    let disposed = false;
    let pending = false;
    const refresh = async () => {
      if (document.hidden || pending) return;
      pending = true;
      try {
        const response = await fetch("/api/registration-status", { cache: "no-store", signal: AbortSignal.timeout(10000) });
        const result = response.ok ? await response.json() : null;
        if (!disposed) setOpen(result?.open === true);
      } catch {
        if (!disposed) setOpen(false);
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return <RegistrationContext.Provider value={open}>{children}</RegistrationContext.Provider>;
}

export function RegistrationLink({ className, onClick }: { className?: string; onClick?: () => void }) {
  const open = useContext(RegistrationContext);
  return open
    ? <Link className={className} href="/register" onClick={onClick}>Sign Up</Link>
    : <span className={className} aria-disabled="true">Registration closed</span>;
}
