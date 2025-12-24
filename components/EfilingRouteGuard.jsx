"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";

import { useToast } from "@/hooks/use-toast";
import { EfilingUserContext } from "@/context/EfilingUserContext";

export function EfilingRouteGuard({ children, allowedRoles = [] }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  const efilingContext = useContext(EfilingUserContext);
  const profileLoading = efilingContext?.loading ?? false;
  const isGlobal = efilingContext?.isGlobal ?? false;
  const efilingUserId = efilingContext?.efilingUserId ?? null;
  const contextRoleNumber = efilingContext?.userRoleNumber;

  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  const roleNumber = useMemo(() => {
    if (typeof contextRoleNumber === "number" && !Number.isNaN(contextRoleNumber)) {
      return contextRoleNumber;
    }
    const raw = session?.user?.role;
    const parsed = typeof raw === "number" ? raw : Number(raw);
    return Number.isNaN(parsed) ? null : parsed;
  }, [contextRoleNumber, session?.user?.role]);

  useEffect(() => {
    if (status === "loading" || profileLoading) {
      setChecking(true);
      return;
    }

    if (!session?.user?.id) {
      router.push("/elogin");
      setChecking(false);
      setAuthorized(false);
      return;
    }

    const normalizedAllowedRoles = allowedRoles ?? [];
    const roleAllowed =
      normalizedAllowedRoles.length === 0 ||
      (roleNumber !== null && normalizedAllowedRoles.includes(roleNumber));

    if (pathname?.startsWith("/efilinguser") && (isGlobal || efilingUserId)) {
      setAuthorized(true);
      setChecking(false);
      return;
    }

    if (isGlobal) {
      setAuthorized(true);
      setChecking(false);
      return;
    }

    if (!roleAllowed) {
      toast({
        title: "Access Denied",
        description: "You don't have permission to access this page.",
        variant: "destructive",
      });
      router.push("/elogin");
      setAuthorized(false);
      setChecking(false);
      return;
    }

    if (normalizedAllowedRoles.length === 0 && !efilingUserId) {
      toast({
        title: "Access Unavailable",
        description: "E-filing profile could not be found for your account.",
        variant: "destructive",
      });
      router.push("/elogin");
      setAuthorized(false);
      setChecking(false);
      return;
    }

    setAuthorized(true);
    setChecking(false);
  }, [
    session?.user?.id,
    roleNumber,
    allowedRoles,
    profileLoading,
    status,
    toast,
    router,
    pathname,
    efilingUserId,
    isGlobal,
  ]);

  if (status === "loading" || profileLoading || checking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Checking permissions...</p>
        </div>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">🚫</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600">You don&apos;t have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return children;
}
