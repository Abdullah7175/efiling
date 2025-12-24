"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Save, Loader2 } from "lucide-react";

export default function EditCategoryPage() {
    const params = useParams();
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [departments, setDepartments] = useState([]);
    const [formData, setFormData] = useState({
        name: '',
        code: '',
        description: '',
        department_id: null,
        is_work_related: false,
        is_active: true
    });

    useEffect(() => {
        if (params.id) {
            loadCategory();
            loadDepartments();
        }
    }, [params.id]);

    const loadCategory = async () => {
        try {
            const response = await fetch(`/api/efiling/categories?id=${params.id}`);
            if (response.ok) {
                const data = await response.json();
                console.log('Loaded category data:', data);
                
                setFormData({
                    name: data.name || '',
                    code: data.code || '',
                    description: data.description || '',
                    department_id: data.department_id || null,
                    is_work_related: data.is_work_related || false,
                    is_active: data.is_active !== undefined ? data.is_active : true
                });
            } else {
                throw new Error('Failed to load category');
            }
        } catch (error) {
            console.error('Error loading category:', error);
            alert('Failed to load category data. Please try again.');
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

    const handleInputChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const validateForm = () => {
        if (!formData.name || !formData.code) {
            alert('Name and Code are required fields.');
            return false;
        }

        if (formData.code.length < 2) {
            alert('Category code must be at least 2 characters long.');
            return false;
        }

        return true;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!validateForm()) return;

        setLoading(true);

        try {
            const requestBody = {
                id: params.id,
                ...formData
            };
            console.log('Submitting form data:', requestBody);
            
            const response = await fetch(`/api/efiling/categories`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });

            const result = await response.json();

            if (response.ok) {
                alert('Category updated successfully!');
            router.push('/efiling/categories');
            } else {
                throw new Error(result.error || 'Failed to update category');
            }
        } catch (error) {
            console.error('Error updating category:', error);
            alert(error.message || "Failed to update category.");
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
                        <span>Loading category data...</span>
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
                <h1 className="text-2xl font-bold">Edit Category</h1>
            </div>

            <Card className="max-w-2xl mx-auto">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Save className="w-5 h-5" />
                        Edit Category
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Basic Information */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                                <Label htmlFor="name">Category Name *</Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) => handleInputChange('name', e.target.value)}
                                    placeholder="Enter category name"
                                    required
                                />
                        </div>
                        <div>
                                <Label htmlFor="code">Category Code *</Label>
                                <Input
                                    id="code"
                                    value={formData.code}
                                    onChange={(e) => handleInputChange('code', e.target.value.toUpperCase())}
                                    placeholder="Enter category code (e.g., WW, IT, HR)"
                                    required
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
                                placeholder="Enter category description"
                                rows={3}
                            />
                        </div>

                        {/* Department */}
                        <div>
                            <Label htmlFor="department_id">Department</Label>
                            <Select 
                                value={formData.department_id ? formData.department_id.toString() : "none"} 
                                onValueChange={(value) => handleInputChange('department_id', value === "none" ? null : parseInt(value))}
                            >
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

                        {/* Configuration Options */}
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold">Configuration Options</h3>
                            <div className="space-y-3">
                                <div className="flex items-center space-x-2">
                                    <Checkbox
                                        id="is_work_related"
                                        checked={formData.is_work_related}
                                        onCheckedChange={(checked) => handleInputChange('is_work_related', checked)}
                                    />
                                    <Label htmlFor="is_work_related">Work Related Category</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Checkbox
                                        id="is_active"
                                        checked={formData.is_active}
                                        onCheckedChange={(checked) => handleInputChange('is_active', checked)}
                                    />
                                    <Label htmlFor="is_active">Active Category</Label>
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
                                        Update Category
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
