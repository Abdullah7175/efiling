"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FileText, Search, Plus, Edit, Trash2, Building2, Shield, Eye, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function TemplatesManagement() {
    const { data: session } = useSession();
    const router = useRouter();
    const { toast } = useToast();
    
    const [templates, setTemplates] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [roles, setRoles] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [showPreviewDialog, setShowPreviewDialog] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        template_type: '',
        title: '',
        subject: '',
        main_content: '',
        category_id: '',
        department_id: '',
        role_id: '',
        department_ids: [],
        role_ids: []
    });
    const [selectedDepartmentIds, setSelectedDepartmentIds] = useState([]);
    const [selectedRoleIds, setSelectedRoleIds] = useState([]);

    const isAdmin = session?.user?.role === 1 || session?.user?.role === 2;

    useEffect(() => {
        if (session?.user?.id) {
            fetchTemplates();
            fetchDepartments();
            fetchRoles();
            fetchCategories();
        }
    }, [session?.user?.id]);

    const fetchTemplates = async () => {
        try {
            const params = new URLSearchParams();
            if (departmentFilter) params.append('department_id', departmentFilter);
            if (roleFilter) params.append('role_id', roleFilter);
            if (typeFilter) params.append('template_type', typeFilter);
            
            const res = await fetch(`/api/efiling/templates?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setTemplates(data.templates || []);
            }
        } catch (error) {
            console.error('Error fetching templates:', error);
            toast({
                title: "Error",
                description: "Failed to load templates",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const fetchDepartments = async () => {
        try {
            const res = await fetch('/api/efiling/departments');
            if (res.ok) {
                const data = await res.json();
                setDepartments(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            console.error('Error fetching departments:', error);
        }
    };

    const fetchRoles = async () => {
        try {
            const res = await fetch('/api/efiling/departments/roles');
            if (res.ok) {
                const data = await res.json();
                setRoles(Array.isArray(data) ? data : (data.roles || []));
            }
        } catch (error) {
            console.error('Error fetching roles:', error);
        }
    };

    const fetchCategories = async () => {
        try {
            const res = await fetch('/api/efiling/categories');
            if (res.ok) {
                const data = await res.json();
                setCategories(Array.isArray(data) ? data : (data.categories || []));
            }
        } catch (error) {
            console.error('Error fetching categories:', error);
        }
    };

    useEffect(() => {
        fetchTemplates();
    }, [departmentFilter, roleFilter, typeFilter]);

    const handleCreate = async () => {
        if (!formData.name || (!formData.title && !formData.subject && !formData.main_content)) {
            toast({
                title: "Validation Error",
                description: "Name and at least one of (title, subject, main_content) is required",
                variant: "destructive",
            });
            return;
        }

        try {
            const payload = {
                ...formData,
                department_ids: selectedDepartmentIds.length > 0 ? selectedDepartmentIds : (formData.department_id ? [parseInt(formData.department_id)] : []),
                role_ids: selectedRoleIds.length > 0 ? selectedRoleIds : (formData.role_id ? [parseInt(formData.role_id)] : [])
            };
            
            const res = await fetch('/api/efiling/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Failed to create template');
            }

            toast({
                title: "Success",
                description: "Template created successfully",
            });

            setFormData({
                name: '',
                template_type: '',
                title: '',
                subject: '',
                main_content: '',
                category_id: '',
                department_id: '',
                role_id: '',
                department_ids: [],
                role_ids: []
            });
            setSelectedDepartmentIds([]);
            setSelectedRoleIds([]);
            setShowAddDialog(false);
            fetchTemplates();
        } catch (error) {
            console.error('Error creating template:', error);
            toast({
                title: "Error",
                description: error.message || "Failed to create template",
                variant: "destructive",
            });
        }
    };

    const handleEdit = async (template) => {
        // Fetch full template details with multiple departments/roles
        try {
            const res = await fetch(`/api/efiling/templates/${template.id}`);
            if (res.ok) {
                const data = await res.json();
                const fullTemplate = data.template;
                
                setSelectedTemplate(fullTemplate);
                
                // Extract department IDs and role IDs from JSON arrays
                const deptIds = Array.isArray(fullTemplate.departments) 
                    ? fullTemplate.departments.map(d => d.id).filter(Boolean)
                    : (fullTemplate.single_department_id ? [fullTemplate.single_department_id] : []);
                
                const roleIds = Array.isArray(fullTemplate.roles) 
                    ? fullTemplate.roles.map(r => r.id).filter(Boolean)
                    : (fullTemplate.single_role_id ? [fullTemplate.single_role_id] : []);
                
                setSelectedDepartmentIds(deptIds);
                setSelectedRoleIds(roleIds);
                
                setFormData({
                    name: fullTemplate.name || '',
                    template_type: fullTemplate.template_type || '',
                    title: fullTemplate.title || '',
                    subject: fullTemplate.subject || '',
                    main_content: fullTemplate.main_content || '',
                    category_id: fullTemplate.category_id || '',
                    department_id: fullTemplate.single_department_id || '',
                    role_id: fullTemplate.single_role_id || '',
                    department_ids: deptIds,
                    role_ids: roleIds
                });
                setShowEditDialog(true);
            } else {
                // Fallback to basic template data
                setSelectedTemplate(template);
                setSelectedDepartmentIds(template.department_id ? [template.department_id] : []);
                setSelectedRoleIds(template.role_id ? [template.role_id] : []);
                setFormData({
                    name: template.name || '',
                    template_type: template.template_type || '',
                    title: template.title || '',
                    subject: template.subject || '',
                    main_content: template.main_content || '',
                    category_id: template.category_id || '',
                    department_id: template.department_id || '',
                    role_id: template.role_id || '',
                    department_ids: template.department_id ? [template.department_id] : [],
                    role_ids: template.role_id ? [template.role_id] : []
                });
                setShowEditDialog(true);
            }
        } catch (error) {
            console.error('Error fetching template details:', error);
            // Fallback to basic template data
            setSelectedTemplate(template);
            setSelectedDepartmentIds(template.department_id ? [template.department_id] : []);
            setSelectedRoleIds(template.role_id ? [template.role_id] : []);
            setFormData({
                name: template.name || '',
                template_type: template.template_type || '',
                title: template.title || '',
                subject: template.subject || '',
                main_content: template.main_content || '',
                category_id: template.category_id || '',
                department_id: template.department_id || '',
                role_id: template.role_id || '',
                department_ids: template.department_id ? [template.department_id] : [],
                role_ids: template.role_id ? [template.role_id] : []
            });
            setShowEditDialog(true);
        }
    };

    const handleUpdate = async () => {
        if (!selectedTemplate) return;

        try {
            const payload = {
                ...formData,
                department_ids: selectedDepartmentIds,
                role_ids: selectedRoleIds
            };
            
            const res = await fetch(`/api/efiling/templates/${selectedTemplate.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Failed to update template');
            }

            toast({
                title: "Success",
                description: "Template updated successfully",
            });

            setShowEditDialog(false);
            setSelectedTemplate(null);
            fetchTemplates();
        } catch (error) {
            console.error('Error updating template:', error);
            toast({
                title: "Error",
                description: error.message || "Failed to update template",
                variant: "destructive",
            });
        }
    };

    const handleDelete = async (templateId, templateName) => {
        if (!confirm(`Are you sure you want to delete template "${templateName}"?`)) {
            return;
        }

        try {
            const res = await fetch(`/api/efiling/templates/${templateId}`, {
                method: 'DELETE'
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Failed to delete template');
            }

            toast({
                title: "Success",
                description: "Template deleted successfully",
            });

            fetchTemplates();
        } catch (error) {
            console.error('Error deleting template:', error);
            toast({
                title: "Error",
                description: error.message || "Failed to delete template",
                variant: "destructive",
            });
        }
    };

    const handlePreview = (template) => {
        setSelectedTemplate(template);
        setShowPreviewDialog(true);
    };

    const filteredTemplates = templates.filter(template => {
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            return template.name?.toLowerCase().includes(term) ||
                   template.title?.toLowerCase().includes(term) ||
                   template.subject?.toLowerCase().includes(term) ||
                   template.template_type?.toLowerCase().includes(term) ||
                   template.department_name?.toLowerCase().includes(term) ||
                   template.role_name?.toLowerCase().includes(term);
        }
        return true;
    });

    const templateTypes = [...new Set(templates.map(t => t.template_type).filter(Boolean))];

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <div className="text-lg">Loading templates...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto py-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold">Template Management</h1>
                    <p className="text-gray-600">Manage document templates for e-filing system</p>
                </div>
                {isAdmin && (
                    <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                        <DialogTrigger asChild>
                            <Button className="flex items-center gap-2">
                                <Plus className="w-4 h-4" />
                                Add Template
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle>Create New Template</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label>Template Name *</Label>
                                        <Input
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="e.g., Notesheet Type I"
                                        />
                                    </div>
                                    <div>
                                        <Label>Template Type</Label>
                                        <Input
                                            value={formData.template_type}
                                            onChange={(e) => setFormData({ ...formData, template_type: e.target.value })}
                                            placeholder="e.g., notesheet(I), letter, memo"
                                        />
                                    </div>
                                </div>

                                {isAdmin && (
                                    <div className="space-y-4">
                                        <div>
                                            <Label>Departments (Multi-select)</Label>
                                            <p className="text-xs text-gray-500 mb-2">Select one or more departments. Leave empty for all departments.</p>
                                            <div className="max-h-48 overflow-y-auto border rounded p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                                                {departments.map((dept) => (
                                                    <label key={dept.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 p-1 rounded">
                                                        <input
                                                            type="checkbox"
                                                            className="h-4 w-4"
                                                            checked={selectedDepartmentIds.includes(dept.id)}
                                                            onChange={() => {
                                                                if (selectedDepartmentIds.includes(dept.id)) {
                                                                    setSelectedDepartmentIds(prev => prev.filter(id => id !== dept.id));
                                                                } else {
                                                                    setSelectedDepartmentIds(prev => [...prev, dept.id]);
                                                                }
                                                            }}
                                                        />
                                                        <span>{dept.name}</span>
                                                    </label>
                                                ))}
                                            </div>
                                            {selectedDepartmentIds.length > 0 && (
                                                <p className="text-xs text-blue-600 mt-1">
                                                    {selectedDepartmentIds.length} department(s) selected
                                                </p>
                                            )}
                                        </div>
                                        <div>
                                            <Label>Roles (Multi-select)</Label>
                                            <p className="text-xs text-gray-500 mb-2">Select one or more roles. Leave empty for all roles.</p>
                                            <div className="max-h-48 overflow-y-auto border rounded p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                                                {roles.map((role) => (
                                                    <label key={role.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 p-1 rounded">
                                                        <input
                                                            type="checkbox"
                                                            className="h-4 w-4"
                                                            checked={selectedRoleIds.includes(role.id)}
                                                            onChange={() => {
                                                                if (selectedRoleIds.includes(role.id)) {
                                                                    setSelectedRoleIds(prev => prev.filter(id => id !== role.id));
                                                                } else {
                                                                    setSelectedRoleIds(prev => [...prev, role.id]);
                                                                }
                                                            }}
                                                        />
                                                        <span>{role.name} ({role.code})</span>
                                                    </label>
                                                ))}
                                            </div>
                                            {selectedRoleIds.length > 0 && (
                                                <p className="text-xs text-blue-600 mt-1">
                                                    {selectedRoleIds.length} role(s) selected
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <Label>Category</Label>
                                    <Select
                                        value={formData.category_id || "__none"}
                                        onValueChange={(value) => setFormData({ ...formData, category_id: value === "__none" ? null : value })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select category (optional)" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="__none">No Category</SelectItem>
                                            {categories.map(cat => (
                                                <SelectItem key={cat.id} value={String(cat.id)}>
                                                    {cat.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div>
                                    <Label>Title</Label>
                                    <Input
                                        value={formData.title}
                                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                        placeholder="e.g., NOTESHEET"
                                    />
                                </div>

                                <div>
                                    <Label>Subject</Label>
                                    <Input
                                        value={formData.subject}
                                        onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                                        placeholder="Template subject line"
                                    />
                                </div>

                                <div>
                                    <Label>Main Content</Label>
                                    <Textarea
                                        value={formData.main_content}
                                        onChange={(e) => setFormData({ ...formData, main_content: e.target.value })}
                                        placeholder="Main document content"
                                        rows={10}
                                    />
                                </div>

                                <div className="flex justify-end space-x-2">
                                    <Button variant="outline" onClick={() => {
                                        setShowAddDialog(false);
                                        setFormData({
                                            name: '',
                                            template_type: '',
                                            title: '',
                                            subject: '',
                                            main_content: '',
                                            category_id: '',
                                            department_id: '',
                                            role_id: ''
                                        });
                                    }}>
                                        Cancel
                                    </Button>
                                    <Button onClick={handleCreate}>
                                        Create Template
                                    </Button>
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>
                )}
            </div>

            {/* Filters */}
            <Card className="mb-6">
                <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <Input
                                placeholder="Search templates..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <Select value={departmentFilter || "__all"} onValueChange={(value) => setDepartmentFilter(value === "__all" ? "" : value)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Filter by department" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__all">All Departments</SelectItem>
                                {departments.map(dept => (
                                    <SelectItem key={dept.id} value={String(dept.id)}>
                                        {dept.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={roleFilter || "__all"} onValueChange={(value) => setRoleFilter(value === "__all" ? "" : value)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Filter by role" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__all">All Roles</SelectItem>
                                {roles.map(role => (
                                    <SelectItem key={role.id} value={String(role.id)}>
                                        {role.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={typeFilter || "__all"} onValueChange={(value) => setTypeFilter(value === "__all" ? "" : value)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Filter by type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__all">All Types</SelectItem>
                                {templateTypes.map(type => (
                                    <SelectItem key={type} value={type}>
                                        {type}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* Templates List */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        Templates ({filteredTemplates.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {filteredTemplates.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <FileText className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                            <p>No templates found</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Department</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Created By</TableHead>
                                    <TableHead>Usage</TableHead>
                                    <TableHead>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredTemplates.map((template) => (
                                    <TableRow key={template.id}>
                                        <TableCell className="font-medium">
                                            {template.name}
                                        </TableCell>
                                        <TableCell>
                                            {template.template_type ? (
                                                <Badge variant="outline">{template.template_type}</Badge>
                                            ) : (
                                                <span className="text-gray-400">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {template.departments && Array.isArray(template.departments) && template.departments.length > 0 ? (
                                                <div className="flex flex-col gap-1">
                                                    {template.departments.slice(0, 2).map((dept, idx) => (
                                                        <div key={idx} className="flex items-center gap-1">
                                                            <Building2 className="w-3 h-3" />
                                                            <span className="text-xs">{dept.name}</span>
                                                        </div>
                                                    ))}
                                                    {template.departments.length > 2 && (
                                                        <Badge variant="outline" className="text-xs w-fit">
                                                            +{template.departments.length - 2} more
                                                        </Badge>
                                                    )}
                                                </div>
                                            ) : template.single_department_id ? (
                                                <div className="flex items-center gap-1">
                                                    <Building2 className="w-3 h-3" />
                                                    {template.department_name || 'Department'}
                                                </div>
                                            ) : (
                                                <Badge variant="secondary">All</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {template.roles && Array.isArray(template.roles) && template.roles.length > 0 ? (
                                                <div className="flex flex-col gap-1">
                                                    {template.roles.slice(0, 2).map((role, idx) => (
                                                        <div key={idx} className="flex items-center gap-1">
                                                            <Shield className="w-3 h-3" />
                                                            <span className="text-xs">{role.name}</span>
                                                        </div>
                                                    ))}
                                                    {template.roles.length > 2 && (
                                                        <Badge variant="outline" className="text-xs w-fit">
                                                            +{template.roles.length - 2} more
                                                        </Badge>
                                                    )}
                                                </div>
                                            ) : template.single_role_id ? (
                                                <div className="flex items-center gap-1">
                                                    <Shield className="w-3 h-3" />
                                                    {template.role_name || 'Role'}
                                                </div>
                                            ) : (
                                                <Badge variant="secondary">All</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {template.created_by_name || 'System'}
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-sm">
                                                <div>{template.usage_count || 0} times</div>
                                                {template.last_used_at && (
                                                    <div className="text-xs text-gray-500">
                                                        Last: {new Date(template.last_used_at).toLocaleDateString()}
                                                    </div>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handlePreview(template)}
                                                    title="Preview"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleEdit(template)}
                                                    title="Edit"
                                                >
                                                    <Edit className="w-4 h-4" />
                                                </Button>
                                                {isAdmin && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleDelete(template.id, template.name)}
                                                        className="text-red-600 hover:text-red-700"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Edit Dialog */}
            {showEditDialog && selectedTemplate && (
                <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>Edit Template</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>Template Name *</Label>
                                    <Input
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <Label>Template Type</Label>
                                    <Input
                                        value={formData.template_type}
                                        onChange={(e) => setFormData({ ...formData, template_type: e.target.value })}
                                    />
                                </div>
                            </div>

                            {isAdmin && (
                                <div className="space-y-4">
                                    <div>
                                        <Label>Departments (Multi-select)</Label>
                                        <p className="text-xs text-gray-500 mb-2">Select one or more departments. Leave empty for all departments.</p>
                                        <div className="max-h-48 overflow-y-auto border rounded p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                                            {departments.map((dept) => (
                                                <label key={dept.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 p-1 rounded">
                                                    <input
                                                        type="checkbox"
                                                        className="h-4 w-4"
                                                        checked={selectedDepartmentIds.includes(dept.id)}
                                                        onChange={() => {
                                                            if (selectedDepartmentIds.includes(dept.id)) {
                                                                setSelectedDepartmentIds(prev => prev.filter(id => id !== dept.id));
                                                            } else {
                                                                setSelectedDepartmentIds(prev => [...prev, dept.id]);
                                                            }
                                                        }}
                                                    />
                                                    <span>{dept.name}</span>
                                                </label>
                                            ))}
                                        </div>
                                        {selectedDepartmentIds.length > 0 && (
                                            <p className="text-xs text-blue-600 mt-1">
                                                {selectedDepartmentIds.length} department(s) selected
                                            </p>
                                        )}
                                    </div>
                                    <div>
                                        <Label>Roles (Multi-select)</Label>
                                        <p className="text-xs text-gray-500 mb-2">Select one or more roles. Leave empty for all roles.</p>
                                        <div className="max-h-48 overflow-y-auto border rounded p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                                            {roles.map((role) => (
                                                <label key={role.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 p-1 rounded">
                                                    <input
                                                        type="checkbox"
                                                        className="h-4 w-4"
                                                        checked={selectedRoleIds.includes(role.id)}
                                                        onChange={() => {
                                                            if (selectedRoleIds.includes(role.id)) {
                                                                setSelectedRoleIds(prev => prev.filter(id => id !== role.id));
                                                            } else {
                                                                setSelectedRoleIds(prev => [...prev, role.id]);
                                                            }
                                                        }}
                                                    />
                                                    <span>{role.name} ({role.code})</span>
                                                </label>
                                            ))}
                                        </div>
                                        {selectedRoleIds.length > 0 && (
                                            <p className="text-xs text-blue-600 mt-1">
                                                {selectedRoleIds.length} role(s) selected
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div>
                                <Label>Title</Label>
                                <Input
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                />
                            </div>

                            <div>
                                <Label>Subject</Label>
                                <Input
                                    value={formData.subject}
                                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                                />
                            </div>

                            <div>
                                <Label>Main Content</Label>
                                <Textarea
                                    value={formData.main_content}
                                    onChange={(e) => setFormData({ ...formData, main_content: e.target.value })}
                                    rows={10}
                                />
                            </div>

                            <div className="flex justify-end space-x-2">
                                <Button variant="outline" onClick={() => {
                                    setShowEditDialog(false);
                                    setSelectedTemplate(null);
                                }}>
                                    Cancel
                                </Button>
                                <Button onClick={handleUpdate}>
                                    Update Template
                                </Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            )}

            {/* Preview Dialog */}
            {showPreviewDialog && selectedTemplate && (
                <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <div className="flex items-center justify-between">
                                <DialogTitle>Template Preview</DialogTitle>
                                <Button variant="ghost" size="sm" onClick={() => setShowPreviewDialog(false)}>
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div>
                                <Label className="text-sm font-semibold">Name:</Label>
                                <p className="text-sm">{selectedTemplate.name}</p>
                            </div>
                            {selectedTemplate.template_type && (
                                <div>
                                    <Label className="text-sm font-semibold">Type:</Label>
                                    <p className="text-sm">{selectedTemplate.template_type}</p>
                                </div>
                            )}
                            {selectedTemplate.title && (
                                <div>
                                    <Label className="text-sm font-semibold">Title:</Label>
                                    <p className="text-sm font-medium">{selectedTemplate.title}</p>
                                </div>
                            )}
                            {selectedTemplate.subject && (
                                <div>
                                    <Label className="text-sm font-semibold">Subject:</Label>
                                    <p className="text-sm">{selectedTemplate.subject}</p>
                                </div>
                            )}
                            {selectedTemplate.main_content && (
                                <div>
                                    <Label className="text-sm font-semibold">Main Content:</Label>
                                    <div className="mt-2 p-4 border rounded-lg bg-gray-50 whitespace-pre-wrap text-sm">
                                        {selectedTemplate.main_content}
                                    </div>
                                </div>
                            )}
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}

