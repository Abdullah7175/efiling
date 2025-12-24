"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
    FileText, 
    Plus, 
    Clock, 
    CheckCircle, 
    AlertCircle, 
    Users, 
    Building2,
    TrendingUp,
    Calendar,
    ArrowRight,
    Shield,
    Send,
    MapPin,
    Layers,
    BarChart3,
    Activity,
    Target,
    Zap
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Info, X } from "lucide-react";

export default function EFileDashboard() {
    const { data: session } = useSession();
    const router = useRouter();
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [dashboardData, setDashboardData] = useState(null);
    const [createdCount, setCreatedCount] = useState(0);
    const [assignedCount, setAssignedCount] = useState(0);
    const [recentFiles, setRecentFiles] = useState([]);
    const [recentActivity, setRecentActivity] = useState([]);
    const [selectedMetric, setSelectedMetric] = useState(null);
    const [breakdownData, setBreakdownData] = useState(null);

    useEffect(() => {
        if (session?.user?.id) {
            fetchDashboardData();
        }
    }, [session?.user?.id]);
        
        const fetchDashboardData = async () => {
            setLoading(true);
            try {
            // Fetch comprehensive dashboard stats
            const statsResponse = await fetch('/api/efiling/dashboard/stats');
            if (statsResponse.ok) {
                const statsData = await statsResponse.json();
                setDashboardData(statsData.data);
                setBreakdownData(statsData.data?.detailed_breakdowns || null);
            }

            // Fetch recent files
            const filesResponse = await fetch('/api/efiling/files?limit=10');
            if (filesResponse.ok) {
                const files = await filesResponse.json();
                const filesArray = files.files || [];
                // Sort by created_at descending on client side
                filesArray.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                setRecentFiles(filesArray.slice(0, 10));
            }

            // Created vs Assigned counts for current user
            if (session?.user?.id) {
                try {
                    const [createdRes, assignedRes] = await Promise.all([
                        fetch(`/api/efiling/files?created_by=${session.user.id}`),
                        fetch(`/api/efiling/files?assigned_to=${session.user.id}`)
                    ]);
                    const createdData = createdRes.ok ? await createdRes.json() : { files: [] };
                    const assignedData = assignedRes.ok ? await assignedRes.json() : { files: [] };
                    setCreatedCount((createdData.files || []).length);
                    setAssignedCount((assignedData.files || []).length);
                } catch (e) {
                    console.warn('Could not load created/assigned counts');
                }
            }
                
            // Fetch recent activity
            try {
                const actRes = await fetch('/api/efiling/user-actions?limit=10');
                if (actRes.ok) {
                    const actions = await actRes.json();
                    setRecentActivity(actions.data || []);
                }
            } catch (e) {
                console.warn('Could not load recent activity');
            }
            } catch (error) {
                console.error('Error fetching dashboard data:', error);
            toast({
                title: "Error",
                description: "Failed to load dashboard data",
                variant: "destructive",
            });
            } finally {
                setLoading(false);
            }
        };
        
    const getStatusBadge = (status) => {
        const statusConfig = {
            'DRAFT': { variant: 'secondary', icon: FileText },
            'IN_PROGRESS': { variant: 'default', icon: Clock },
            'PENDING_APPROVAL': { variant: 'default', icon: AlertCircle },
            'APPROVED': { variant: 'default', icon: CheckCircle },
            'REJECTED': { variant: 'destructive', icon: AlertCircle },
            'COMPLETED': { variant: 'default', icon: CheckCircle }
        };

        const config = statusConfig[status] || { variant: 'secondary', icon: FileText };
        const IconComponent = config.icon;

        return (
            <Badge variant={config.variant} className="flex items-center gap-1">
                <IconComponent className="w-3 h-3" />
                {status.replace('_', ' ')}
            </Badge>
        );
    };

    const handleCreateFile = () => {
        router.push('/efiling/files/new');
    };

    const handleViewFiles = () => {
        router.push('/efiling/files');
    };

    const handleViewFile = (fileId) => {
        router.push(`/efiling/files/${fileId}`);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-lg">Loading dashboard...</div>
            </div>
        );
    }

    const overall = dashboardData?.overall || {};
    const byDepartment = dashboardData?.by_department || [];
    const byTown = dashboardData?.by_town || [];
    const byDivision = dashboardData?.by_division || [];
    const byDistrict = dashboardData?.by_district || [];
    const byLevel = dashboardData?.by_level || [];
    const byWorkflowState = dashboardData?.by_workflow_state || [];
    const byStatus = dashboardData?.by_status || [];
    const workflowDetails = dashboardData?.workflow_details || [];
    const sla = dashboardData?.sla || {};

    return (
        <div className="container mx-auto px-4 py-6 space-y-6">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-4xl font-bold text-gray-900 mb-2">E-Filing Dashboard</h1>
                <p className="text-xl text-gray-600">Welcome to the Karachi Water and Sewerage Corporation E-Filing System</p>
                {session?.user?.id && (
                    <div className="flex items-center gap-3 mt-3">
                        <Badge variant="outline">Created by you: {createdCount}</Badge>
                        <Badge variant="outline">Assigned to you: {assignedCount}</Badge>
                    </div>
                )}
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={handleCreateFile}>
                    <CardContent className="p-6">
                        <div className="flex items-center space-x-4">
                            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                                <Plus className="w-6 h-6 text-blue-600" />
            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900">Create File Ticket</h3>
                                <p className="text-sm text-gray-600">Start a new e-filing process</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={handleViewFiles}>
                    <CardContent className="p-6">
                        <div className="flex items-center space-x-4">
                            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                                <FileText className="w-6 h-6 text-green-600" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900">View All Files</h3>
                                <p className="text-sm text-gray-600">Browse and manage files</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="hover:shadow-lg transition-shadow">
                    <CardContent className="p-6">
                        <div className="flex items-center space-x-4">
                            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                                <Shield className="w-6 h-6 text-purple-600" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900">E-Signatures</h3>
                                <p className="text-sm text-gray-600">Manage digital signatures</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Overall Statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                <Card>
                    <CardContent className="p-4">
                        <div className="flex flex-col items-center text-center">
                            <FileText className="w-6 h-6 text-blue-600 mb-2" />
                            <p className="text-2xl font-bold">{overall.total_files || 0}</p>
                            <p className="text-xs text-gray-600">Total Files</p>
                            </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex flex-col items-center text-center">
                            <Clock className="w-6 h-6 text-yellow-600 mb-2" />
                            <p className="text-2xl font-bold">{overall.in_progress_files || 0}</p>
                            <p className="text-xs text-gray-600">In Progress</p>
                            </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex flex-col items-center text-center">
                            <AlertCircle className="w-6 h-6 text-orange-600 mb-2" />
                            <p className="text-2xl font-bold">{overall.pending_approval_files || 0}</p>
                            <p className="text-xs text-gray-600">Pending</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex flex-col items-center text-center">
                            <CheckCircle className="w-6 h-6 text-green-600 mb-2" />
                            <p className="text-2xl font-bold">{overall.approved_files || 0}</p>
                            <p className="text-xs text-gray-600">Approved</p>
                            </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex flex-col items-center text-center">
                            <Target className="w-6 h-6 text-red-600 mb-2" />
                            <p className="text-2xl font-bold">{overall.overdue_files || 0}</p>
                            <p className="text-xs text-gray-600">Overdue</p>
                            </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex flex-col items-center text-center">
                            <Activity className="w-6 h-6 text-purple-600 mb-2" />
                            <p className="text-2xl font-bold">{overall.at_risk_files || 0}</p>
                            <p className="text-xs text-gray-600">At Risk</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex flex-col items-center text-center">
                            <Zap className="w-6 h-6 text-indigo-600 mb-2" />
                            <p className="text-2xl font-bold">{overall.completed_files || 0}</p>
                            <p className="text-xs text-gray-600">Completed</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex flex-col items-center text-center">
                            <FileText className="w-6 h-6 text-gray-600 mb-2" />
                            <p className="text-2xl font-bold">{overall.draft_files || 0}</p>
                            <p className="text-xs text-gray-600">Draft</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Detailed Insights Tabs */}
            <Tabs defaultValue="overview" className="space-y-4">
                <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 lg:grid-cols-7">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="location">Location</TabsTrigger>
                    <TabsTrigger value="department">Department</TabsTrigger>
                    <TabsTrigger value="workflow">Workflow</TabsTrigger>
                    <TabsTrigger value="levels">Levels</TabsTrigger>
                    <TabsTrigger value="sla">SLA</TabsTrigger>
                    <TabsTrigger value="recent">Recent</TabsTrigger>
                </TabsList>

                {/* Overview Tab */}
                <TabsContent value="overview" className="space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Workflow State Summary */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center">
                                    <Activity className="w-5 h-5 mr-2" />
                                    Workflow State Distribution
                                </CardTitle>
                                <CardDescription>Files by workflow state</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {workflowDetails.map((item, index) => (
                                        <div key={`${item.workflow_state}-${index}`} className="flex items-center justify-between p-3 border rounded-lg">
                                            <div className="flex items-center space-x-3">
                                                <div className={`w-3 h-3 rounded-full ${
                                                    item.workflow_state === 'TEAM_INTERNAL' ? 'bg-blue-500' :
                                                    item.workflow_state === 'EXTERNAL' ? 'bg-orange-500' :
                                                    'bg-green-500'
                                                }`}></div>
                                                <div>
                                                    <p className="font-medium">{item.workflow_state.replace('_', ' ')}</p>
                                                    <p className="text-xs text-gray-500">
                                                        {item.within_team} within team, {item.external} external
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-2xl font-bold">{item.total}</p>
                                                <p className="text-xs text-gray-500">{item.in_progress} in progress</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Status Distribution */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center">
                                    <BarChart3 className="w-5 h-5 mr-2" />
                                    Status Distribution
                                </CardTitle>
                                <CardDescription>Files by current status</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {byStatus.slice(0, 10).map((item) => (
                                        <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                                            <div className="flex items-center space-x-3">
                                                <div 
                                                    className="w-3 h-3 rounded-full" 
                                                    style={{ backgroundColor: item.color || '#6B7280' }}
                                                ></div>
                                                <p className="font-medium">{item.status_name}</p>
                                            </div>
                                            <p className="text-2xl font-bold">{item.count}</p>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* Location Tab */}
                <TabsContent value="location" className="space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Town-based Files */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center">
                                    <MapPin className="w-5 h-5 mr-2" />
                                    Town-Based Files
                                </CardTitle>
                                <CardDescription>Files organized by town</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3 max-h-96 overflow-y-auto">
                                    {byTown.length > 0 ? (
                                        byTown.map((item) => (
                                            <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                                                <div>
                                                    <p className="font-medium">{item.town_name}</p>
                                                    <p className="text-xs text-gray-500">{item.district_name}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xl font-bold">{item.total}</p>
                                                    <p className="text-xs text-gray-500">{item.in_progress} active</p>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-sm text-gray-500 text-center py-4">No town-based files</p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Division-based Files */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center">
                                    <Layers className="w-5 h-5 mr-2" />
                                    Division-Based Files
                                </CardTitle>
                                <CardDescription>Files organized by division</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3 max-h-96 overflow-y-auto">
                                    {byDivision.length > 0 ? (
                                        byDivision.map((item) => (
                                            <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                                                <div>
                                                    <p className="font-medium">{item.division_name}</p>
                                                    <p className="text-xs text-gray-500">{item.division_code}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xl font-bold">{item.total}</p>
                                                    <p className="text-xs text-gray-500">{item.in_progress} active</p>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-sm text-gray-500 text-center py-4">No division-based files</p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        {/* District-based Files */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center">
                                    <MapPin className="w-5 h-5 mr-2" />
                                    District-Based Files
                                </CardTitle>
                                <CardDescription>Files organized by district</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3 max-h-96 overflow-y-auto">
                                    {byDistrict.length > 0 ? (
                                        byDistrict.map((item) => (
                                            <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                                                <div>
                                                    <p className="font-medium">{item.district_name}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xl font-bold">{item.total}</p>
                                                    <p className="text-xs text-gray-500">{item.in_progress} active</p>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-sm text-gray-500 text-center py-4">No district-based files</p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* Department Tab */}
                <TabsContent value="department" className="space-y-4">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center">
                                <Building2 className="w-5 h-5 mr-2" />
                                Files by Department
                        </CardTitle>
                            <CardDescription>Detailed breakdown by department and type</CardDescription>
                    </CardHeader>
                    <CardContent>
                            <div className="space-y-3 max-h-96 overflow-y-auto">
                                {byDepartment.map((item) => (
                                    <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg">
                                        <div className="flex-1">
                                            <div className="flex items-center space-x-2 mb-2">
                                                <p className="font-medium">{item.name || 'Unassigned'}</p>
                                                <Badge variant="outline" className="text-xs">
                                                    {item.type || 'N/A'}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center space-x-4 text-sm text-gray-600">
                                                <span>{item.in_progress} in progress</span>
                                                <span className="text-red-600">{item.overdue} overdue</span>
                                            </div>
                            </div>
                                        <div className="text-right">
                                            <p className="text-2xl font-bold">{item.total}</p>
                                            <p className="text-xs text-gray-500">total files</p>
                            </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Workflow Tab */}
                <TabsContent value="workflow" className="space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center">
                                    <Activity className="w-5 h-5 mr-2" />
                                    Workflow State Details
                                </CardTitle>
                                <CardDescription>Detailed workflow state breakdown</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {workflowDetails.map((item, index) => (
                                        <div key={`${item.workflow_state}-${index}`} className="p-4 border rounded-lg">
                                            <div className="flex items-center justify-between mb-3">
                                                <h4 className="font-semibold text-lg">{item.workflow_state.replace('_', ' ')}</h4>
                                                <Badge variant="outline">{item.total} files</Badge>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-sm">
                                                <div className="flex justify-between">
                                                    <span className="text-gray-600">In Progress:</span>
                                                    <span className="font-medium">{item.in_progress}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-600">Within Team:</span>
                                                    <span className="font-medium">{item.within_team}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-600">External:</span>
                                                    <span className="font-medium">{item.external}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-600">Returned:</span>
                                                    <span className="font-medium">{item.returned_to_creator}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center">
                            <TrendingUp className="w-5 h-5 mr-2" />
                                    Workflow State Summary
                                </CardTitle>
                                <CardDescription>Quick overview of workflow states</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {byWorkflowState.map((item, index) => (
                                        <div key={`${item.state}-${index}`} className="flex items-center justify-between p-3 border rounded-lg">
                                            <div className="flex items-center space-x-3">
                                                <div className={`w-4 h-4 rounded-full ${
                                                    item.state === 'TEAM_INTERNAL' ? 'bg-blue-500' :
                                                    item.state === 'EXTERNAL' ? 'bg-orange-500' :
                                                    'bg-green-500'
                                                }`}></div>
                                                <p className="font-medium">{item.state.replace('_', ' ')}</p>
                                            </div>
                                            <p className="text-xl font-bold">{item.count}</p>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* Levels Tab */}
                <TabsContent value="levels" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center">
                                <Target className="w-5 h-5 mr-2" />
                                Files by Organizational Level
                        </CardTitle>
                            <CardDescription>Files currently at different approval levels</CardDescription>
                    </CardHeader>
                    <CardContent>
                            <div className="space-y-3">
                                {byLevel.map((item) => (
                                    <div key={item.level} className="flex items-center justify-between p-4 border rounded-lg">
                                        <div>
                                            <p className="font-semibold text-lg">{item.level}</p>
                                            <p className="text-sm text-gray-600">{item.in_progress} files in progress</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-2xl font-bold">{item.total}</p>
                                            <p className="text-xs text-gray-500">total files</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* SLA Tab */}
                <TabsContent value="sla" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm">Files with SLA</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-3xl font-bold">{sla.files_with_sla || 0}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm">SLA Breached</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-3xl font-bold text-red-600">{sla.breached || 0}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm">On Track</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-3xl font-bold text-green-600">{sla.on_track || 0}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm">Paused</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-3xl font-bold text-yellow-600">{sla.paused || 0}</p>
                    </CardContent>
                </Card>
            </div>
                    {sla.avg_hours_remaining > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Average Time Remaining</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-2xl font-bold">
                                    {Math.round(sla.avg_hours_remaining)} hours
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>

                {/* Recent Tab */}
                <TabsContent value="recent" className="space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <span className="flex items-center">
                            <FileText className="w-5 h-5 mr-2" />
                            Recent Files
                        </span>
                        <Button variant="outline" size="sm" onClick={handleViewFiles}>
                            View All
                            <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                                {recentFiles.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                                        <p>No files yet</p>
                        </div>
                    ) : (
                                    <div className="space-y-3">
                            {recentFiles.map((file) => (
                                <div
                                    key={file.id}
                                                className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                                    onClick={() => handleViewFile(file.id)}
                                >
                                                <div className="flex-1">
                                                    <div className="flex items-center space-x-2 mb-1">
                                                        <h4 className="font-medium">{file.file_number}</h4>
                                                        {getStatusBadge(file.status_code)}
                                        </div>
                                                    <p className="text-sm text-gray-600 truncate">{file.subject || 'No subject'}</p>
                                                    <p className="text-xs text-gray-500 mt-1">
                                                        {file.department_name && `Dept: ${file.department_name}`}
                                                        {file.town_name && ` • Town: ${file.town_name}`}
                                                        {file.division_name && ` • Division: ${file.division_name}`}
                                                    </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center">
                                    <TrendingUp className="w-5 h-5 mr-2" />
                                    Recent Activity
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {recentActivity.length === 0 ? (
                                    <div className="text-sm text-gray-500">No recent activity</div>
                                ) : (
                                    <div className="space-y-3">
                                        {recentActivity.map((a) => (
                                            <div key={a.id} className="flex items-center justify-between text-sm p-2 border rounded">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                                    <span className="font-medium">{a.user_name}</span>
                                                    <span className="text-gray-600">{a.action_type.replace('_', ' ')}</span>
                                                    {a.file_id && (
                                                        <span className="text-gray-500">file #{a.file_id}</span>
                                                    )}
                                                </div>
                                                <span className="text-gray-400 text-xs">
                                                    {new Date(a.timestamp || a.created_at).toLocaleString()}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>
            </Tabs>

            {/* Workflow Information */}
            <Card className="mt-8">
                <CardHeader>
                    <CardTitle className="flex items-center">
                        <Send className="w-5 h-5 mr-2" />
                        E-Filing Workflow
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="text-center">
                            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <span className="text-2xl font-bold text-blue-600">1</span>
                            </div>
                            <h4 className="font-medium text-gray-900 mb-2">Create File Ticket</h4>
                            <p className="text-sm text-gray-600">Generate a file number with basic metadata</p>
                        </div>
                        <div className="text-center">
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <span className="text-2xl font-bold text-green-600">2</span>
                            </div>
                            <h4 className="font-medium text-gray-900 mb-2">Edit Document</h4>
                            <p className="text-sm text-gray-600">Use MS Word-like editor to create content</p>
                        </div>
                        <div className="text-center">
                            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <span className="text-2xl font-bold text-yellow-600">3</span>
                            </div>
                            <h4 className="font-medium text-gray-900 mb-2">Mark To Users</h4>
                            <p className="text-sm text-gray-600">Send for approval to senior officials</p>
                        </div>
                        <div className="text-center">
                            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <span className="text-2xl font-bold text-purple-600">4</span>
                            </div>
                            <h4 className="font-medium text-gray-900 mb-2">E-Sign & Approve</h4>
                            <p className="text-sm text-gray-600">Digital signatures and approval workflow</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
} 
