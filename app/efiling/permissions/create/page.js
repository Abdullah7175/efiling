"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Shield, Loader2 } from "lucide-react";

export default function CreatePermission() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        resource_type: '',
        action: '',
        resource_subtype: '',
        is_active: true
    });

    const resourceTypes = [
        'file', 'workflow', 'department', 'user', 'role', 
        'permission', 'report', 'system'
    ];
    
    const actions = [
        'create', 'read', 'update', 'delete', 'approve', 
        'reject', 'assign', 'view', 'manage'
    ];

    const handleInputChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleCheckboxChange = (checked) => {
        setFormData(prev => ({
            ...prev,
            is_active: checked
        }));
    };

    const validateForm = () => {
        if (!formData.name || !formData.resource_type || !formData.action) {
            toast({
                title: "Validation Error",
                description: "Please fill in all required fields.",
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
            const response = await fetch('/api/efiling/permissions', {
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
                    description: "Permission created successfully!",
                });
                router.push('/efiling/permissions');
            } else {
                throw new Error(result.error || 'Failed to create permission');
            }
        } catch (error) {
            toast({
                title: "Error",
                description: error.message || "Failed to create permission.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    if (status === "loading") {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-lg">Loading...</div>
            </div>
        );
    }

    if (!session) {
        return null;
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
                <h1 className="text-2xl font-bold">Create New Permission</h1>
            </div>

            <Card className="max-w-2xl mx-auto">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Shield className="w-5 h-5" />
                        New Permission
                    </CardTitle>
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
                                    placeholder="Enter permission name"
                                    required
                                />
                            </div>
                            <div>
                                <Label htmlFor="resource_type">Resource Type *</Label>
                                <Select 
                                    value={formData.resource_type} 
                                    onValueChange={(value) => handleInputChange('resource_type', value)}
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

                        {/* Action and Subtype */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <Label htmlFor="action">Action *</Label>
                                <Select 
                                    value={formData.action} 
                                    onValueChange={(value) => handleInputChange('action', value)}
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
                                    placeholder="Enter resource subtype (optional)"
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
                                placeholder="Enter permission description"
                                rows={3}
                            />
                        </div>

                        {/* Status */}
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="is_active"
                                checked={formData.is_active}
                                onCheckedChange={handleCheckboxChange}
                            />
                            <Label htmlFor="is_active">Active</Label>
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
                                        Creating...
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-4 h-4" />
                                        Create Permission
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
