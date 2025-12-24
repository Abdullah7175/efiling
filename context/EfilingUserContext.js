"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

const GLOBAL_ROLE_CODES = new Set(["CEO", "COO"]);

export const EfilingUserContext = createContext(null);

export function EfilingUserProvider({ children }) {
  const { data: session, status } = useSession();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    async function fetchProfile() {
      if (status === "loading") {
        return;
      }

      if (status !== "authenticated" || !session?.user?.id) {
        if (isMounted) {
          setProfile(null);
          setError(null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/efiling/users/profile?userId=${session.user.id}`, {
          signal: controller.signal,
          cache: "no-store",
        });

        if (!res.ok) {
          const message = res.status === 404 ? "E-filing profile not found" : `Failed to load profile (${res.status})`;
          throw new Error(message);
        }

        const data = await res.json();
        if (!isMounted) return;
        setProfile(data);
        setError(null);
      } catch (err) {
        if (!isMounted) return;
        if (err.name === "AbortError") {
          return;
        }
        console.error("Failed to load e-filing profile:", err);
        setProfile(null);
        setError(err.message || "Unable to load profile");
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchProfile();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [session?.user?.id, status, refreshToken]);

  const refreshProfile = () => setRefreshToken((prev) => prev + 1);

  const value = useMemo(() => {
    const userRoleNumber = Number(profile?.role ?? session?.user?.role ?? 0);
    const roleCode = (profile?.role_code || "").toUpperCase();
    const isAdmin = userRoleNumber === 1;
    const isGlobalRole = GLOBAL_ROLE_CODES.has(roleCode) || roleCode.startsWith("CEO_") || roleCode.startsWith("COO_");
    const isGlobal = isAdmin || isGlobalRole;

    const scope = {
      departmentType: profile?.department_type || null,
      departmentId: profile?.department_id || null,
      departmentName: profile?.department_name || null,
      district: profile?.district_id || profile?.location_district_id
        ? {
            id: profile?.district_id ?? profile?.location_district_id,
            name: profile?.district_name,
          }
        : null,
      town: profile?.town_id || profile?.location_town_id
        ? {
            id: profile?.town_id ?? profile?.location_town_id,
            name: profile?.town_name,
          }
        : null,
      subtown: profile?.subtown_id || profile?.location_subtown_id
        ? {
            id: profile?.subtown_id ?? profile?.location_subtown_id,
            name: profile?.subtown_name,
          }
        : null,
      division: profile?.division_id || profile?.location_division_id
        ? {
            id: profile?.division_id ?? profile?.location_division_id,
            name: profile?.division_name,
            type: profile?.division_type,
          }
        : null,
    };

    const efilingUserId = profile?.efiling_user_id || null;
    const isDistrictScoped = scope.departmentType === "district" && scope.district;
    const isDivisionScoped = scope.departmentType?.startsWith("division") && scope.division;

    return {
      loading,
      error,
      profile,
      refreshProfile,
      efilingUserId,
      isGlobal,
      isAdmin,
      roleCode,
      userRoleNumber,
      scope,
      isDistrictScoped,
      isDivisionScoped,
    };
  }, [loading, error, profile, session?.user?.role]);

  return (
    <EfilingUserContext.Provider value={value}>
      {children}
    </EfilingUserContext.Provider>
  );
}

export function useEfilingUser() {
  const context = useContext(EfilingUserContext);
  if (context === null) {
    throw new Error("useEfilingUser must be used within an EfilingUserProvider");
  }
  return context;
}

