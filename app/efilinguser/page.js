'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { 
    FileText, 
    Clock, 
    CheckCircle, 
    AlertCircle, 
    User, 
    Calendar,
    ArrowRight,
    Filter,
    Search,
    Plus
} from 'lucide-react';
import { logEfilingUserAction, getUserInfoFromSession, EFILING_ACTIONS } from '@/lib/efilingUserActionLogger';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function EFileUserDashboard() {
    const { data: session } = useSession();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [dataError, setDataError] = useState(false);
    const [userData, setUserData] = useState(null);
    const [assignedFiles, setAssignedFiles] = useState([]);
    const [pendingActions, setPendingActions] = useState([]);
    const [recentActivities, setRecentActivities] = useState([]);
    const [stats, setStats] = useState({
        totalFiles: 0,
        pendingFiles: 0,
        completedFiles: 0,
        overdueFiles: 0
    });
    const [createdCount, setCreatedCount] = useState(0);
    const [assignedCount, setAssignedCount] = useState(0);
    const [nowTick, setNowTick] = useState(Date.now());
    const { toast } = useToast();

    useEffect(() => {
        loadUserData();
    }, []);

    useEffect(() => {
        // Fallback: if session is available but userData not set, derive minimal userData
        if (!userData && session?.user?.id) {
            setUserData({ id: session.user.id, name: session.user.name || 'User' });
        }
    }, [session, userData]);

    useEffect(() => {
        if (userData?.id) {
            loadDashboardData();
            if (session?.user?.id) {
                logEfilingUserAction({
                    user_id: session.user.id,
                    action_type: EFILING_ACTIONS.FILE_VIEWED,
                    description: 'Accessed e-filing user dashboard',
                    entity_type: 'dashboard',
                    entity_name: 'E-Filing User Dashboard'
                });
            }
        }
    }, [userData, session]);

    useEffect(() => {
        const interval = setInterval(() => setNowTick(Date.now()), 30000);
        return () => clearInterval(interval);
    }, []);

    const loadUserData = async () => {
        try {
            const userData = localStorage.getItem('users');
            if (userData) {
                const user = JSON.parse(userData);
                setUserData(user);
            } else {
                // If no local user data, ensure we don't stay stuck in loading
                setLoading(false);
            }
        } catch (error) {
            console.error('Error loading user data:', error);
            setLoading(false);
        }
    };

    const loadDashboardData = async () => {
        try {
            setLoading(true);
            
            if (!userData?.id) {
                setAssignedFiles([]);
                setStats({ totalFiles: 0, pendingFiles: 0, completedFiles: 0, overdueFiles: 0 });
                return;
            }

            // Map users.id to efiling_users.id for accurate filtering
            let efilingUserId = userData.id;
            let userProfile = null;
            try {
                const mapRes = await fetch(`/api/efiling/users/profile?userId=${userData.id}`);
                if (mapRes.ok) {
                    const profile = await mapRes.json();
                    if (profile?.efiling_user_id) efilingUserId = profile.efiling_user_id;
                    userProfile = profile;
                }
            } catch {}
            
            const [myFilesRes, assignedFilesRes] = await Promise.all([
                fetch(`/api/efiling/files?created_by=${efilingUserId}`),
                fetch(`/api/efiling/files?assigned_to=${efilingUserId}`)
            ]);

            const myFiles = myFilesRes.ok ? await myFilesRes.json() : { files: [] };
            const assignedFiles = assignedFilesRes.ok ? await assignedFilesRes.json() : { files: [] };
            
            // Filter files based on user's department and role
            const filteredMyFiles = filterFilesByDepartment(myFiles.files || [], userProfile);
            const filteredAssignedFiles = filterFilesByDepartment(assignedFiles.files || [], userProfile);
            
            setCreatedCount(filteredMyFiles.length);
            setAssignedCount(filteredAssignedFiles.length);
            
            const allFiles = [...filteredMyFiles, ...filteredAssignedFiles];
            const uniqueFiles = allFiles.filter((file, index, self) => index === self.findIndex(f => f.id === file.id));
            setAssignedFiles(uniqueFiles);

            const pending = uniqueFiles.filter(f => f.status_code === 'PENDING' || f.status_code === 'DRAFT').length;
            const completed = uniqueFiles.filter(f => f.status_code === 'COMPLETED' || f.status_code === 'APPROVED').length;
            const overdue = uniqueFiles.filter(f => f.sla_deadline && new Date(f.sla_deadline) < new Date() && f.status_code !== 'COMPLETED').length;
            setStats({ totalFiles: uniqueFiles.length, pendingFiles: pending, completedFiles: completed, overdueFiles: overdue });
        } catch (error) {
            setDataError(true);
            toast({ title: 'Error', description: 'Failed to load dashboard data', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const filterFilesByDepartment = (files, userProfile) => {
        if (!userProfile) return files;
        
        const userRole = userProfile.efiling_role?.code;
        const userDepartment = userProfile.department_id;
        
        // Admin users can see all files
        if (userRole === 'SYS_ADMIN') {
            return files;
        }
        
        // Filter by department_id first (more reliable)
        // If file has department_id, it must match user's department
        // Otherwise, fall back to file_type_code filtering
        return files.filter(file => {
            // If file has department_id, check if it matches user's department
            if (file.department_id) {
                return file.department_id === userDepartment;
            }
            
            // Fallback to file_type_code filtering for files without department_id
            // Water department users can only see water files
            if ([6, 7, 8, 9].includes(userDepartment)) {
                return ['WSP', 'WB_MW', 'PLM', 'EW_WE&M'].includes(file.file_type_code || file.file_type?.code);
            }
            
            // Sewerage department users can only see sewerage files
            if ([10, 19].includes(userDepartment)) {
                return ['SEP'].includes(file.file_type_code || file.file_type?.code);
            }
            
            // For other departments, show all files
            return true;
        });
    };

    const getRoleDisplayName = (roleCode) => {
        const roleMap = {
            'WAT_XEN_MMB': 'XEN MIR BAHAR',
            'WAT_XEN_SHAH': 'XEN SHAHFAISAL',
            'WAT_XEN_KOR': 'XEN KORANGI',
            'WAT_XEN_NAZ': 'XEN NAZIMABAD',
            'WAT_XEN_LIA': 'XEN LIAQATABAD',
            'WAT_XEN_JIN': 'XEN JINNAH',
            'WAT_XEN_NN': 'XEN NORTH NAZIMABAD',
            'WAT_XEN_MAL': 'XEN MALIR',
            'WAT_XEN_CHE': 'XEN CHANESAR',
            'WAT_XEN_GULS': 'XEN GULSHANIQBAL',
            'WAT_XEN_SAD': 'XEN SADDAR',
            'WAT_XEN_MAN': 'XEN MANGOPIR',
            'WAT_XEN_LAN': 'XEN LANDHI',
            'WAT_XEN_MOM': 'XEN MOMINABAD',
            'WAT_XEN_BAL': 'XEN BALDIA',
            'WAT_XEN_NK': 'XEN NEWKARACHI',
            'WAT_XEN_MOD': 'XEN MODEL',
            'WAT_XEN_LIAR': 'XEN LIARI',
            'WAT_XEN_KEA': 'XEN KEAMARI',
            'WAT_XEN_GAD': 'XEN GADAP',
            'WAT_XEN_CLI': 'XEN CLIFTON',
            'WAT_XEN_IH': 'XEN IBRAHIM HYDERI',
            'WAT_XEN_ORA': 'XEN ORANGI',
            'WAT_XEN_SAF': 'XEN SAFOORA',
            'WAT_XEN_SOG': 'XEN SOHRAB GOTH',
            'SEW_XEN_MMB': 'SEW XEN MIR BAHAR',
            'SEW_XEN_SHAH': 'SEW XEN SHAHFAISAL',
            'SEW_XEN_KOR': 'SEW XEN KORANGI',
            'SEW_XEN_NAZ': 'SEW XEN NAZIMABAD',
            'SEW_XEN_LIA': 'SEW XEN LIAQATABAD',
            'SEW_XEN_JIN': 'SEW XEN JINNAH',
            'SEW_XEN_NN': 'SEW XEN NORTH NAZIMABAD',
            'SEW_XEN_MAL': 'SEW XEN MALIR',
            'SEW_XEN_CHE': 'SEW XEN CHANESAR',
            'SEW_XEN_GULS': 'SEW XEN GULSHANIQBAL',
            'SEW_XEN_SAD': 'SEW XEN SADDAR',
            'SEW_XEN_MAN': 'SEW XEN MANGOPIR',
            'SEW_XEN_LAN': 'SEW XEN LANDHI',
            'SEW_XEN_MOM': 'SEW XEN MOMINABAD',
            'SEW_XEN_BAL': 'SEW XEN BALDIA',
            'SEW_XEN_NK': 'SEW XEN NEWKARACHI',
            'SEW_XEN_MOD': 'SEW XEN MODEL',
            'SEW_XEN_LIAR': 'SEW XEN LIARI',
            'SEW_XEN_KEA': 'SEW XEN KEAMARI',
            'SEW_XEN_GAD': 'SEW XEN GADAP',
            'SEW_XEN_CLI': 'SEW XEN CLIFTON',
            'SEW_XEN_IH': 'SEW XEN IBRAHIM HYDERI',
            'SEW_XEN_ORA': 'SEW XEN ORANGI',
            'SEW_XEN_SAF': 'SEW XEN SAFOORA',
            'SEW_XEN_SOG': 'SEW XEN SOHRAB GOTH',
            'SE_CEN': 'SE CENTRAL',
            'SE_EAST': 'SE EAST',
            'SE_WEST': 'SE WEST',
            'SE_SOUTH': 'SE SOUTH',
            'SE_KOR': 'SE KORANGI',
            'SE_MAL': 'SE MALIR',
            'SE_KEA': 'SE KEAMARI',
            'CE_WAT': 'CE WATER',
            'CE_SEW': 'CE SEWERAGE',
            'COO': 'COO',
            'CEO': 'CEO',
            'PC': 'PC',
            'IAO_II': 'IAO II',
            'BUDGET': 'BUDGET',
            'ADLFA': 'ADLFA',
            'FINANCE': 'FINANCE',
            'CON_': 'CONSULTANT'
        };
        
        return roleMap[roleCode] || roleCode;
    };

    const getStatusBadge = (status, slaBreached = false) => {
        if (slaBreached) {
            return <Badge variant="destructive">Overdue</Badge>;
        }
        
        switch (status) {
            case 'DRAFT':
                return <Badge variant="secondary">Draft</Badge>;
            case 'PENDING':
                return <Badge variant="default">Pending</Badge>;
            case 'IN_PROGRESS':
                return <Badge variant="default">In Progress</Badge>;
            case 'COMPLETED':
                return <Badge variant="default">Completed</Badge>;
            case 'RETURNED':
                return <Badge variant="destructive">Returned</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    const getPriorityBadge = (priority) => {
        switch (priority) {
            case 'urgent':
                return <Badge variant="destructive">Urgent</Badge>;
            case 'high':
                return <Badge variant="default">High</Badge>;
            case 'normal':
                return <Badge variant="secondary">Normal</Badge>;
            case 'low':
                return <Badge variant="outline">Low</Badge>;
            default:
                return <Badge variant="outline">Normal</Badge>;
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatTimeRemaining = (deadline) => {
        if (!deadline) return '—';
        const diffMs = new Date(deadline).getTime() - nowTick;
        if (diffMs <= 0) return 'Breached';
        const mins = Math.floor(diffMs / 60000);
        const days = Math.floor(mins / 1440);
        const hours = Math.floor((mins % 1440) / 60);
        const minutes = mins % 60;
        if (days > 0) return `${days}d ${hours}h`;
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    };

    const handleFileAction = (fileId, action) => {
        // Log the file action
        if (session?.user?.id) {
            const actionType = action === 'view' ? EFILING_ACTIONS.FILE_VIEWED : 
                             action === 'edit-document' ? EFILING_ACTIONS.FILE_EDITED :
                             action === 'progress-workflow' ? EFILING_ACTIONS.WORKFLOW_STARTED :
                             EFILING_ACTIONS.FILE_VIEWED;
            
            logEfilingUserAction({
                user_id: session.user.id,
                action_type: actionType,
                description: `Performed ${action} action on file ${fileId}`,
                file_id: fileId,
                details: { action }
            });
        }

        // Navigate to appropriate page based on action
        if (action === 'view') {
            router.push(`/efilinguser/files/${fileId}`);
        } else if (action === 'edit-document') {
            router.push(`/efilinguser/files/${fileId}/edit-document`);
        } else {
            router.push(`/efilinguser/files/${fileId}/${action}`);
        }
    };

    const retryLoadingData = () => {
        setDataError(false);
        loadDashboardData();
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">Welcome back, {userData?.name || 'User'}!</h1>
                    <p className="text-muted-foreground">
                        Here&apos;s your personal e-filing dashboard - your files and assignments
                    </p>
                </div>
                <div className="flex items-center space-x-2">
                    <Button 
                        variant="outline" 
                        onClick={() => router.push('/efilinguser/files/new')}
                        className="bg-blue-600 text-white hover:bg-blue-700"
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        New File
                    </Button>
                    <Button variant="outline" onClick={loadDashboardData}>
                        <Filter className="h-4 w-4 mr-2" />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Quick counts */}
            

            {/* Error Display */}
            {dataError && (
                <Card className="border-red-200 bg-red-50">
                    <CardHeader>
                        <CardTitle className="text-red-800 flex items-center gap-2">
                            <AlertCircle className="h-5 w-5" />
                            Data Loading Error
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-red-700 mb-4">
                            There was an error loading your dashboard data. This might be due to:
                        </p>
                        <ul className="text-red-700 text-sm mb-4 list-disc list-inside">
                            <li>Database connection issues</li>
                            <li>Missing or corrupted data</li>
                            <li>API endpoint problems</li>
                        </ul>
                        <div className="flex gap-2">
                            <Button onClick={retryLoadingData} variant="outline">
                                Retry Loading Data
                            </Button>
                            <Button onClick={() => window.location.reload()} variant="outline">
                                Refresh Page
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Assigned to You</CardTitle>
                        <FileText className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{assignedCount}</div>
                        <p className="text-xs text-muted-foreground">Files you need to process</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pending</CardTitle>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.pendingFiles}</div>
                        <p className="text-xs text-muted-foreground">Awaiting your action</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Overdue</CardTitle>
                        <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.overdueFiles}</div>
                        <p className="text-xs text-muted-foreground">Past SLA</p>
                    </CardContent>
                </Card>
            </div>

            {/* Main Content Tabs */}
            <Tabs defaultValue="assigned" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="assigned">My Files</TabsTrigger>
                    <TabsTrigger value="pending">Pending Actions</TabsTrigger>
                </TabsList>

                <TabsContent value="assigned" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>My Files</CardTitle>
                            <CardDescription>
                                Files I created or that are assigned to me
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {!Array.isArray(assignedFiles) || assignedFiles.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                    <p>No files found.</p>
                                    <p className="text-sm">Create your first file or wait for assignments</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {assignedFiles.map((file) => (
                                        <div key={file.id} className="flex items-center justify-between p-4 border rounded-lg">
                                            <div className="flex-1">
                                                <div className="flex items-center space-x-2 mb-2">
                                                    <h3 className="font-semibold">{file.file_number}</h3>
                                                    {getStatusBadge(file.status_code, file.sla_breached)}
                                                    {getPriorityBadge(file.priority)}
                                                    {file.assigned_to_role_name && (
                                                        <Badge variant="secondary">{getRoleDisplayName(file.assigned_to_role_name)}</Badge>
                                                    )}
                                                </div>
                                                <p className="text-sm text-muted-foreground mb-2">
                                                    {file.subject}
                                                </p>
                                                <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                                                    <span>Department: {file.department_name}</span>
                                                    <span>Category: {file.category_name}</span>
                                                    <span>Created: {formatDate(file.created_at)}</span>
                                                </div>
                                            </div>
                                            <div className="flex space-x-2">
                                                <Button 
                                                    variant="outline" 
                                                    size="sm"
                                                    onClick={() => handleFileAction(file.id, 'view')}
                                                >
                                                    View
                                                </Button>
                                                {file.status_code === 'PENDING' && (
                                                    <Button 
                                                        size="sm"
                                                        onClick={() => handleFileAction(file.id, 'edit-document')}
                                                    >
                                                        Take Action
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="pending" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Pending Workflow Actions</CardTitle>
                            <CardDescription>
                                Workflow stages waiting for your approval or action
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {!Array.isArray(pendingActions) || pendingActions.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                    <p>No pending workflow actions.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {pendingActions.map((workflow) => (
                                        <div key={workflow.id} className="flex items-center justify-between p-4 border rounded-lg">
                                            <div className="flex-1">
                                                <div className="flex items-center space-x-2 mb-2">
                                                    <h3 className="font-semibold">{workflow.file_number}</h3>
                                                    <Badge variant="default">Stage: {workflow.current_stage_name}</Badge>
                                                </div>
                                                <p className="text-sm text-muted-foreground mb-2">
                                                    {workflow.subject}
                                                </p>
                                                <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                                                    <span>Template: {workflow.template_name}</span>
                                                    <span>Started: {formatDate(workflow.started_at)}</span>
                                                    {workflow.sla_deadline && (
                                                        <span className={workflow.sla_breached ? 'text-red-500' : ''}>
                                                            SLA: {formatTimeRemaining(workflow.sla_deadline)}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex space-x-2">
                                                <Button 
                                                    variant="outline" 
                                                    size="sm"
                                                    onClick={() => handleFileAction(workflow.file_id, 'view')}
                                                >
                                                    View
                                                </Button>
                                                <Button 
                                                    size="sm"
                                                    onClick={() => handleFileAction(workflow.file_id, 'progress-workflow')}
                                                >
                                                    Process
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Remove activities tab */}
            </Tabs>
        </div>
    );
}
