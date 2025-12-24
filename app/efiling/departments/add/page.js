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
import { ArrowLeft, Save, Building2, Loader2 } from "lucide-react";

export default function AddEfilingDepartment() {
    const router = useRouter();
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [departments, setDepartments] = useState([]);

    const [formData, setFormData] = useState({
        name: '',
        code: '',
        description: '',
        parent_department_id: null,
        is_active: true
    });

    // Load parent departments
    useEffect(() => {
        loadParentDepartments();
    }, []);

    const loadParentDepartments = async () => {
        try {
            const response = await fetch('/api/efiling/departments?is_active=true');
            if (response.ok) {
                const data = await response.json();
                setDepartments(data || []);
            }
        } catch (error) {
            console.error('Error loading parent departments:', error);
        }
    };

    const handleInputChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
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
                description: "Department code must be at least 2 characters long.",
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
            const response = await fetch('/api/efiling/departments', {
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
                    description: "E-filing department created successfully!",
                });
                router.push('/efiling/departments/manage');
            } else {
                throw new Error(result.error || 'Failed to create department');
            }
        } catch (error) {
            toast({
                title: "Error",
                description: error.message || "Failed to create e-filing department.",
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
                <h1 className="text-2xl font-bold">Add E-Filing Department</h1>
            </div>

            <Card className="max-w-2xl mx-auto">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Building2 className="w-5 h-5" />
                        New E-Filing Department
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Basic Information */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <Label htmlFor="name">Department Name *</Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) => handleInputChange('name', e.target.value)}
                                    placeholder="Enter department name"
                                    required
                                />
                            </div>
                            <div>
                                <Label htmlFor="code">Department Code *</Label>
                                <Input
                                    id="code"
                                    value={formData.code}
                                    onChange={(e) => handleInputChange('code', e.target.value.toUpperCase())}
                                    placeholder="Enter department code (e.g., IT, HR)"
                                    required
                                />
                            </div>
                        </div>

                        {/* Parent Department and Status */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <Label htmlFor="parent_department_id">Parent Department</Label>
                                <Select value={formData.parent_department_id || "none"} onValueChange={(value) => handleInputChange('parent_department_id', value === "none" ? null : value)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select parent department (optional)">
                                            {formData.parent_department_id ? departments.find(d => d.id == formData.parent_department_id)?.name : "No Parent Department"}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">No Parent Department</SelectItem>
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
                                placeholder="Enter department description"
                                rows={3}
                            />
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
                                        Create Department
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
