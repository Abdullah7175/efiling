"use client";
import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useRouter } from "next/navigation";

export default function CreateCategoryPage() {
    const [formData, setFormData] = useState({
        name: "",
        code: "",
        description: "",
        department_id: null,
        is_work_related: false,
        is_active: true
    });
    const [departments, setDepartments] = useState([]);
    const [saving, setSaving] = useState(false);
    const router = useRouter();

    useEffect(() => {
        // Load departments
        const loadDepartments = async () => {
            try {
                const res = await fetch('/api/efiling/departments?is_active=true');
                if (res.ok) {
                    const data = await res.json();
                    setDepartments(Array.isArray(data) ? data : []);
                }
            } catch (error) {
                console.error('Error loading departments:', error);
            }
        };
        loadDepartments();
    }, []);

    const handleInputChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const submit = async (e) => {
        e.preventDefault();
        
        if (!formData.name || !formData.code) {
            alert('Name and Code are required fields');
            return;
        }
        
        setSaving(true);
        try {
            const res = await fetch('/api/efiling/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            if (res.ok) {
                router.push('/efiling/categories');
            } else {
                const error = await res.json();
                alert(error.error || 'Failed to create category');
            }
        } catch (error) {
            console.error('Error creating category:', error);
            alert('Failed to create category');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="container mx-auto px-4 py-6">
            <Card>
                <CardHeader>
                    <CardTitle>Create Category</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={submit} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                                <Label htmlFor="name">Name *</Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) => handleInputChange('name', e.target.value)}
                                    placeholder="e.g., Water Works"
                                    required
                                />
                        </div>
                        <div>
                                <Label htmlFor="code">Code *</Label>
                                <Input
                                    id="code"
                                    value={formData.code}
                                    onChange={(e) => handleInputChange('code', e.target.value.toUpperCase())}
                                    placeholder="e.g., WW"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                value={formData.description}
                                onChange={(e) => handleInputChange('description', e.target.value)}
                                placeholder="Describe the purpose of this category..."
                                rows={3}
                            />
                        </div>

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

                        <div className="flex justify-end gap-4 pt-6 border-t">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => router.back()}
                                disabled={saving}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={saving || !formData.name || !formData.code}
                            >
                                {saving ? 'Creating...' : 'Create Category'}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
