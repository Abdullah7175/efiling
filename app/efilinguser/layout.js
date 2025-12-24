"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Bell, FileText, LogOut, Users } from "lucide-react";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/toaster";

import { useUserContext } from "@/context/UserContext";
import { EfilingUserProvider, useEfilingUser } from "@/context/EfilingUserContext";
import { EfilingRouteGuard } from "@/components/EfilingRouteGuard";
import { EFileSidebar } from "./EFileSidebar.jsx";

export default function EFileLayout({ children }) {
  return (
    <EfilingUserProvider>
      <EfilingRouteGuard>
        <SidebarProvider>
          <EFileLayoutShell>{children}</EFileLayoutShell>
        </SidebarProvider>
      </EfilingRouteGuard>
    </EfilingUserProvider>
  );
}

function EFileLayoutShell({ children }) {
  const router = useRouter();
  const { setUser } = useUserContext();
  const { data: session } = useSession();
  const { profile, loading, error, efilingUserId, isGlobal } = useEfilingUser();

  const [notifications, setNotifications] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  const displayName = profile?.name || session?.user?.name || "User";
  const displayBadge = useMemo(() => {
    if (isGlobal) return "Global Access";
    if (profile?.department_type === "district") return profile?.district_name || "District";
    if (profile?.department_type?.startsWith("division")) return profile?.division_name || "Division";
    return "E-Filing User";
  }, [isGlobal, profile]);

  useEffect(() => {
    if (!efilingUserId && !session?.user?.id) return undefined;

    let active = true;
    let mappedId = efilingUserId || null;
    let intervalId;

    async function fetchNotifications(targetId) {
      try {
        const res = await fetch(`/api/efiling/notifications?user_id=${targetId}`);
        if (!active) return;
        if (res.ok) {
          const data = await res.json();
          setNotifications(data.notifications || []);
        }
      } catch (err) {
        if (active) {
          console.error("Error fetching notifications:", err);
        }
      }
    }

    async function initialise() {
      let targetId = mappedId;
      if (!targetId && session?.user?.id) {
        try {
          const res = await fetch(`/api/efiling/users/profile?userId=${session.user.id}`);
          if (res.ok) {
            const data = await res.json();
            targetId = data?.efiling_user_id || session.user.id;
          } else {
            targetId = session.user.id;
          }
        } catch {
          targetId = session.user.id;
        }
      }

      if (!active || !targetId) return;
      mappedId = targetId;
      await fetchNotifications(targetId);
      intervalId = setInterval(() => fetchNotifications(targetId), 30000);
    }

    initialise();

    return () => {
      active = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [efilingUserId, session?.user?.id]);

  useEffect(() => {
    const onClickOutside = (event) => {
      if (showDropdown && dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [showDropdown]);

  const unreadCount = notifications.filter((n) => !n.is_read && !n.is_dismissed).length;

  const toggleDropdown = async () => {
    const next = !showDropdown;
    setShowDropdown(next);
    if (!next) return;

    const unread = notifications.filter((n) => !n.is_read && !n.is_dismissed);
    if (unread.length === 0) return;

    try {
      await Promise.all(
        unread.map((n) => fetch(`/api/efiling/notifications/${n.id}/read`, { method: "PUT" }))
      );
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (err) {
      console.error("Failed to mark notifications as read:", err);
    }
  };

  const handleNotificationClick = async (notif) => {
    try {
      await fetch(`/api/efiling/notifications/${notif.id}/read`, { method: "PUT" });
    } catch {}
    setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
    if (notif.file_id) {
      router.push(`/efilinguser/files/${notif.file_id}`);
    }
  };

  const handleLogout = async () => {
    await signOut({ redirect: false });
    localStorage.removeItem("jwtToken");
    document.cookie = "jwtToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
    if (setUser) setUser(null);
    router.push("/elogin");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading e-filing workspace...</p>
        </div>
      </div>
    );
  }

  if (error && !profile && !isGlobal) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md p-6 border rounded-lg shadow-lg">
          <h1 className="text-2xl font-bold text-red-600 mb-2">Access Unavailable</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <Button onClick={() => router.push("/elogin")}>Return to login</Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <EFileSidebar />
      <main className="w-full">
        <div className="h-16 border-b w-full bg-blue-900 text-white flex items-center justify-between p-4 shadow-sm">
          <div className="flex gap-4 items-center">
            <SidebarTrigger />
            <div className="flex items-center gap-2">
              <FileText className="w-8 h-8" />
              <div>
                <h1 className="text-2xl font-semibold hidden md:block">KW&SC | E-Filing User Portal</h1>
                <h1 className="text-2xl font-bold block md:hidden">E-File User</h1>
              </div>
            </div>
          </div>
          <div className="flex gap-4 items-center">
            <div className="hidden md:flex gap-2">
              <Button
                onClick={() => router.push("/efilinguser/files/new")}
                variant="secondary"
                size="sm"
                className="bg-blue-800 hover:bg-blue-700"
              >
                <FileText className="w-4 h-4 mr-1" />
                New File
              </Button>
              <Button
                onClick={() => router.push("/efilinguser/files")}
                variant="secondary"
                size="sm"
                className="bg-blue-800 hover:bg-blue-700"
              >
                <Users className="w-4 h-4 mr-1" />
                My Files
              </Button>
            </div>
            <div className="relative" ref={dropdownRef}>
              <button onClick={toggleDropdown} className="relative">
                <Bell className="w-6 h-6" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full px-1">
                    {unreadCount}
                  </span>
                )}
              </button>
              {showDropdown && notifications.length > 0 && (
                <div className="absolute right-0 mt-2 w-80 bg-white border rounded shadow-lg z-50">
                  <div className="p-2 font-semibold border-b text-black">E-Filing Notifications</div>
                  <ul>
                    {notifications.map((n) => (
                      <li
                        key={n.id}
                        className="p-2 hover:bg-gray-100 border-b last:border-b-0 cursor-pointer"
                        onClick={() => handleNotificationClick(n)}
                      >
                        <div className="font-medium text-black">{n.message || "No message"}</div>
                        <div className="text-xs text-gray-400">
                          {n.created_at ? new Date(n.created_at).toLocaleString() : ""}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden md:block text-right">
                <div className="text-sm font-medium">{displayName}</div>
                {/* <div className="text-xs text-blue-200">{displayBadge}</div> */}
              </div>
              <Button onClick={handleLogout} variant="secondary" className="border px-3">
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
        {children}
        <Toaster />
      </main>
    </>
  );
}