"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { UserCheck, Save, ArrowLeft, Eye, EyeOff, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ProfileSettings() {
    const { data: session } = useSession();
    const router = useRouter();
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [profile, setProfile] = useState({
        name: '',
        email: '',
        employee_id: '',
        designation: '',
        department: '',
        phone: '',
        address: ''
    });
    const [passwordData, setPasswordData] = useState({
        current_password: '',
        new_password: '',
        confirm_password: ''
    });
    const [showPasswords, setShowPasswords] = useState({
        current: false,
        new: false,
        confirm: false
    });

    useEffect(() => {
        if (!session?.user?.id) return;
        fetchProfile();
    }, [session?.user?.id]);

    const fetchProfile = async () => {
        try {
            const response = await fetch(`/api/efiling/users/${session.user.id}`);
            if (response.ok) {
                const data = await response.json();
                setProfile({
                    name: data.name || '',
                    email: data.email || '',
                    employee_id: data.employee_id || '',
                    designation: data.designation || '',
                    department: data.department_name || '',
                    phone: data.contact_number || '',
                    address: data.address || ''
                });
            }
        } catch (error) {
            console.error('Error fetching profile:', error);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const response = await fetch(`/api/efiling/users/${session.user.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: profile.name,
                    email: profile.email,
                    contact_number: profile.phone,
                    address: profile.address
                }),
            });

            if (response.ok) {
                toast({
                    title: "Success",
                    description: "Profile updated successfully",
                });
            } else {
                const error = await response.json();
                toast({
                    title: "Error",
                    description: error.error || "Failed to update profile",
                    variant: "destructive",
                });
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to update profile",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordUpdate = async (e) => {
        e.preventDefault();
        
        if (passwordData.new_password !== passwordData.confirm_password) {
            toast({
                title: "Error",
                description: "New passwords do not match",
                variant: "destructive",
            });
            return;
        }

        if (passwordData.new_password.length < 6) {
            toast({
                title: "Error",
                description: "New password must be at least 6 characters long",
                variant: "destructive",
            });
            return;
        }

        setLoading(true);

        try {
            const response = await fetch('/api/efiling/users/update-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    current_password: passwordData.current_password,
                    new_password: passwordData.new_password
                }),
            });

            if (response.ok) {
                toast({
                    title: "Success",
                    description: "Password updated successfully",
                });
                setPasswordData({
                    current_password: '',
                    new_password: '',
                    confirm_password: ''
                });
            } else {
                const error = await response.json();
                toast({
                    title: "Error",
                    description: error.error || "Failed to update password",
                    variant: "destructive",
                });
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to update password",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (field, value) => {
        setProfile(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handlePasswordChange = (field, value) => {
        setPasswordData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const togglePasswordVisibility = (field) => {
        setShowPasswords(prev => ({
            ...prev,
            [field]: !prev[field]
        }));
    };

    return (
        <div className="container mx-auto px-4 py-6">
            <div className="flex items-center gap-4 mb-6">
                <Button
                    variant="ghost"
                    onClick={() => router.back()}
                    className="flex items-center"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                </Button>
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Profile Settings</h1>
                    <p className="text-gray-600">Update your personal information and password</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Profile Information */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center">
                            <UserCheck className="w-5 h-5 mr-2" />
                            Personal Information
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <Label htmlFor="name">Full Name</Label>
                                    <Input
                                        id="name"
                                        value={profile.name}
                                        onChange={(e) => handleInputChange('name', e.target.value)}
                                        placeholder="Enter your full name"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="email">Email Address</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        value={profile.email}
                                        onChange={(e) => handleInputChange('email', e.target.value)}
                                        placeholder="Enter your email"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <Label htmlFor="employee_id">Employee ID</Label>
                                    <Input
                                        id="employee_id"
                                        value={profile.employee_id}
                                        disabled
                                        className="bg-gray-50"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="designation">Designation</Label>
                                    <Input
                                        id="designation"
                                        value={profile.designation}
                                        disabled
                                        className="bg-gray-50"
                                    />
                                </div>
                            </div>

                            <div>
                                <Label htmlFor="department">Department</Label>
                                <Input
                                    id="department"
                                    value={profile.department}
                                    disabled
                                    className="bg-gray-50"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <Label htmlFor="phone">Phone Number</Label>
                                    <Input
                                        id="phone"
                                        value={profile.phone}
                                        onChange={(e) => handleInputChange('phone', e.target.value)}
                                        placeholder="Enter phone number"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="address">Address</Label>
                                    <Input
                                        id="address"
                                        value={profile.address}
                                        onChange={(e) => handleInputChange('address', e.target.value)}
                                        placeholder="Enter your address"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <Button
                                    type="submit"
                                    className="bg-blue-600 hover:bg-blue-700"
                                    disabled={loading}
                                >
                                    {loading ? (
                                        <div className="flex items-center">
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                            Updating...
                                        </div>
                                    ) : (
                                        <div className="flex items-center">
                                            <Save className="w-4 h-4 mr-2" />
                                            Update Profile
                                        </div>
                                    )}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>

                {/* Password Update */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center">
                            <Lock className="w-5 h-5 mr-2" />
                            Update Password
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handlePasswordUpdate} className="space-y-4">
                            <div>
                                <Label htmlFor="current_password">Current Password</Label>
                                <div className="relative">
                                    <Input
                                        id="current_password"
                                        type={showPasswords.current ? "text" : "password"}
                                        value={passwordData.current_password}
                                        onChange={(e) => handlePasswordChange('current_password', e.target.value)}
                                        placeholder="Enter current password"
                                        required
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                        onClick={() => togglePasswordVisibility('current')}
                                    >
                                        {showPasswords.current ? (
                                            <EyeOff className="h-4 w-4" />
                                        ) : (
                                            <Eye className="h-4 w-4" />
                                        )}
                                    </Button>
                                </div>
                            </div>

                            <div>
                                <Label htmlFor="new_password">New Password</Label>
                                <div className="relative">
                                    <Input
                                        id="new_password"
                                        type={showPasswords.new ? "text" : "password"}
                                        value={passwordData.new_password}
                                        onChange={(e) => handlePasswordChange('new_password', e.target.value)}
                                        placeholder="Enter new password"
                                        required
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                        onClick={() => togglePasswordVisibility('new')}
                                    >
                                        {showPasswords.new ? (
                                            <EyeOff className="h-4 w-4" />
                                        ) : (
                                            <Eye className="h-4 w-4" />
                                        )}
                                    </Button>
                                </div>
                            </div>

                            <div>
                                <Label htmlFor="confirm_password">Confirm New Password</Label>
                                <div className="relative">
                                    <Input
                                        id="confirm_password"
                                        type={showPasswords.confirm ? "text" : "password"}
                                        value={passwordData.confirm_password}
                                        onChange={(e) => handlePasswordChange('confirm_password', e.target.value)}
                                        placeholder="Confirm new password"
                                        required
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                        onClick={() => togglePasswordVisibility('confirm')}
                                    >
                                        {showPasswords.confirm ? (
                                            <EyeOff className="h-4 w-4" />
                                        ) : (
                                            <Eye className="h-4 w-4" />
                                        )}
                                    </Button>
                                </div>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <Button
                                    type="submit"
                                    className="bg-green-600 hover:bg-green-700"
                                    disabled={loading}
                                >
                                    {loading ? (
                                        <div className="flex items-center">
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                            Updating...
                                        </div>
                                    ) : (
                                        <div className="flex items-center">
                                            <Lock className="w-4 h-4 mr-2" />
                                            Update Password
                                        </div>
                                    )}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
} 