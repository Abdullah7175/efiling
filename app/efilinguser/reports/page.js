"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, FileText, Users, Building2, Calendar, TrendingUp, Download } from "lucide-react";
import { logEfilingUserAction, EFILING_ACTIONS } from '@/lib/efilingUserActionLogger';

export default function Reports() {
    const { data: session } = useSession();
    const router = useRouter();
    const [stats, setStats] = useState({
        totalFiles: 0,
        totalUsers: 0,
        totalDepartments: 0,
        pendingFiles: 0
    });

    useEffect(() => {
        if (!session?.user?.id) return;
        fetchStats();
        // Log reports access
        logEfilingUserAction({
            user_id: session.user.id,
            action_type: EFILING_ACTIONS.REPORT_GENERATED,
            description: 'Accessed reports and analytics page',
            entity_type: 'reports',
            entity_name: 'My Reports & Analytics'
        });
    }, [session?.user?.id]);

    const fetchStats = async () => {
        try {
            const filesRes = await fetch('/api/efiling/files');
            const filesData = await filesRes.json();
            const files = Array.isArray(filesData) ? filesData : [];

            const usersRes = await fetch('/api/efiling/users');
            const usersData = await usersRes.json();
            const users = Array.isArray(usersData) ? usersData : [];

            const deptRes = await fetch('/api/efiling/departments');
            const deptData = await deptRes.json();
            const departments = Array.isArray(deptData) ? deptData : [];

            setStats({
                totalFiles: files.length,
                totalUsers: users.length,
                totalDepartments: departments.length,
                pendingFiles: files.filter(f => f.status_name === 'Pending').length
            });
        } catch (error) {
            console.error('Error fetching stats:', error);
        }
    };

    const reportCards = [
        {
            title: "My File Status Report",
            description: "View my file status distribution and trends",
            icon: <FileText className="w-8 h-8 text-blue-600" />,
            href: "/efilinguser/reports/file-status",
            color: "bg-blue-50 border-blue-200"
        }
    ];

    return (
        <div className="container mx-auto px-4 py-6">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900">My Reports & Analytics</h1>
                <p className="text-gray-600">Personal reports and analytics for my e-filing activities</p>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <Card className="bg-blue-50 border-blue-200">
                    <CardContent className="p-6">
                        <div className="flex items-center">
                            <FileText className="w-8 h-8 text-blue-600 mr-3" />
                            <div>
                                <div className="text-2xl font-bold text-blue-900">{stats.totalFiles}</div>
                                <p className="text-sm text-blue-600">My Total Files</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-green-50 border-green-200">
                    <CardContent className="p-6">
                        <div className="flex items-center">
                            <Users className="w-8 h-8 text-green-600 mr-3" />
                            <div>
                                <div className="text-2xl font-bold text-green-900">{stats.totalUsers}</div>
                                <p className="text-sm text-green-600">My Department</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-purple-50 border-purple-200">
                    <CardContent className="p-6">
                        <div className="flex items-center">
                            <Building2 className="w-8 h-8 text-purple-600 mr-3" />
                            <div>
                                <div className="text-2xl font-bold text-purple-900">{stats.totalDepartments}</div>
                                <p className="text-sm text-purple-600">My Role</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-orange-50 border-orange-200">
                    <CardContent className="p-6">
                        <div className="flex items-center">
                            <TrendingUp className="w-8 h-8 text-orange-600 mr-3" />
                            <div>
                                <div className="text-2xl font-bold text-orange-900">{stats.pendingFiles}</div>
                                <p className="text-sm text-orange-600">My Pending Files</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Report Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {reportCards.map((report, index) => (
                    <Card key={index} className={`${report.color} hover:shadow-lg transition-shadow cursor-pointer`}>
                        <CardContent className="p-6">
                            <div className="flex items-start justify-between">
                                <div className="flex items-center">
                                    {report.icon}
                                    <div className="ml-4">
                                        <h3 className="text-lg font-semibold text-gray-900">{report.title}</h3>
                                        <p className="text-sm text-gray-600 mt-1">{report.description}</p>
                                    </div>
                                </div>
                                <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => {
                                        if (session?.user?.id) {
                                            logEfilingUserAction({
                                                user_id: session.user.id,
                                                action_type: EFILING_ACTIONS.REPORT_GENERATED,
                                                description: `Accessed ${report.title}`,
                                                entity_type: 'report',
                                                entity_name: report.title
                                            });
                                        }
                                        router.push(report.href);
                                    }}
                                    className="text-gray-600 hover:text-gray-900"
                                >
                                    <Download className="w-4 h-4" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Quick Actions */}
            <div className="mt-8">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center">
                            <BarChart3 className="w-5 h-5 mr-2" />
                            My Quick Actions
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Button 
                                variant="outline" 
                                className="h-20 flex flex-col items-center justify-center"
                                onClick={() => {
                                    if (session?.user?.id) {
                                        logEfilingUserAction({
                                            user_id: session.user.id,
                                            action_type: EFILING_ACTIONS.REPORT_GENERATED,
                                            description: 'Accessed My File Status report',
                                            entity_type: 'report',
                                            entity_name: 'My File Status Report'
                                        });
                                    }
                                    router.push('/efilinguser/reports/file-status');
                                }}
                            >
                                <FileText className="w-6 h-6 mb-2" />
                                <span>My File Status</span>
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
} 