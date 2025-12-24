"use client";

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, User, Loader2 } from "lucide-react";

export default function EditEfilingUser() {
    const router = useRouter();
    const params = useParams();
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [departments, setDepartments] = useState([]);
    const [roles, setRoles] = useState([]);

    // Helper function to get approval level names
    const getApprovalLevelName = (level) => {
        const levels = {
            1: 'Junior',
            2: 'Senior',
            3: 'Manager',
            4: 'Director',
            5: 'CEO'
        };
        return levels[level] || 'Unknown';
    };


    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        contact_number: '',
        cnic: '',
        employee_id: '',
        designation: '',
        department_id: '',
        efiling_role_id: '',
        supervisor_id: null,
        approval_level: 1,
        approval_amount_limit: 0,
        can_sign: true,
        can_create_files: true,
        can_approve_files: false,
        can_reject_files: false,
        can_transfer_files: true,
        max_concurrent_files: 10,
        preferred_signature_method: 'SMS_OTP',
        signature_settings: {},
        notification_preferences: {},
        is_active: true,
        google_email: '',
        district_id: '',
        town_id: '',
        subtown_id: '',
        division_id: ''
    });

    // Load user data and dependencies
    useEffect(() => {
        if (params.id) {
            loadUserData();
            loadDependencies();
        }
    }, [params.id]);

    const loadDependencies = async () => {
        try {
            await Promise.all([
                loadDepartments(),
                loadRoles()
            ]);
        } catch (error) {
            console.error('Error loading dependencies:', error);
        }
    };

    const loadUserData = async () => {
        try {
            const response = await fetch(`/api/efiling/users/${params.id}`);
            if (response.ok) {
                const userData = await response.json();
                
                // Transform the data to match our form structure
                setFormData({
                    name: userData.name || '',
                    email: userData.email || '',
                    password: '',
                    confirmPassword: '',
                    contact_number: userData.contact_number || '',
                    cnic: userData.cnic || '',
                    employee_id: userData.employee_id || '',
                    designation: userData.designation || '',
                    department_id: userData.department_id || '',
                    efiling_role_id: userData.efiling_role_id || '',
                    supervisor_id: userData.supervisor_id || null,
                    approval_level: userData.approval_level || 1,
                    approval_amount_limit: userData.approval_amount_limit || 0,
                    can_sign: userData.can_sign !== undefined ? userData.can_sign : true,
                    can_create_files: userData.can_create_files !== undefined ? userData.can_create_files : true,
                    can_approve_files: userData.can_approve_files !== undefined ? userData.can_approve_files : false,
                    can_reject_files: userData.can_reject_files !== undefined ? userData.can_reject_files : false,
                    can_transfer_files: userData.can_transfer_files !== undefined ? userData.can_transfer_files : true,
                    max_concurrent_files: userData.max_concurrent_files || 10,
                    preferred_signature_method: userData.preferred_signature_method || 'SMS_OTP',
                    signature_settings: userData.signature_settings || {},
                    notification_preferences: userData.notification_preferences || {},
                    is_active: userData.is_active !== undefined ? userData.is_active : true,
                    google_email: userData.google_email || '',
                    district_id: userData.district_id || '',
                    town_id: userData.town_id || '',
                    subtown_id: userData.subtown_id || '',
                    division_id: userData.division_id || ''
                });
            } else {
                throw new Error('Failed to load user data');
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to load user data. Please try again.",
                variant: "destructive",
            });
        } finally {
            setInitialLoading(false);
        }
    };

    const loadDepartments = async () => {
        try {
            const response = await fetch('/api/efiling/departments?is_active=true');
            if (response.ok) {
                const data = await response.json();
                setDepartments(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            console.error('Error loading departments:', error);
        }
    };

    const loadRoles = async () => {
        try {
            const response = await fetch('/api/efiling/roles?is_active=true');
            if (response.ok) {
                const data = await response.json();
                setRoles(data.roles || []);
            }
        } catch (error) {
            console.error('Error loading roles:', error);
        }
    };

    const loadSupervisors = async () => {
        try {
            const response = await fetch('/api/efiling/users?is_active=true');
            if (response.ok) {
                const data = await response.json();
                setSupervisors(data.users || []);
            }
        } catch (error) {
            console.error('Error loading supervisors:', error);
        }
    };

    const handleInputChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    // CNIC formatting handler - auto-inserts hyphens
    const handleCnicChange = (value) => {
        // Remove all non-digit characters
        const digitsOnly = value.replace(/\D/g, '');
        
        // Limit to 13 digits
        const limitedDigits = digitsOnly.slice(0, 13);
        
        // Format with hyphens: 42101-8065450-1
        let formatted = '';
        if (limitedDigits.length > 0) {
            formatted = limitedDigits.slice(0, 5);
            if (limitedDigits.length > 5) {
                formatted += '-' + limitedDigits.slice(5, 12);
                if (limitedDigits.length > 12) {
                    formatted += '-' + limitedDigits.slice(12, 13);
                }
            }
        }
        
        handleInputChange('cnic', formatted);
    };

    // Auto-populate geographic fields when department is selected
    const handleDepartmentChange = async (departmentId) => {
        handleInputChange('department_id', departmentId ? parseInt(departmentId) : '');
        
        // Clear existing geographic fields when changing department
        handleInputChange('division_id', '');
        handleInputChange('district_id', '');
        handleInputChange('town_id', '');
        handleInputChange('subtown_id', '');

        if (!departmentId) {
            return;
        }

        try {
            // Fetch department locations
            const response = await fetch(`/api/efiling/departments/locations?department_id=${departmentId}`);
            if (response.ok) {
                const data = await response.json();
                const locations = data.success ? data.locations : [];
                
                if (locations.length > 0) {
                    // Use the first location to auto-populate
                    // Priority: division > town > district
                    const firstLocation = locations[0];
                    
                    if (firstLocation.division_id) {
                        handleInputChange('division_id', firstLocation.division_id);
                    } else if (firstLocation.town_id) {
                        handleInputChange('town_id', firstLocation.town_id);
                        if (firstLocation.district_id) {
                            handleInputChange('district_id', firstLocation.district_id);
                        }
                    } else if (firstLocation.district_id) {
                        handleInputChange('district_id', firstLocation.district_id);
                    }
                    
                    // Show toast if multiple locations exist
                    if (locations.length > 1) {
                        toast({
                            title: "Multiple locations found",
                            description: `Department has ${locations.length} locations. Using the first one. You can update manually if needed.`,
                            variant: "default",
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching department locations:', error);
            // Don't show error toast as this is auto-population
        }
    };

    const validateForm = () => {
        if (!formData.name || !formData.email || !formData.cnic || !formData.employee_id || !formData.department_id || !formData.efiling_role_id) {
            toast({
                title: "Validation Error",
                description: "Please fill in all required fields.",
                variant: "destructive",
            });
            return false;
        }

        // Validate CNIC format (13 digits with hyphens: 42101-8065450-1)
        if (formData.cnic) {
            const cnicRegex = /^\d{5}-\d{7}-\d{1}$/;
            if (!cnicRegex.test(formData.cnic)) {
                toast({
                    title: "Validation Error",
                    description: "CNIC must be in the format: 11111-1111111-1 (13 digits with hyphens).",
                    variant: "destructive",
                });
                return false;
            }
        }

        // Only validate password if it's being changed
        if (formData.password && formData.password !== formData.confirmPassword) {
            toast({
                title: "Password Mismatch",
                description: "Password and confirm password do not match.",
                variant: "destructive",
            });
            return false;
        }

        if (formData.password && formData.password.length < 6) {
            toast({
                title: "Password Too Short",
                description: "Password must be at least 6 characters long.",
                variant: "destructive",
            });
            return false;
        }

        return true;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!validateForm()) return;

        setLoading(true);

        try {
            // Only include password if it's being changed
            const updateData = { ...formData };
            if (!updateData.password) {
                delete updateData.password;
                delete updateData.confirmPassword;
            }

            const response = await fetch(`/api/efiling/users/${params.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updateData),
            });

            const result = await response.json();

            if (response.ok) {
                toast({
                    title: "Success",
                    description: "E-filing user updated successfully!",
                });
                router.push('/efiling/departments/users');
            } else {
                throw new Error(result.error || 'Failed to update user');
            }
        } catch (error) {
            toast({
                title: "Error",
                description: error.message || "Failed to update e-filing user.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    if (initialLoading) {
        return (
            <div className="container mx-auto py-6 px-4">
                <div className="flex items-center justify-center min-h-[400px]">
                    <div className="flex items-center gap-2">
                        <Loader2 className="w-6 h-6 animate-spin" />
                        <span>Loading user data...</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto py-6 px-4">
            <div className="flex items-center gap-4 mb-6">
                <Button
                    variant="outline"
                    onClick={() => router.back()}
                    className="flex items-center gap-2"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                </Button>
                <h1 className="text-2xl font-bold">Edit E-Filing User</h1>
            </div>

            <Card className="max-w-4xl mx-auto">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <User className="w-5 h-5" />
                        Edit E-Filing User
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Basic Information */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <Label htmlFor="name">Full Name *</Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) => handleInputChange('name', e.target.value)}
                                    placeholder="Enter full name"
                                    required
                                />
                            </div>
                            <div>
                                <Label htmlFor="email">Email Address *</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => handleInputChange('email', e.target.value)}
                                    placeholder="Enter email address"
                                    required
                                />
                            </div>
                            <div>
                                <Label htmlFor="password">Password (leave blank to keep current)</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    value={formData.password}
                                    onChange={(e) => handleInputChange('password', e.target.value)}
                                    placeholder="Enter new password (optional)"
                                />
                            </div>
                            <div>
                                <Label htmlFor="confirmPassword">Confirm Password</Label>
                                <Input
                                    id="confirmPassword"
                                    type="password"
                                    value={formData.confirmPassword}
                                    onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                                    placeholder="Confirm new password"
                                />
                            </div>
                            <div>
                                <Label htmlFor="contact_number">Contact Number</Label>
                                <Input
                                    id="contact_number"
                                    value={formData.contact_number}
                                    onChange={(e) => handleInputChange('contact_number', e.target.value)}
                                    placeholder="Enter contact number"
                                />
                            </div>
                            <div>
                                <Label htmlFor="cnic">CNIC *</Label>
                                <Input
                                    id="cnic"
                                    value={formData.cnic}
                                    onChange={(e) => handleCnicChange(e.target.value)}
                                    placeholder="11111-1111111-1"
                                    maxLength={15}
                                    required
                                />
                                <p className="text-sm text-gray-500 mt-1">
                                    13-digit CNIC number with format: 11111-1111111-1
                                </p>
                            </div>
                            <div>
                                <Label htmlFor="google_email">Google Email (Optional)</Label>
                                <Input
                                    id="google_email"
                                    type="email"
                                    value={formData.google_email}
                                    onChange={(e) => handleInputChange('google_email', e.target.value)}
                                    placeholder="Enter Google account email for authentication"
                                />
                                <p className="text-sm text-gray-500 mt-1">
                                    Used for Google OAuth authentication during e-signature process
                                </p>
                            </div>
                            <div>
                                <Label htmlFor="employee_id">Employee ID *</Label>
                                <Input
                                    id="employee_id"
                                    value={formData.employee_id}
                                    onChange={(e) => handleInputChange('employee_id', e.target.value)}
                                    placeholder="Enter employee ID"
                                    required
                                />
                            </div>
                        </div>

                        {/* E-Filing Specific Information */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <Label htmlFor="designation">Designation</Label>
                                <Input
                                    id="designation"
                                    value={formData.designation}
                                    onChange={(e) => handleInputChange('designation', e.target.value)}
                                    placeholder="Enter designation"
                                />
                            </div>
                            <div>
                                <Label htmlFor="department_id">Department *</Label>
                                <Select value={formData.department_id || undefined} onValueChange={handleDepartmentChange}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select department">
                                            {formData.department_id && departments.find(d => d.id == formData.department_id)?.name}
                                        </SelectValue>
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
                                <Label htmlFor="efiling_role_id">Role *</Label>
                                <Select value={formData.efiling_role_id || undefined} onValueChange={(value) => handleInputChange('efiling_role_id', value)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select role">
                                            {formData.efiling_role_id && roles.find(r => r.id == formData.efiling_role_id)?.name}
                                        </SelectValue>
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

                        </div>

                        {/* Settings */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <Label htmlFor="max_concurrent_files">Max Concurrent Files</Label>
                                <Input
                                    id="max_concurrent_files"
                                    type="number"
                                    value={formData.max_concurrent_files}
                                    onChange={(e) => handleInputChange('max_concurrent_files', parseInt(e.target.value))}
                                    placeholder="10"
                                />
                            </div>
                            <div>
                                <Label htmlFor="approval_level">Approval Level</Label>
                                <Select value={formData.approval_level.toString()} onValueChange={(value) => handleInputChange('approval_level', parseInt(value))}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select approval level">
                                            {formData.approval_level} - {getApprovalLevelName(formData.approval_level)}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={1}>1 - Junior</SelectItem>
                                        <SelectItem value={2}>2 - Senior</SelectItem>
                                        <SelectItem value={3}>3 - Manager</SelectItem>
                                        <SelectItem value={4}>4 - Director</SelectItem>
                                        <SelectItem value={5}>5 - CEO</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Additional Settings */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <Label htmlFor="preferred_signature_method">Preferred Signature Method</Label>
                                <Select value={formData.preferred_signature_method} onValueChange={(value) => handleInputChange('preferred_signature_method', value)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select signature method">
                                            {formData.preferred_signature_method}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="SMS_OTP">SMS OTP</SelectItem>
                                        <SelectItem value="GOOGLE_AUTH">Google Authenticator</SelectItem>
                                        <SelectItem value="E_PEN">E-Pen</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label htmlFor="approval_amount_limit">Approval Amount Limit</Label>
                                <Input
                                    id="approval_amount_limit"
                                    type="number"
                                    step="0.01"
                                    value={formData.approval_amount_limit}
                                    onChange={(e) => handleInputChange('approval_amount_limit', parseFloat(e.target.value))}
                                    placeholder="0.00"
                                />
                            </div>
                        </div>

                        {/* Capabilities */}
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold">User Capabilities</h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        id="can_sign"
                                        checked={formData.can_sign}
                                        onChange={(e) => handleInputChange('can_sign', e.target.checked)}
                                        className="rounded"
                                    />
                                    <Label htmlFor="can_sign">Can Sign Files</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        id="can_create_files"
                                        checked={formData.can_create_files}
                                        onChange={(e) => handleInputChange('can_create_files', e.target.checked)}
                                        className="rounded"
                                    />
                                    <Label htmlFor="can_create_files">Can Create Files</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        id="can_approve_files"
                                        checked={formData.can_approve_files}
                                        onChange={(e) => handleInputChange('can_approve_files', e.target.checked)}
                                        className="rounded"
                                    />
                                    <Label htmlFor="can_approve_files">Can Approve Files</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        id="can_reject_files"
                                        checked={formData.can_reject_files}
                                        onChange={(e) => handleInputChange('can_reject_files', e.target.checked)}
                                        className="rounded"
                                    />
                                    <Label htmlFor="can_reject_files">Can Reject Files</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        id="can_transfer_files"
                                        checked={formData.can_transfer_files}
                                        onChange={(e) => handleInputChange('can_transfer_files', e.target.checked)}
                                        className="rounded"
                                    />
                                    <Label htmlFor="can_transfer_files">Can Transfer Files</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        id="is_active"
                                        checked={formData.is_active}
                                        onChange={(e) => handleInputChange('is_active', e.target.checked)}
                                        className="rounded"
                                    />
                                    <Label htmlFor="is_active">Active User</Label>
                                </div>
                            </div>
                        </div>

                        {/* Submit Button */}
                        <div className="flex justify-end gap-4 pt-6 border-t">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => router.back()}
                                disabled={loading}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={loading}
                                className="flex items-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Updating...
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-4 h-4" />
                                        Update User
                                    </>
                                )}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
