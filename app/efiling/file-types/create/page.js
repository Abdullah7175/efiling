'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Plus } from 'lucide-react';

export default function CreateFileType() {
    const { data: session } = useSession();
    const router = useRouter();
    const { toast } = useToast();
    
    const [loading, setLoading] = useState(false);
    const [categories, setCategories] = useState([]);
    const [roles, setRoles] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [slaMatrixEntries, setSlaMatrixEntries] = useState([]);
    const [selectedCreators, setSelectedCreators] = useState([]);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        categoryId: '',
        code: '',
        requiresApproval: true,
        can_create_roles: '',
        department_id: '',
        sla_matrix_id: '',
        max_approval_level: ''
    });

    useEffect(() => {
        if (session?.user) {
            loadCategories();
            loadRoles();
            loadDepartments();
            // Don't load SLA matrix entries initially - wait for department selection
        }
    }, [session]);

    const loadCategories = async () => {
        try {
            const response = await fetch('/api/efiling/file-categories?is_active=true');
            if (response.ok) {
                const data = await response.json();
                console.log('Categories loaded:', data);
                setCategories(data.categories || []);
            } else {
                console.error('Failed to load categories:', response.status);
                const errorData = await response.json();
                console.error('Categories error data:', errorData);
            }
        } catch (error) {
            console.error('Error loading categories:', error);
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

    const loadSlaMatrixEntries = async (departmentId = null) => {
        try {
            let url = '/api/efiling/sla?active_only=true';
            if (departmentId) {
                url += `&department_id=${departmentId}`;
            }
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                setSlaMatrixEntries(data.data || []);
            }
        } catch (error) {
            console.error('Error loading SLA matrix entries:', error);
        }
    };

    const handleInputChange = (field, value) => {
        console.log(`Setting ${field} to:`, value);
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
        
        // Reload SLA matrix entries when department changes
        if (field === 'department_id') {
            loadSlaMatrixEntries(value || null);
            // Clear SLA matrix selection when department changes
            if (value !== formData.department_id) {
                setFormData(prev => ({
                    ...prev,
                    sla_matrix_id: ''
                }));
            }
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.name || !formData.categoryId || !formData.code) {
            toast({
                title: "Validation Error",
                description: "Please fill in all required fields",
                variant: "destructive"
            });
            return;
        }

        try {
            setLoading(true);
            
            const response = await fetch('/api/efiling/file-types', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...formData,
                    can_create_roles: selectedCreators,
                    createdBy: session.user.id,
                    ipAddress: '127.0.0.1',
                    userAgent: navigator.userAgent
                }),
            });

            if (response.ok) {
                toast({
                    title: "Success",
                    description: "File type created successfully",
                });
                router.push('/efiling/file-types');
            } else {
                const error = await response.json();
                toast({
                    title: "Error",
                    description: error.error || "Failed to create file type",
                    variant: "destructive"
                });
            }
        } catch (error) {
            console.error('Error creating file type:', error);
            toast({
                title: "Error",
                description: "Failed to create file type",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    if (!session) {
        return <div>Please sign in to access this page.</div>;
    }

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex items-center gap-4">
                <Button
                    variant="ghost"
                    onClick={() => router.back()}
                    className="flex items-center gap-2"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                </Button>
                <div>
                    <h1 className="text-3xl font-bold">Create File Type</h1>
                    <p className="text-muted-foreground">
                        Define a new file type with its workflow requirements
                    </p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Basic Information</CardTitle>
                        <CardDescription>
                            Define the essential details for this file type
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <Label htmlFor="name">File Type Name *</Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) => handleInputChange('name', e.target.value)}
                                    placeholder="e.g., Water Bulk Work Order"
                                />
                            </div>

                            <div>
                                <Label htmlFor="code">File Type Code *</Label>
                                <Input
                                    id="code"
                                    value={formData.code}
                                    onChange={(e) => handleInputChange('code', e.target.value.toUpperCase())}
                                    placeholder="e.g., WB_WO"
                                />
                            </div>

                            <div>
                                <Label htmlFor="categoryId">Category *</Label>
                                <Select 
                                    value={formData.categoryId || undefined} 
                                    onValueChange={(value) => handleInputChange('categoryId', value)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select category">
                                            {formData.categoryId && categories.find(cat => cat.id == formData.categoryId)?.name}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {categories.map((category) => (
                                            <SelectItem key={category.id} value={category.id.toString()}>
                                                {category.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label htmlFor="department_id">Department</Label>
                                <Select 
                                    value={formData.department_id || undefined} 
                                    onValueChange={(value) => handleInputChange('department_id', value === 'none' ? '' : value)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select department (optional)">
                                            {formData.department_id && departments.find(d => d.id == formData.department_id)?.name}
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
                                <Label htmlFor="sla_matrix_id">SLA Matrix Entry</Label>
                                <Select 
                                    value={formData.sla_matrix_id || undefined} 
                                    onValueChange={(value) => handleInputChange('sla_matrix_id', value === 'none' ? '' : value)}
                                    disabled={!formData.department_id}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder={formData.department_id ? "Select SLA matrix entry (optional)" : "Select department first"}>
                                            {formData.sla_matrix_id && slaMatrixEntries.find(e => e.id == formData.sla_matrix_id) 
                                                ? `${slaMatrixEntries.find(e => e.id == formData.sla_matrix_id).from_role_code} → ${slaMatrixEntries.find(e => e.id == formData.sla_matrix_id).to_role_code} (${slaMatrixEntries.find(e => e.id == formData.sla_matrix_id).sla_hours}h)`
                                                : ''}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">No SLA Matrix Entry</SelectItem>
                                        {slaMatrixEntries.map((entry) => (
                                            <SelectItem key={entry.id} value={entry.id.toString()}>
                                                {entry.from_role_code} → {entry.to_role_code} ({entry.sla_hours}h) {entry.department_name ? `- ${entry.department_name}` : '(Global)'}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {!formData.department_id && (
                                    <p className="text-sm text-muted-foreground mt-1">
                                        Please select a department first to see available SLA matrix entries
                                    </p>
                                )}
                            </div>

                            <div>
                                <Label htmlFor="max_approval_level">Max Approval Level</Label>
                                <Input
                                    id="max_approval_level"
                                    type="number"
                                    min="1"
                                    max="5"
                                    value={formData.max_approval_level}
                                    onChange={(e) => handleInputChange('max_approval_level', e.target.value ? parseInt(e.target.value) : '')}
                                    placeholder="1-5 (optional)"
                                />
                            </div>

                        </div>

                        <div>
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                value={formData.description}
                                onChange={(e) => handleInputChange('description', e.target.value)}
                                placeholder="Describe the purpose and scope of this file type..."
                                rows={3}
                            />
                        </div>

                        <div>
                            <Label>Who can create (select roles)</Label>
                            <div className="max-h-64 overflow-y-auto border rounded p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                                {roles.map((r) => (
                                    <label key={r.id} className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4"
                                            checked={selectedCreators.includes(r.code)}
                                            onChange={() => setSelectedCreators(prev => prev.includes(r.code) ? prev.filter(c => c !== r.code) : [...prev, r.code])}
                                        />
                                        <span>{r.name} ({r.code})</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="requiresApproval"
                                checked={formData.requiresApproval}
                                onCheckedChange={(checked) => handleInputChange('requiresApproval', checked)}
                            />
                            <Label htmlFor="requiresApproval">Requires approval workflow</Label>
                        </div>
                    </CardContent>
                </Card>

                <div className="flex justify-end gap-4">
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
                        disabled={loading || !formData.name || !formData.categoryId || !formData.code}
                        className="flex items-center gap-2"
                    >
                        {loading ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                Creating...
                            </>
                        ) : (
                            <>
                                <Plus className="w-4 h-4" />
                                Create File Type
                            </>
                        )}
                    </Button>
                </div>
            </form>
        </div>
    );
}
