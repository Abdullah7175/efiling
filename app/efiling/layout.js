"use client"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { EFileSidebar } from "./EFileSidebar.jsx";
import { Bell, LogOut, FileText, Users, Settings } from "lucide-react"
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/toaster"
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { signOut } from 'next-auth/react';
import { useUserContext } from "@/context/UserContext";
import { EfilingRouteGuard } from "@/components/EfilingRouteGuard";

export default function EFileLayout({ children }) {
    const [loading, setLoading] = useState(false);
    const [efilingUser, setEfilingUser] = useState(null);
    const { setUser } = useUserContext();
    const [notifications, setNotifications] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef(null);
    const router = useRouter();

    useEffect(() => {
        // Get e-filing user from localStorage
        const userData = localStorage.getItem('users');
        if (userData) {
            try {
                const user = JSON.parse(userData);
                setEfilingUser(user);
            } catch (error) {
                console.error('Error parsing user data:', error);
                localStorage.removeItem('users');
                router.push('/elogin');
            }
        }
    }, [router]);

    useEffect(() => {
        if (!efilingUser?.id) return;
        let mappedEfilingUserId = null;
        const fetchNotifications = async () => {
            try {
                if (!mappedEfilingUserId) {
                    const mapRes = await fetch(`/api/efiling/users/profile?userId=${efilingUser.id}`);
                    if (mapRes.ok) {
                        const map = await mapRes.json();
                        mappedEfilingUserId = map?.efiling_user_id || null;
                    }
                }
                const targetId = mappedEfilingUserId || efilingUser.id;
                const res = await fetch(`/api/efiling/notifications?user_id=${targetId}`);
                if (res.ok) {
                    const data = await res.json();
                    setNotifications(data.notifications || []);
                }
            } catch (e) {
                console.error('Admin notifications fetch error:', e);
            }
        };
        fetchNotifications();
    }, [efilingUser?.id]);

    useEffect(() => {
        const onClickOutside = (e) => {
            if (showDropdown && dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, [showDropdown]);

    const unreadCount = notifications.filter(n => !n.is_read && !n.is_dismissed).length;

    // const handleLogout = () => {
    //     setLoading(true);
    //     try {
    //         localStorage.removeItem('efiling_user');
    //         router.push('/elogin');
    //     } catch (error) {
    //         console.error('Logout error:', error);
    //         setLoading(false);
    //     }
    // };
    const handleLogout = async () => {
        await signOut({ redirect: false });
        localStorage.removeItem('jwtToken');
        document.cookie = "jwtToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
        if (setUser) setUser(null);
        router.push('/elogin');
      };

    const handleNotificationClick = async (notif) => {
        try {
            await fetch(`/api/efiling/notifications/${notif.id}/read`, { method: 'PUT' });
        } catch {}
        setNotifications(notifications.filter(n => n.id !== notif.id));
        if (notif.file_id) {
            router.push(`/efiling/files/${notif.file_id}`);
        }
    };

    return (
        <EfilingRouteGuard allowedRoles={[1]}>
            <SidebarProvider>
                <EFileSidebar />
                <main className="w-full">
                    <div className="h-16 border-b w-full bg-blue-900 text-white flex items-center justify-between p-4 shadow-sm">
                        <div className="flex gap-4 items-center">
                            <SidebarTrigger />
                            <div className="flex items-center gap-2">
                                <FileText className="w-8 h-8" />
                                <div>
                                    <h1 className="text-2xl font-semibold hidden md:block">KW&SC | E-Filing System</h1>
                                    <h1 className="text-2xl font-bold block md:hidden">E-File</h1>
                                    <p className="text-sm text-blue-200 hidden md:block">Works Management Portal</p>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-4 items-center">
                            {/* Quick Actions */}
                            <div className="hidden md:flex gap-2">
                                <Button 
                                    onClick={() => router.push('/efiling/files/new')}
                                    variant="secondary" 
                                    size="sm"
                                    className="bg-blue-800 hover:bg-blue-700"
                                >
                                    <FileText className="w-4 h-4 mr-1" />
                                    New File
                                </Button>
                                <Button 
                                    onClick={() => router.push('/efiling/assignments')}
                                    variant="secondary" 
                                    size="sm"
                                    className="bg-blue-800 hover:bg-blue-700"
                                >
                                    <Users className="w-4 h-4 mr-1" />
                                    Assignments
                                </Button>
                            </div>
                            
                            {/* Notification Bell */}
                            <div className="relative" ref={dropdownRef}>
                                <button onClick={() => setShowDropdown(v => !v)} className="relative">
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
                                            {notifications.map(n => (
                                                <li key={n.id} 
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
                            
                            {/* User Menu */}
                            <div className="flex items-center gap-2">
                                <div className="hidden md:block text-right">
                                    <div className="text-sm font-medium">{efilingUser?.name || 'User'}</div>
                                    <div className="text-xs text-blue-200">
                                        {efilingUser?.userType === 'efiling_admin' ? 'E-Filing Admin' : 'E-Filing User'}
                                    </div>
                                </div>
                                <Button 
                                    onClick={handleLogout} 
                                    variant="secondary" 
                                    className="border px-3"
                                    disabled={loading}
                                >
                                    <LogOut className="w-5 h-5" />
                                </Button>
                            </div>
                        </div>
                    </div>
                    {children}
                    <Toaster />
                </main>
            </SidebarProvider>
        </EfilingRouteGuard>
    );
} 