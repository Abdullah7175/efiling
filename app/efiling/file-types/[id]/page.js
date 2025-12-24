"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Edit, Building2, FileText, Calendar, User, Settings } from "lucide-react";

export default function FileTypeDetail() {
    const params = useParams();
    const router = useRouter();
    const [fileType, setFileType] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (params.id) {
            loadFileType();
        }
    }, [params.id]);

    const loadFileType = async () => {
        try {
            const response = await fetch(`/api/efiling/file-types?id=${params.id}`);
            if (response.ok) {
                const data = await response.json();
                setFileType(data.fileType || data);
            } else {
                throw new Error('Failed to load file type');
            }
        } catch (error) {
            console.error('Error loading file type:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-lg">Loading file type...</div>
            </div>
        );
    }

    if (!fileType) {
        return (
            <div className="container mx-auto py-6 px-4">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-gray-900 mb-4">File Type Not Found</h1>
                    <p className="text-gray-600 mb-6">The requested file type could not be found.</p>
                    <Button onClick={() => router.back()}>Go Back</Button>
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
                <h1 className="text-2xl font-bold">File Type Details</h1>
                <Button
                    onClick={() => router.push(`/efiling/file-types/${params.id}/edit`)}
                    className="ml-auto"
                >
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Information */}
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <FileText className="w-5 h-5" />
                                Basic Information
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-gray-500">Code</label>
                                    <p className="text-lg font-semibold">{fileType.code}</p>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-500">Name</label>
                                    <p className="text-lg font-semibold">{fileType.name}</p>
                                </div>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-500">Description</label>
                                <p className="text-gray-700">{fileType.description || 'No description provided'}</p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Settings className="w-5 h-5" />
                                Configuration
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-gray-500">Requires Approval</label>
                                    <Badge className={fileType.requires_approval ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"}>
                                        {fileType.requires_approval ? 'Yes' : 'No'}
                                    </Badge>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-500">Auto-assign</label>
                                    <Badge className={fileType.auto_assign ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                                        {fileType.auto_assign ? 'Yes' : 'No'}
                                    </Badge>
                                </div>
                            </div>
                            {fileType.workflow_template_id && (
                                <div>
                                    <label className="text-sm font-medium text-gray-500">Workflow Template</label>
                                    <p className="text-gray-700">ID: {fileType.workflow_template_id}</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Sidebar Information */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Building2 className="w-5 h-5" />
                                Department
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {fileType.department_name ? (
                                <div className="text-center">
                                    <Building2 className="w-12 h-12 mx-auto mb-2 text-blue-600" />
                                    <p className="font-semibold">{fileType.department_name}</p>
                                    <p className="text-sm text-gray-500">{fileType.department_code}</p>
                                </div>
                            ) : (
                                <p className="text-gray-500 text-center">No department assigned</p>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Calendar className="w-5 h-5" />
                                Timestamps
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div>
                                <label className="text-sm font-medium text-gray-500">Created</label>
                                <p className="text-sm text-gray-700">
                                    {fileType.created_at ? new Date(fileType.created_at).toLocaleDateString() : 'N/A'}
                                </p>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-500">Last Updated</label>
                                <p className="text-sm text-gray-700">
                                    {fileType.updated_at ? new Date(fileType.updated_at).toLocaleDateString() : 'N/A'}
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <User className="w-5 h-5" />
                                Status
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Badge className={fileType.is_active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                                {fileType.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

