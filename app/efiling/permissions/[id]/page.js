"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Edit, Trash2, Shield, Loader2, Calendar, Tag } from "lucide-react";

export default function ViewPermission() {
    const params = useParams();
    const router = useRouter();
    const { data: session, status } = useSession();
    const { toast } = useToast();
    
    const [loading, setLoading] = useState(true);
    const [permission, setPermission] = useState(null);

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
            setLoading(true);
            const response = await fetch(`/api/efiling/permissions/${params.id}`);
            if (response.ok) {
                const data = await response.json();
                setPermission(data.permission);
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
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete this permission?')) return;

        try {
            const response = await fetch(`/api/efiling/permissions/${params.id}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                toast({
                    title: "Success",
                    description: "Permission deleted successfully!",
                });
                router.push('/efiling/permissions');
            } else {
                const result = await response.json();
                throw new Error(result.error || 'Failed to delete permission');
            }
        } catch (error) {
            toast({
                title: "Error",
                description: error.message || "Failed to delete permission.",
                variant: "destructive",
            });
        }
    };

    if (status === "loading" || loading) {
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

    if (!permission) {
        return (
            <div className="container mx-auto py-6 px-4">
                <div className="text-center py-8">
                    <Shield className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                    <h2 className="text-xl font-semibold text-gray-600">Permission not found</h2>
                    <p className="text-gray-500 mt-2">The permission you&apos;re looking for doesn&apos;t exist.</p>
                    <Button onClick={() => router.push('/efiling/permissions')} className="mt-4">
                        Back to Permissions
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto py-6 px-4">
            <div className="flex items-center gap-4 mb-6">
                <Button variant="outline" onClick={() => router.back()} className="flex items-center gap-2">
                    <ArrowLeft className="w-4 h-4" />
                    Back
                </Button>
                <h1 className="text-2xl font-bold">Permission Details</h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Permission Info */}
                <div className="lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Shield className="w-5 h-5" />
                                {permission.name}
                            </CardTitle>
                            <CardDescription>
                                {permission.description || 'No description provided'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Basic Information */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-gray-500">Resource Type</label>
                                    <div className="mt-1">
                                        <Badge variant="outline" className="capitalize">
                                            {permission.resource_type}
                                        </Badge>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-500">Action</label>
                                    <div className="mt-1">
                                        <Badge variant="outline" className="capitalize">
                                            {permission.action}
                                        </Badge>
                                    </div>
                                </div>
                            </div>

                            {permission.resource_subtype && (
                                <div>
                                    <label className="text-sm font-medium text-gray-500">Resource Subtype</label>
                                    <div className="mt-1">
                                        <Badge variant="secondary">
                                            {permission.resource_subtype}
                                        </Badge>
                                    </div>
                                </div>
                            )}

                            {/* Status */}
                            <div>
                                <label className="text-sm font-medium text-gray-500">Status</label>
                                <div className="mt-1">
                                    <Badge className={permission.is_active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                                        {permission.is_active ? 'Active' : 'Inactive'}
                                    </Badge>
                                </div>
                            </div>

                            {/* Timestamps */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-gray-500">Created</label>
                                    <div className="mt-1 flex items-center gap-2 text-sm text-gray-600">
                                        <Calendar className="w-4 h-4" />
                                        {new Date(permission.created_at).toLocaleDateString()}
                                    </div>
                                </div>
                                {permission.updated_at && (
                                    <div>
                                        <label className="text-sm font-medium text-gray-500">Last Updated</label>
                                        <div className="mt-1 flex items-center gap-2 text-sm text-gray-600">
                                            <Calendar className="w-4 h-4" />
                                            {new Date(permission.updated_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Actions Sidebar */}
                <div className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Actions</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <Button 
                                onClick={() => router.push(`/efiling/permissions/${params.id}/edit`)}
                                className="w-full"
                            >
                                <Edit className="w-4 h-4 mr-2" />
                                Edit Permission
                            </Button>
                            <Button 
                                variant="destructive" 
                                onClick={handleDelete}
                                className="w-full"
                            >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete Permission
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Permission Summary */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Summary</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex items-center gap-2 text-sm">
                                <Tag className="w-4 h-4 text-gray-500" />
                                <span className="text-gray-600">ID:</span>
                                <span className="font-mono">{permission.id}</span>
                            </div>
                            <div className="text-sm text-gray-600">
                                This permission allows users to <strong>{permission.action}</strong> resources of type <strong>{permission.resource_type}</strong>
                                {permission.resource_subtype && ` (${permission.resource_subtype})`}.
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
