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
                <h1 className="text-3xl font-bold text-gray-900">User Profile</h1>
                <p className="text-gray-600">Manage your e-filing profile and preferences</p>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="profile" className="flex items-center gap-2">
                        <User className="w-4 h-4" />
                        Profile
                    </TabsTrigger>
                    <TabsTrigger value="permissions" className="flex items-center gap-2">
                        <Shield className="w-4 h-4" />
                        Permissions
                    </TabsTrigger>
                    <TabsTrigger value="activity" className="flex items-center gap-2">
                        <Activity className="w-4 h-4" />
                        Activity
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
                                    Basic Information
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
                                    E-Filing Information
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
                                Your current role permissions in the e-filing system
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-center py-8 text-gray-500">
                                <Shield className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                                <p>Permissions will be displayed here based on your role</p>
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
                                Your recent actions in the e-filing system
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-center py-8 text-gray-500">
                                <Activity className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                                <p>Recent activity will be displayed here</p>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
