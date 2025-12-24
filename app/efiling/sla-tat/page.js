"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit2, Trash2, Clock, ArrowLeft, Save } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

export default function SLAMatrixPage() {
    const router = useRouter();
    const { data: session } = useSession();
    const { toast } = useToast();
    const [slaEntries, setSlaEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingEntry, setEditingEntry] = useState(null);
    const [departments, setDepartments] = useState([]);
    const [roles, setRoles] = useState([]);

    const [formData, setFormData] = useState({
        from_role_code: '',
        to_role_code: '',
        level_scope: 'district',
        sla_hours: 24,
        description: '',
        department_id: '',
        is_active: true
    });

    useEffect(() => {
        if (session?.user) {
            loadSLAMatrix();
            loadDepartments();
            loadRoles();
        }
    }, [session]);

    const loadSLAMatrix = async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/efiling/sla?active_only=true');
            if (response.ok) {
                const data = await response.json();
                setSlaEntries(data.data || []);
            } else {
                toast({
                    title: "Error",
                    description: "Failed to load SLA matrix",
                    variant: "destructive"
                });
            }
        } catch (error) {
            console.error('Error loading SLA matrix:', error);
            toast({
                title: "Error",
                description: "Failed to load SLA matrix",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
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

    const loadRoles = async () => {
        try {
            const response = await fetch('/api/efiling/roles?is_active=true');
            if (response.ok) {
                const data = await response.json();
                setRoles(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            console.error('Error loading roles:', error);
        }
    };

    const handleInputChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleCreate = () => {
        setEditingEntry(null);
        setFormData({
            from_role_code: '',
            to_role_code: '',
            level_scope: 'district',
            sla_hours: 24,
            description: '',
            department_id: '',
            is_active: true
        });
        setDialogOpen(true);
    };

    const handleEdit = (entry) => {
        setEditingEntry(entry);
        setFormData({
            from_role_code: entry.from_role_code || '',
            to_role_code: entry.to_role_code || '',
            level_scope: entry.level_scope || 'district',
            sla_hours: entry.sla_hours || 24,
            description: entry.description || '',
            department_id: entry.department_id || '',
            is_active: entry.is_active !== undefined ? entry.is_active : true
        });
        setDialogOpen(true);
    };

    const handleDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this SLA matrix entry?')) {
            return;
        }

        try {
            const response = await fetch(`/api/efiling/sla/${id}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (response.ok) {
                toast({
                    title: "Success",
                    description: "SLA matrix entry deleted successfully"
                });
                loadSLAMatrix();
            } else {
                toast({
                    title: "Error",
                    description: result.error || "Failed to delete SLA matrix entry",
                    variant: "destructive"
                });
            }
        } catch (error) {
            console.error('Error deleting SLA matrix entry:', error);
            toast({
                title: "Error",
                description: "Failed to delete SLA matrix entry",
                variant: "destructive"
            });
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.from_role_code || !formData.to_role_code) {
            toast({
                title: "Error",
                description: "From Role and To Role are required",
                variant: "destructive"
            });
            return;
        }

        if (!formData.sla_hours || formData.sla_hours < 0) {
            toast({
                title: "Error",
                description: "SLA Hours must be a positive number",
                variant: "destructive"
            });
            return;
        }

        try {
            const url = editingEntry 
                ? `/api/efiling/sla/${editingEntry.id}`
                : '/api/efiling/sla';
            const method = editingEntry ? 'PUT' : 'POST';

            const requestBody = {
                from_role_code: formData.from_role_code,
                to_role_code: formData.to_role_code,
                level_scope: formData.level_scope,
                sla_hours: parseFloat(formData.sla_hours),
                description: formData.description || null,
                department_id: formData.department_id || null,
                is_active: formData.is_active
            };

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            const result = await response.json();

            if (response.ok) {
                toast({
                    title: "Success",
                    description: editingEntry ? "SLA matrix entry updated successfully" : "SLA matrix entry created successfully"
                });
                setDialogOpen(false);
                loadSLAMatrix();
            } else {
                toast({
                    title: "Error",
                    description: result.error || "Failed to save SLA matrix entry",
                    variant: "destructive"
                });
            }
        } catch (error) {
            console.error('Error saving SLA matrix entry:', error);
            toast({
                title: "Error",
                description: "Failed to save SLA matrix entry",
                variant: "destructive"
            });
        }
    };

    if (loading) {
        return (
            <div className="container mx-auto py-6">
                <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
                        <p className="text-gray-600">Loading SLA matrix...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto py-6">
            <div className="flex items-center justify-between mb-6">
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
                        <h1 className="text-2xl font-bold">SLA Matrix</h1>
                        <p className="text-sm text-gray-600">Manage SLA matrix entries for role-based routing</p>
                    </div>
                </div>
                
                <Button onClick={handleCreate} className="flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Add SLA Matrix Entry
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Clock className="w-5 h-5" />
                        SLA Matrix Entries
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {slaEntries.length === 0 ? (
                        <div className="text-center py-12">
                            <Clock className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                            <p className="text-gray-600">No SLA matrix entries found</p>
                            <Button onClick={handleCreate} className="mt-4">
                                Create First Entry
                            </Button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="border-b">
                                        <th className="p-3 text-left font-semibold">From Role</th>
                                        <th className="p-3 text-left font-semibold">To Role</th>
                                        <th className="p-3 text-left font-semibold">Level Scope</th>
                                        <th className="p-3 text-left font-semibold">SLA Hours</th>
                                        <th className="p-3 text-left font-semibold">Department</th>
                                        <th className="p-3 text-left font-semibold">Description</th>
                                        <th className="p-3 text-left font-semibold">Status</th>
                                        <th className="p-3 text-left font-semibold">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {slaEntries.map((entry) => (
                                        <tr key={entry.id} className="border-b hover:bg-gray-50">
                                            <td className="p-3 font-medium">
                                                {entry.from_role_code}
                                            </td>
                                            <td className="p-3 font-medium">
                                                {entry.to_role_code}
                                            </td>
                                            <td className="p-3">
                                                <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-800">
                                                    {entry.level_scope}
                                                </span>
                                            </td>
                                            <td className="p-3">
                                                <span className="font-medium">{entry.sla_hours} hrs</span>
                                            </td>
                                            <td className="p-3">
                                                {entry.department_name ? (
                                                    <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-800">
                                                        {entry.department_name}
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-800">
                                                        Global
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-3 text-sm text-gray-600">
                                                {entry.description || '-'}
                                            </td>
                                            <td className="p-3">
                                                <span className={`px-2 py-1 text-xs rounded ${
                                                    entry.is_active 
                                                        ? 'bg-green-100 text-green-800' 
                                                        : 'bg-gray-100 text-gray-800'
                                                }`}>
                                                    {entry.is_active ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td className="p-3">
                                                <div className="flex gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleEdit(entry)}
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleDelete(entry.id)}
                                                    >
                                                        <Trash2 className="w-4 h-4 text-red-600" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Create/Edit Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {editingEntry ? 'Edit SLA Matrix Entry' : 'Create SLA Matrix Entry'}
                        </DialogTitle>
                        <DialogDescription>
                            {editingEntry 
                                ? 'Update the SLA matrix entry configuration'
                                : 'Create a new SLA matrix entry for role-based routing'}
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="from_role_code">From Role Code *</Label>
                                <Input
                                    id="from_role_code"
                                    value={formData.from_role_code}
                                    onChange={(e) => handleInputChange('from_role_code', e.target.value.toUpperCase())}
                                    placeholder="e.g., CEO"
                                    required
                                />
                            </div>
                            <div>
                                <Label htmlFor="to_role_code">To Role Code *</Label>
                                <Input
                                    id="to_role_code"
                                    value={formData.to_role_code}
                                    onChange={(e) => handleInputChange('to_role_code', e.target.value.toUpperCase())}
                                    placeholder="e.g., DIRECTOR"
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="level_scope">Level Scope *</Label>
                                <Select
                                    value={formData.level_scope}
                                    onValueChange={(value) => handleInputChange('level_scope', value)}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="district">District</SelectItem>
                                        <SelectItem value="division">Division</SelectItem>
                                        <SelectItem value="global">Global</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label htmlFor="sla_hours">SLA Hours *</Label>
                                <Input
                                    id="sla_hours"
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    value={formData.sla_hours}
                                    onChange={(e) => handleInputChange('sla_hours', parseFloat(e.target.value) || 0)}
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <Label htmlFor="department_id">Department (Optional)</Label>
                            <Select
                                value={formData.department_id ? formData.department_id.toString() : "none"}
                                onValueChange={(value) => handleInputChange('department_id', value === "none" ? null : parseInt(value))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select department (optional)">
                                        {formData.department_id ? departments.find(d => d.id == formData.department_id)?.name : "Global Entry"}
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Global Entry (No Department)</SelectItem>
                                    {departments.map((dept) => (
                                        <SelectItem key={dept.id} value={dept.id.toString()}>
                                            {dept.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-gray-500 mt-1">
                                Leave as "Global Entry" for entries that apply to all departments, or select a specific department
                            </p>
                        </div>

                        <div>
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                value={formData.description}
                                onChange={(e) => handleInputChange('description', e.target.value)}
                                placeholder="Optional description of the SLA matrix entry"
                                rows={3}
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="is_active"
                                checked={formData.is_active}
                                onChange={(e) => handleInputChange('is_active', e.target.checked)}
                                className="w-4 h-4"
                            />
                            <Label htmlFor="is_active" className="cursor-pointer">Active</Label>
                        </div>

                        <div className="flex justify-end gap-2 pt-4">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setDialogOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                className="flex items-center gap-2"
                            >
                                <Save className="w-4 h-4" />
                                {editingEntry ? 'Update' : 'Create'}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
