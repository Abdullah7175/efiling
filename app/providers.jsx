// app/providers.jsx
"use client";

import { SessionProvider } from "next-auth/react";
import { ToastProvider } from "@/components/ui/toast";
import { UserProvider } from "@/context/UserContext";

export function Providers({ children }) {
  return (
    <SessionProvider>
      <UserProvider>
        <ToastProvider>
          {children}
        </ToastProvider>
      </UserProvider>
    </SessionProvider>
  );
}