"use client";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

// Define allowed routes for each userType/role
const allowedRoutes = {
  socialmedia: {
    "1": ["/smagent", "/smagent/assigned-requests", "/smagent/videos/add", "/smagent/images/add", "/smagent/before-images", "/smagent/before-images/add"],
    "2": ["/smagent", "/smagent/assigned-requests", "/smagent/videos/add", "/smagent/images/add", "/smagent/before-images", "/smagent/before-images/add"],
    "3": ["/smagent", "/smagent/assigned-requests", "/smagent/videos/add", "/smagent/images/add", "/smagent/before-images", "/smagent/before-images/add"],
    "5": ["/smagent", "/smagent/assigned-requests", "/smagent/videos/add", "/smagent/images/add", "/smagent/before-images", "/smagent/before-images/add"],
    "6": ["/smagent", "/smagent/assigned-requests", "/smagent/videos/add", "/smagent/images/add", "/smagent/before-images", "/smagent/before-images/add"],
    "4": [
      "/smagent",
      "/smagent/assigned-requests",
      "/smagent/final-videos",
      "/smagent/final-videos/add",
      "/smagent/images/download",
      "/smagent/videos/download",
      "/smagent/images/add",
      "/smagent/videos/add",
      "/smagent/before-images",
      "/smagent/before-images/add",
    ],
    "5": [
      "/smagent",
      "/smagent/assigned-requests",
      "/smagent/final-videos",
      "/smagent/final-videos/add",
      "/smagent/images/download",
      "/smagent/videos/download",
      "/smagent/images/add",
      "/smagent/videos/add",
      "/smagent/before-images",
      "/smagent/before-images/add",
    ],
  },
  agent: {
    "1": ["/agent", "/agent/requests", "/agent/requests/new", "/agent/videos", "/agent/images", "/agent/before-images", "/agent/before-images/add"],
    "2": ["/agent", "/agent/requests", "/agent/requests/new", "/agent/videos", "/agent/images", "/agent/before-images","/agent/before-images/add"],
  },
  ceo: {
    "5": ["/ceo", "/ceo/requests", "/ceo/approved", "/ceo/rejected", "/ceo/notifications"],
  },
  coo: {
    "6": ["/coo", "/coo/requests", "/coo/approved", "/coo/rejected", "/coo/notifications"],
  },
};

export default function RouteGuard({ children }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return; // Wait for session to load
    if (!session?.user) {
      router.replace("/login");
      return;
    }
    const { userType, role } = session.user;
    const roleStr = String(role);
    
    console.log('RouteGuard Debug:', {
      pathname,
      userType,
      role,
      roleStr,
      sessionUser: session.user
    });
    
    // smagent
    if (pathname.startsWith("/smagent")) {
      const allowed = allowedRoutes.socialmedia[roleStr] || [];
      // Allow query params for add pages
      const basePath = pathname.split("?")[0];
      
      console.log('RouteGuard SM Agent Check:', {
        basePath,
        allowed,
        allowedRoutes: allowedRoutes.socialmedia,
        roleStr,
        isAllowed: allowed.some((route) => basePath.startsWith(route))
      });
      
      if (!allowed.some((route) => basePath.startsWith(route))) {
        console.log('RouteGuard - Access DENIED, redirecting to unauthorized');
        router.replace("/unauthorized");
        return;
      }
      console.log('RouteGuard - Access GRANTED');
    }
    // agent
    if (pathname.startsWith("/agent")) {
      const allowed = allowedRoutes.agent[roleStr] || [];
      const basePath = pathname.split("?")[0];
      if (!allowed.some((route) => basePath.startsWith(route))) {
        router.replace("/unauthorized");
        return;
      }
    }
    // ceo
    if (pathname.startsWith("/ceo")) {
      const allowed = allowedRoutes.ceo[roleStr] || [];
      const basePath = pathname.split("?")[0];
      if (!allowed.some((route) => basePath.startsWith(route))) {
        router.replace("/unauthorized");
        return;
      }
    }
    // You can add more userType/role checks here if needed
  }, [session, status, pathname, router]);

  return children;
} 