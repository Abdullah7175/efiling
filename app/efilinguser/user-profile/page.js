"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { logEfilingUserAction, EFILING_ACTIONS } from '@/lib/efilingUserActionLogger';
import { 
    User, 
    Shield, 
    Settings, 
    Activity, 
    FileText, 
    Clock, 
    Building2, 
    Edit,
    Save,
    Loader2,
    Calendar,
    Mail,
    Phone,
    MapPin,
    Award,
    CheckCircle,
    AlertCircle
} from "lucide-react";

export default function UserProfile() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const { toast } = useToast();
    
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [userProfile, setUserProfile] = useState(null);
    const [departments, setDepartments] = useState([]);
    const [roles, setRoles] = useState([]);
    const [recentActivities, setRecentActivities] = useState([]);
    const [activeTab, setActiveTab] = useState("profile");

    useEffect(() => {
        if (status === "loading") return;
        
        if (!session) {
            router.push("/login");
            return;
        }

        loadUserProfile();
        loadDependencies();
        
        // Log profile access
        if (session?.user?.id) {
            logEfilingUserAction({
                user_id: session.user.id,
                action_type: EFILING_ACTIONS.PROFILE_UPDATED,
                description: 'Accessed My Profile page',
                entity_type: 'profile',
                entity_name: 'My Profile'
            });
        }
    }, [session, status, router]);

    const loadUserProfile = async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/efiling/users/${session.user.id}`);
            if (response.ok) {
                const data = await response.json();
                setUserProfile(data);
            } else {
                throw new Error('Failed to load user profile');
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to load user profile. Please try again.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const loadDependencies = async () => {
        try {
            const [deptRes, rolesRes, activitiesRes] = await Promise.all([
                fetch('/api/efiling/departments?is_active=true'),
                fetch('/api/efiling/roles?is_active=true'),
                fetch(`/api/efiling/user-actions?user_id=${session?.user?.id}&limit=10`)
            ]);

            if (deptRes.ok) {
                const deptData = await deptRes.json();
                setDepartments(Array.isArray(deptData) ? deptData : []);
            }

            if (rolesRes.ok) {
                const rolesData = await rolesRes.json();
                setRoles(rolesData.roles || []);
            }

            if (activitiesRes.ok) {
                const activitiesData = await activitiesRes.json();
                setRecentActivities(Array.isArray(activitiesData) ? activitiesData : []);
            }
        } catch (error) {
            console.error('Error loading dependencies:', error);
        }
    };

    const handleInputChange = (field, value) => {
        setUserProfile(prev => ({
            ...prev,
            [field]: value
        }));
    };

    if (status === "loading" || loading) {
        return (
            <div className="container mx-auto py-6 px-4">
                <div className="flex items-center justify-center min-h-[400px]">
                    <div className="flex items-center gap-2">
                        <Loader2 className="w-6 h-6 animate-spin" />
                        <span>Loading user profile...</span>
                    </div>
                </div>
            </div>
        );
    }

    if (!session || !userProfile) {
        return null;
    }

    return (
        <div className="container mx-auto py-6 px-4">
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-900">My Profile</h1>
                <p className="text-gray-600">Manage your personal e-filing profile and view your activity</p>
            </div>

            <Tabs value={activeTab} onValueChange={(value) => {
                setActiveTab(value);
                // Log tab change
                if (session?.user?.id) {
                    logEfilingUserAction({
                        user_id: session.user.id,
                        action_type: EFILING_ACTIONS.PROFILE_UPDATED,
                        description: `Switched to ${value} tab in profile`,
                        entity_type: 'profile_tab',
                        entity_name: `${value} tab`
                    });
                }
            }} className="space-y-6">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="profile" className="flex items-center gap-2">
                        <User className="w-4 h-4" />
                        My Profile
                    </TabsTrigger>
                    <TabsTrigger value="permissions" className="flex items-center gap-2">
                        <Shield className="w-4 h-4" />
                        My Permissions
                    </TabsTrigger>
                    <TabsTrigger value="activity" className="flex items-center gap-2">
                        <Activity className="w-4 h-4" />
                        My Activity
                    </TabsTrigger>
                </TabsList>

                {/* Profile Tab */}
                <TabsContent value="profile" className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Basic Information */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <User className="w-5 h-5" />
                                    My Basic Information
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <Label htmlFor="name">Full Name</Label>
                                    <Input
                                        id="name"
                                        value={userProfile.name || ''}
                                        onChange={(e) => handleInputChange('name', e.target.value)}
                                        placeholder="Enter full name"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="email">Email Address</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        value={userProfile.email || ''}
                                        onChange={(e) => handleInputChange('email', e.target.value)}
                                        placeholder="Enter email address"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="contact_number">Contact Number</Label>
                                    <Input
                                        id="contact_number"
                                        value={userProfile.contact_number || ''}
                                        onChange={(e) => handleInputChange('contact_number', e.target.value)}
                                        placeholder="Enter contact number"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="employee_id">Employee ID</Label>
                                    <Input
                                        id="employee_id"
                                        value={userProfile.employee_id || ''}
                                        onChange={(e) => handleInputChange('employee_id', e.target.value)}
                                        placeholder="Enter employee ID"
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        {/* E-Filing Information */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <FileText className="w-5 h-5" />
                                    My E-Filing Information
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <Label htmlFor="designation">Designation</Label>
                                    <Input
                                        id="designation"
                                        value={userProfile.designation || ''}
                                        onChange={(e) => handleInputChange('designation', e.target.value)}
                                        placeholder="Enter designation"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="department_id">Department</Label>
                                    <Select 
                                        value={userProfile.department_id?.toString() || ''} 
                                        onValueChange={(value) => handleInputChange('department_id', value)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select department" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {departments.map((dept) => (
                                                <SelectItem key={dept.id} value={dept.id.toString()}>
                                                    {dept.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label htmlFor="efiling_role_id">Role</Label>
                                    <Select 
                                        value={userProfile.efiling_role_id?.toString() || ''} 
                                        onValueChange={(value) => handleInputChange('efiling_role_id', value)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select role" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {roles.map((role) => (
                                                <SelectItem key={role.id} value={role.id.toString()}>
                                                    {role.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* Permissions Tab */}
                <TabsContent value="permissions" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Shield className="w-5 h-5" />
                                Role Permissions
                            </CardTitle>
                            <CardDescription>
                                My current role permissions in the e-filing system
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-center py-8 text-gray-500">
                                <Shield className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                                <p>My permissions will be displayed here based on my role</p>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Activity Tab */}
                <TabsContent value="activity" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Activity className="w-5 h-5" />
                                Recent Activity
                            </CardTitle>
                            <CardDescription>
                                My recent actions in the e-filing system
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {recentActivities.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">
                                <Activity className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                                    <p>No recent activity found</p>
                                    <p className="text-sm">Your actions will appear here as you use the system</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {recentActivities.map((activity, index) => (
                                        <div key={activity.id || index} className="flex items-start space-x-3 p-3 border rounded-lg">
                                            <div className="flex-shrink-0">
                                                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                                    <Activity className="w-4 h-4 text-blue-600" />
                                                </div>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-sm font-medium text-gray-900">
                                                        {activity.action_type?.replace(/_/g, ' ').toUpperCase() || 'Unknown Action'}
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        {new Date(activity.timestamp || activity.created_at).toLocaleString()}
                                                    </p>
                                                </div>
                                                <p className="text-sm text-gray-600 mt-1">
                                                    {activity.description || 'No description available'}
                                                </p>
                                                {activity.file_number && (
                                                    <div className="mt-2 flex items-center space-x-2">
                                                        <FileText className="w-3 h-3 text-gray-400" />
                                                        <span className="text-xs text-gray-500">
                                                            File: {activity.file_number}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                            </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
