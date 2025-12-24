"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Shield } from "lucide-react";

export default function CreateEfilingRole() {
    const router = useRouter();
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [departments, setDepartments] = useState([]);

    const [formData, setFormData] = useState({
        name: '',
        code: '',
        description: '',
        department_id: '',
        permissions: {
            can_create_files: false,
            can_edit_files: false,
            can_view_files: true,
            can_delete_files: false,
            can_approve_files: false,
            can_reject_files: false,
            can_transfer_files: false,
            can_attach_documents: false,
            can_sign_files: false,
            can_assign_files: false,
            can_close_files: false
        },
        is_active: true
    });

    // Load departments
    useEffect(() => {
        loadDepartments();
    }, []);

    const loadDepartments = async () => {
        try {
            const response = await fetch('/api/efiling/departments?is_active=true');
            if (response.ok) {
                const data = await response.json();
                setDepartments(data || []);
            }
        } catch (error) {
            console.error('Error loading departments:', error);
        }
    };

    const handleInputChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handlePermissionChange = (permission, value) => {
        setFormData(prev => ({
            ...prev,
            permissions: {
                ...prev.permissions,
                [permission]: value
            }
        }));
    };

    const validateForm = () => {
        if (!formData.name || !formData.code) {
            toast({
                title: "Validation Error",
                description: "Please fill in all required fields.",
                variant: "destructive",
            });
            return false;
        }

        if (formData.code.length < 2) {
            toast({
                title: "Validation Error",
                description: "Role code must be at least 2 characters long.",
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
            const response = await fetch('/api/efiling/roles', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData),
            });

            const result = await response.json();

            if (response.ok) {
                toast({
                    title: "Success",
                    description: "E-filing role created successfully!",
                });
                router.push('/efiling/departments/roles');
            } else {
                throw new Error(result.error || 'Failed to create role');
            }
        } catch (error) {
            toast({
                title: "Error",
                description: error.message || "Failed to create e-filing role.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

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
                <h1 className="text-2xl font-bold">Create E-Filing Role</h1>
            </div>

            <Card className="max-w-4xl mx-auto">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Shield className="w-5 h-5" />
                        New E-Filing Role
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Basic Information */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <Label htmlFor="name">Role Name *</Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) => handleInputChange('name', e.target.value)}
                                    placeholder="Enter role name"
                                    required
                                />
                            </div>
                            <div>
                                <Label htmlFor="code">Role Code *</Label>
                                <Input
                                    id="code"
                                    value={formData.code}
                                    onChange={(e) => handleInputChange('code', e.target.value.toUpperCase())}
                                    placeholder="Enter role code (e.g., ADMIN, USER)"
                                    required
                                />
                            </div>
                        </div>

                        {/* Department and Description */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <Label htmlFor="department_id">Department</Label>
                                <Select value={formData.department_id || "none"} onValueChange={(value) => handleInputChange('department_id', value === "none" ? null : value)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select department (optional)">
                                            {formData.department_id ? departments.find(d => d.id == formData.department_id)?.name : "No Department"}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">No Department</SelectItem>
                                        {departments.map((dept) => (
                                            <SelectItem key={dept.id} value={dept.id.toString()}>
                                                {dept.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label htmlFor="is_active">Status</Label>
                                <Select value={formData.is_active.toString()} onValueChange={(value) => handleInputChange('is_active', value === 'true')}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select status">
                                            {formData.is_active ? "Active" : "Inactive"}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="true">Active</SelectItem>
                                        <SelectItem value="false">Inactive</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Description */}
                        <div>
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                value={formData.description}
                                onChange={(e) => handleInputChange('description', e.target.value)}
                                placeholder="Enter role description"
                                rows={3}
                            />
                        </div>

                        {/* Permissions */}
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold">Role Permissions</h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        id="can_create_files"
                                        checked={formData.permissions.can_create_files}
                                        onChange={(e) => handlePermissionChange('can_create_files', e.target.checked)}
                                        className="rounded"
                                    />
                                    <Label htmlFor="can_create_files">Can Create Files</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        id="can_edit_files"
                                        checked={formData.permissions.can_edit_files}
                                        onChange={(e) => handlePermissionChange('can_edit_files', e.target.checked)}
                                        className="rounded"
                                    />
                                    <Label htmlFor="can_edit_files">Can Edit Files</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        id="can_view_files"
                                        checked={formData.permissions.can_view_files}
                                        onChange={(e) => handlePermissionChange('can_view_files', e.target.checked)}
                                        className="rounded"
                                    />
                                    <Label htmlFor="can_view_files">Can View Files</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        id="can_delete_files"
                                        checked={formData.permissions.can_delete_files}
                                        onChange={(e) => handlePermissionChange('can_delete_files', e.target.checked)}
                                        className="rounded"
                                    />
                                    <Label htmlFor="can_delete_files">Can Delete Files</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        id="can_approve_files"
                                        checked={formData.permissions.can_approve_files}
                                        onChange={(e) => handlePermissionChange('can_approve_files', e.target.checked)}
                                        className="rounded"
                                    />
                                    <Label htmlFor="can_approve_files">Can Approve Files</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        id="can_reject_files"
                                        checked={formData.permissions.can_reject_files}
                                        onChange={(e) => handlePermissionChange('can_reject_files', e.target.checked)}
                                        className="rounded"
                                    />
                                    <Label htmlFor="can_reject_files">Can Reject Files</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        id="can_transfer_files"
                                        checked={formData.permissions.can_transfer_files}
                                        onChange={(e) => handlePermissionChange('can_transfer_files', e.target.checked)}
                                        className="rounded"
                                    />
                                    <Label htmlFor="can_transfer_files">Can Transfer Files</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        id="can_attach_documents"
                                        checked={formData.permissions.can_attach_documents}
                                        onChange={(e) => handlePermissionChange('can_attach_documents', e.target.checked)}
                                        className="rounded"
                                    />
                                    <Label htmlFor="can_attach_documents">Can Attach Documents</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        id="can_sign_files"
                                        checked={formData.permissions.can_sign_files}
                                        onChange={(e) => handlePermissionChange('can_sign_files', e.target.checked)}
                                        className="rounded"
                                    />
                                    <Label htmlFor="can_sign_files">Can Sign Files</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        id="can_assign_files"
                                        checked={formData.permissions.can_assign_files}
                                        onChange={(e) => handlePermissionChange('can_assign_files', e.target.checked)}
                                        className="rounded"
                                    />
                                    <Label htmlFor="can_assign_files">Can Assign Files</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        id="can_close_files"
                                        checked={formData.permissions.can_close_files}
                                        onChange={(e) => handlePermissionChange('can_close_files', e.target.checked)}
                                        className="rounded"
                                    />
                                    <Label htmlFor="can_close_files">Can Close Files</Label>
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
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                        Creating...
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-4 h-4" />
                                        Create Role
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
