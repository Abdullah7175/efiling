"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Shield, Loader2 } from "lucide-react";

export default function EditPermission() {
    const params = useParams();
    const router = useRouter();
    const { data: session, status } = useSession();
    const { toast } = useToast();
    
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        resource_type: '',
        action: '',
        resource_subtype: '',
        is_active: true
    });

    const resourceTypes = [
        'file', 'workflow', 'department', 'user', 'role', 'permission', 'report', 'system'
    ];

    const actions = [
        'create', 'read', 'update', 'delete', 'approve', 'reject', 'assign', 'view', 'manage'
    ];

    useEffect(() => {
        if (status === "loading") return;
        
        if (!session) {
            router.push("/login");
            return;
        }

        if (params.id) {
            loadPermission();
        }
    }, [session, status, router, params.id]);

    const loadPermission = async () => {
        try {
            setInitialLoading(true);
            const response = await fetch(`/api/efiling/permissions/${params.id}`);
            if (response.ok) {
                const data = await response.json();
                const permission = data.permission;
                setFormData({
                    name: permission.name || '',
                    description: permission.description || '',
                    resource_type: permission.resource_type || '',
                    action: permission.action || '',
                    resource_subtype: permission.resource_subtype || '',
                    is_active: permission.is_active !== undefined ? permission.is_active : true
                });
            } else {
                throw new Error('Failed to load permission');
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to load permission data. Please try again.",
                variant: "destructive",
            });
        } finally {
            setInitialLoading(false);
        }
    };

    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleCheckboxChange = (field, checked) => {
        setFormData(prev => ({ ...prev, [field]: checked }));
    };

    const validateForm = () => {
        if (!formData.name || !formData.resource_type || !formData.action) {
            toast({
                title: "Validation Error",
                description: "Permission Name, Resource Type, and Action are required.",
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
            const response = await fetch(`/api/efiling/permissions/${params.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData),
            });

            const result = await response.json();

            if (response.ok) {
                toast({
                    title: "Success",
                    description: "Permission updated successfully!",
                });
                router.push('/efiling/permissions');
            } else {
                throw new Error(result.error || 'Failed to update permission');
            }
        } catch (error) {
            toast({
                title: "Error",
                description: error.message || "Failed to update permission.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    if (status === "loading" || initialLoading) {
        return (
            <div className="container mx-auto py-6 px-4">
                <div className="flex items-center justify-center min-h-[400px]">
                    <div className="flex items-center gap-2">
                        <Loader2 className="w-6 h-6 animate-spin" />
                        <span>Loading permission data...</span>
                    </div>
                </div>
            </div>
        );
    }

    if (!session) {
        return null;
    }

    return (
        <div className="container mx-auto py-6 px-4">
            <div className="flex items-center gap-4 mb-6">
                <Button variant="outline" onClick={() => router.back()} className="flex items-center gap-2">
                    <ArrowLeft className="w-4 h-4" />
                    Back
                </Button>
                <h1 className="text-2xl font-bold">Edit Permission</h1>
            </div>

            <Card className="max-w-2xl mx-auto">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Shield className="w-5 h-5" />
                        Edit Permission
                    </CardTitle>
                    <CardDescription>
                        Update the permission details and access control settings
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Basic Information */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <Label htmlFor="name">Permission Name *</Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) => handleInputChange('name', e.target.value)}
                                    placeholder="e.g., Create Files"
                                    required
                                />
                            </div>
                            <div>
                                <Label htmlFor="resource_type">Resource Type *</Label>
                                <Select
                                    value={formData.resource_type}
                                    onValueChange={(value) => handleInputChange('resource_type', value)}
                                    required
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select resource type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {resourceTypes.map((type) => (
                                            <SelectItem key={type} value={type}>
                                                {type.charAt(0).toUpperCase() + type.slice(1)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <Label htmlFor="action">Action *</Label>
                                <Select
                                    value={formData.action}
                                    onValueChange={(value) => handleInputChange('action', value)}
                                    required
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select action" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {actions.map((action) => (
                                            <SelectItem key={action} value={action}>
                                                {action.charAt(0).toUpperCase() + action.slice(1)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label htmlFor="resource_subtype">Resource Subtype</Label>
                                <Input
                                    id="resource_subtype"
                                    value={formData.resource_subtype}
                                    onChange={(e) => handleInputChange('resource_subtype', e.target.value)}
                                    placeholder="e.g., internal, outgoing, workflow_stage"
                                />
                            </div>
                        </div>

                        {/* Description */}
                        <div>
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                value={formData.description}
                                onChange={(e) => handleInputChange('description', e.target.value)}
                                placeholder="Describe what this permission allows users to do..."
                                rows={3}
                            />
                        </div>

                        {/* Status */}
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="is_active"
                                checked={formData.is_active}
                                onCheckedChange={(checked) => handleCheckboxChange('is_active', checked)}
                            />
                            <Label htmlFor="is_active">Permission is active</Label>
                        </div>

                        {/* Submit Button */}
                        <div className="flex justify-end gap-4 pt-6 border-t">
                            <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={loading || !formData.name || !formData.resource_type || !formData.action} className="flex items-center gap-2">
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Updating...
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-4 h-4" />
                                        Update Permission
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

