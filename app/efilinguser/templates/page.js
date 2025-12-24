"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FileText, Search, Plus, Edit, Eye, X, Building2, Shield, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEfilingUser } from "@/context/EfilingUserContext";

export default function MyTemplates() {
    const { data: session } = useSession();
    const { toast } = useToast();
    const { profile } = useEfilingUser();
    
    const [templates, setTemplates] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
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
        category_id: ''
    });

    useEffect(() => {
        if (session?.user?.id) {
            fetchMyTemplates();
        }
    }, [session?.user?.id]);

    useEffect(() => {
        if (profile?.department_id) {
            fetchCategories();
        }
    }, [profile?.department_id]);

    const fetchMyTemplates = async () => {
        try {
            setLoading(true);
            // Fetch templates created by current user
            const userRes = await fetch('/api/efiling/users/profile?userId=' + session.user.id);
            if (userRes.ok) {
                const userData = await userRes.json();
                const efilingUserId = userData.efiling_user_id;
                
                if (efilingUserId) {
                    const res = await fetch(`/api/efiling/templates?user_id=${efilingUserId}`);
                    if (res.ok) {
                        const data = await res.json();
                        setTemplates(data.templates || []);
                    }
                }
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

    const fetchCategories = async () => {
        try {
            // Get user's department_id from profile
            if (!profile?.department_id) {
                setCategories([]);
                return;
            }

            const res = await fetch(`/api/efiling/categories?department_id=${profile.department_id}&is_active=true`);
            if (res.ok) {
                const data = await res.json();
                setCategories(Array.isArray(data) ? data : (data.categories || []));
            }
        } catch (error) {
            console.error('Error fetching categories:', error);
        }
    };

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
            // Get user's efiling ID
            const userRes = await fetch('/api/efiling/users/profile?userId=' + session.user.id);
            if (!userRes.ok) {
                throw new Error('Failed to fetch user profile');
            }
            const userData = await userRes.json();
            
            const res = await fetch('/api/efiling/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    // Department and role will be auto-populated by API
                })
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
                category_id: ''
            });
            setShowAddDialog(false);
            fetchMyTemplates();
        } catch (error) {
            console.error('Error creating template:', error);
            toast({
                title: "Error",
                description: error.message || "Failed to create template",
                variant: "destructive",
            });
        }
    };

    const handleEdit = (template) => {
        setSelectedTemplate(template);
        setFormData({
            name: template.name || '',
            template_type: template.template_type || '',
            title: template.title || '',
            subject: template.subject || '',
            main_content: template.main_content || '',
            category_id: template.category_id || ''
        });
        setShowEditDialog(true);
    };

    const handleUpdate = async () => {
        if (!selectedTemplate) return;

        try {
            const res = await fetch(`/api/efiling/templates/${selectedTemplate.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
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
            fetchMyTemplates();
        } catch (error) {
            console.error('Error updating template:', error);
            toast({
                title: "Error",
                description: error.message || "Failed to update template",
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
                   template.template_type?.toLowerCase().includes(term);
        }
        if (typeFilter && template.template_type !== typeFilter) {
            return false;
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
                    <h1 className="text-2xl font-bold">My Templates</h1>
                    <p className="text-gray-600">Manage your document templates</p>
                    {profile && (
                        <p className="text-sm text-gray-500 mt-1">
                            Department: {profile.department_name} | Role: {profile.role_name}
                        </p>
                    )}
                </div>
                <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                    <DialogTrigger asChild>
                        <Button className="flex items-center gap-2">
                            <Plus className="w-4 h-4" />
                            Create Template
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

                            <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-700">
                                <p className="font-semibold mb-1">Note:</p>
                                <p>This template will be automatically assigned to your department ({profile?.department_name}) and role ({profile?.role_name}).</p>
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
                                        category_id: ''
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
            </div>

            {/* Filters */}
            <Card className="mb-6">
                <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <Input
                                placeholder="Search templates..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                            />
                        </div>
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
                        My Templates ({filteredTemplates.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {filteredTemplates.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <FileText className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                            <p>No templates found</p>
                            <p className="text-sm mt-1">Create your first template to get started</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Title</TableHead>
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
                                            {template.title || <span className="text-gray-400">-</span>}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <BarChart3 className="w-4 h-4 text-gray-400" />
                                                <span>{template.usage_count || 0} times</span>
                                                {template.last_used_at && (
                                                    <span className="text-xs text-gray-500">
                                                        ({new Date(template.last_used_at).toLocaleDateString()})
                                                    </span>
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

