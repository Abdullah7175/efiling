import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { 
    Home, 
    FileText, 
    FolderOpen, 
    Users, 
    Settings, 
    ChevronLeft, 
    ChevronRight,
    Archive,
    Clock,
    CheckCircle,
    AlertCircle,
    BarChart3,
    Building2,
    UserCheck,
    Wrench,
    FileEdit,
    Search,
    Calendar,
    BookOpen,
    Shield,
    Bell,
    LogOut,
    Plus
} from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import React from "react";

const links = [
    {
        href: "/efilinguser",
        label: "Dashboard",
        icon: <Home className="w-5 h-5 mr-2" />,
    },
    {
        href: "/efilinguser/files",
        label: "My Files",
        icon: <FileText className="w-5 h-5 mr-2" />,
        subItems: [
            { href: "/efilinguser/files", label: "All My Files", icon: <FileText className="w-4 h-4" /> },
            { href: "/efilinguser/files/new", label: "Create New File", icon: <Plus className="w-4 h-4" /> },
        ]
    },
    {
        href: "/efilinguser/notifications",
        label: "Notifications",
        icon: <Bell className="w-5 h-5 mr-2" />,
    },
    {
        href: "/efilinguser/reports",
        label: "My Reports",
        icon: <BarChart3 className="w-5 h-5 mr-2" />,
        subItems: [
            { href: "/efilinguser/reports/file-status", label: "My File Status", icon: <BarChart3 className="w-4 h-4" /> },
        ]
    },
    {
        href: "/efilinguser/settings/profile",
        label: "My Profile",
        icon: <UserCheck className="w-5 h-5 mr-2" />,
    },
    {
        href: "/efilinguser/templates",
        label: "My Templates",
        icon: <FileText className="w-5 h-5 mr-2" />,
    },
    {
        href: "/efilinguser/daak",
        label: "E-Posted (Daak)",
        icon: <FileText className="w-5 h-5 mr-2" />,
        subItems: [
            { href: "/efilinguser/daak", label: "Received Daak", icon: <FileText className="w-4 h-4" /> },
            { href: "/efilinguser/daak/new", label: "Create Daak", icon: <Plus className="w-4 h-4" /> },
        ]
    },
    {
        href: "/efilinguser/meetings",
        label: "Meetings",
        icon: <Calendar className="w-5 h-5 mr-2" />,
        subItems: [
            { href: "/efilinguser/meetings", label: "My Meetings", icon: <Calendar className="w-4 h-4" /> },
            { href: "/efilinguser/meetings/new", label: "Create Meeting", icon: <Plus className="w-4 h-4" /> },
        ]
    },
];

export function EFileSidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const { state, toggleSidebar } = useSidebar();
    const collapsed = state === "collapsed";
    const [expandedItems, setExpandedItems] = React.useState(new Set());

    const toggleExpanded = (href) => {
        const newExpanded = new Set(expandedItems);
        if (newExpanded.has(href)) {
            newExpanded.delete(href);
        } else {
            newExpanded.add(href);
        }
        setExpandedItems(newExpanded);
    };

    const isActive = (href) => {
        return pathname.startsWith(href);
    };

    const isExpanded = (href) => {
        return expandedItems.has(href);
    };

    const handleLogout = async () => {
        try {
            // Call logout API
            await fetch('/api/users/logout', { method: 'GET' });
            
            // Clear any local storage or session data
            localStorage.removeItem('user');
            sessionStorage.clear();
            
            // Redirect to main page
            router.push('/');
        } catch (error) {
            console.error('Logout error:', error);
            // Still redirect even if logout API fails
            router.push('/');
        }
    };

    return (
        <aside className={`min-h-screen h-full ${collapsed ? "w-16" : "w-64"} bg-blue-900 text-white flex flex-col shadow-lg border-r border-blue-800 transition-all duration-200`}>
            <div className="flex items-center justify-center h-16 border-b border-blue-800">
                <span className={`text-xl font-bold tracking-wide transition-opacity duration-200 ${collapsed ? "opacity-0 w-0" : "opacity-100 w-auto"}`}>
                    KWSC
                </span>
            </div>
            
            <nav className="flex-1 py-6 px-2 space-y-1 overflow-y-auto">
                {links.map((link) => {
                    const active = isActive(link.href);
                    const expanded = isExpanded(link.href);
                    const hasSubItems = link.subItems && link.subItems.length > 0;
                    
                    return (
                        <div key={link.href}>
                            <Link
                                href={link.href}
                                className={`flex items-center px-4 py-2 rounded-lg transition-colors font-medium text-base hover:bg-blue-800 hover:text-blue-200 ${
                                    active ? "bg-blue-800 text-blue-200" : "text-white"
                                }`}
                                onClick={hasSubItems ? (e) => { e.preventDefault(); toggleExpanded(link.href); } : undefined}
                            >
                                {React.cloneElement(link.icon, { 
                                    className: collapsed ? "w-10 h-8 mr-0" : "w-8 h-8 mr-2" 
                                })}
                                <span className={`transition-opacity duration-200 ${collapsed ? "opacity-0 w-0" : "opacity-100 w-auto ml-2"}`}>
                                    {link.label}
                                </span>
                                {hasSubItems && !collapsed && (
                                    <ChevronRight 
                                        className={`ml-auto w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
                                    />
                                )}
                            </Link>
                            
                            {/* Sub-items */}
                            {hasSubItems && expanded && !collapsed && (
                                <div className="ml-4 mt-1 space-y-1">
                                    {link.subItems.map((subItem) => {
                                        const subActive = isActive(subItem.href);
                                        return (
                                            <Link
                                                key={subItem.href}
                                                href={subItem.href}
                                                className={`flex items-center px-4 py-2 rounded-lg transition-colors text-sm hover:bg-blue-700 hover:text-blue-100 ${
                                                    subActive ? "bg-blue-700 text-blue-100" : "text-blue-200"
                                                }`}
                                            >
                                                {React.cloneElement(subItem.icon, { className: "w-4 h-4 mr-2" })}
                                                <span>{subItem.label}</span>
                                            </Link>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </nav>
            
            <div className="mt-auto p-2 border-t border-blue-800">
                {/* <Button 
                    variant="ghost" 
                    onClick={handleLogout}
                    className="w-full text-blue-300 hover:text-white hover:bg-blue-800 mb-2"
                >
                    <LogOut className="w-4 h-4 mr-2" />
                    {!collapsed && <span>Logout</span>}
                </Button> */}
                <Button variant="ghost" size="icon" onClick={toggleSidebar} className="text-blue-300 hover:text-white w-full">
                    {collapsed ? <ChevronRight /> : <ChevronLeft />}
                </Button>
            </div>
        </aside>
    );
} 