"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { X, Plus, Save, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import TipTapEditor from "@/app/efiling/components/TipTapEditor";

export default function CreateDaakPage() {
    const router = useRouter();
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [categories, setCategories] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [roles, setRoles] = useState([]);
    const [roleGroups, setRoleGroups] = useState([]);
    const [teams, setTeams] = useState([]);
    const [users, setUsers] = useState([]);

    const [formData, setFormData] = useState({
        subject: "",
        content: "",
        category_id: "",
        priority: "NORMAL",
        department_id: "",
        role_id: "",
        is_urgent: false,
        is_public: false,
        expires_at: "",
    });

    const [recipients, setRecipients] = useState([]);
    const [showRecipientModal, setShowRecipientModal] = useState(false);
    const [recipientType, setRecipientType] = useState("USER");
    const [recipientOptions, setRecipientOptions] = useState([]);
    const [selectedRecipientId, setSelectedRecipientId] = useState("");

    useEffect(() => {
        fetchCategories();
        fetchDepartments();
        fetchRoles();
        fetchRoleGroups();
        fetchTeams();
        fetchUsers();
    }, []);

    useEffect(() => {
        if (recipientType === "USER") {
            setRecipientOptions(users.map(u => ({ id: u.id, name: u.designation || u.employee_id || `User ${u.id}`, designation: u.designation })));
        } else if (recipientType === "ROLE") {
            setRecipientOptions(roles.map(r => ({ id: r.id, name: r.name, title: r.name })));
        } else if (recipientType === "ROLE_GROUP") {
            setRecipientOptions(roleGroups.map(rg => ({ id: rg.id, name: rg.name, title: rg.name })));
        } else if (recipientType === "TEAM") {
            setRecipientOptions(teams);
        } else if (recipientType === "DEPARTMENT") {
            setRecipientOptions(departments.map(d => ({ id: d.id, name: d.name, title: d.name })));
        } else if (recipientType === "EVERYONE") {
            setRecipientOptions([]);
        }
    }, [recipientType, users, roles, roleGroups, teams, departments]);

    const fetchCategories = async () => {
        try {
            const res = await fetch("/api/efiling/daak/categories");
            if (res.ok) {
                const data = await res.json();
                setCategories(data.categories || []);
            }
        } catch (error) {
            console.error("Error fetching categories:", error);
        }
    };

    const fetchDepartments = async () => {
        try {
            const res = await fetch("/api/efiling/departments");
            if (res.ok) {
                const data = await res.json();
                // API returns array directly, not wrapped in object
                setDepartments(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            console.error("Error fetching departments:", error);
        }
    };

    const fetchRoles = async () => {
        try {
            const res = await fetch("/api/efiling/roles");
            if (res.ok) {
                const data = await res.json();
                // API returns { success: true, roles: [...] }
                setRoles(data.roles || []);
            }
        } catch (error) {
            console.error("Error fetching roles:", error);
        }
    };

    const fetchRoleGroups = async () => {
        try {
            const res = await fetch("/api/efiling/role-groups");
            if (res.ok) {
                const data = await res.json();
                // API returns { success: true, roleGroups: [...] }
                setRoleGroups(data.roleGroups || []);
            }
        } catch (error) {
            console.error("Error fetching role groups:", error);
        }
    };

    const fetchTeams = async () => {
        try {
            // Teams API returns team_members for a manager, but we need all managers/teams
            // Let's fetch all efiling_users who are managers (have team members)
            const res = await fetch("/api/efiling/users?is_active=true");
            if (res.ok) {
                const data = await res.json();
                // Get all users who could be managers (we'll use all active users as potential teams)
                const users = Array.isArray(data) ? data : [];
                // For now, treat each user as a potential team manager
                // In a real scenario, you'd query efiling_user_teams to get actual teams
                setTeams(users.map(u => ({ id: u.id, name: u.designation || u.employee_id || `User ${u.id}`, title: u.designation })));
            }
        } catch (error) {
            console.error("Error fetching teams:", error);
        }
    };

    const fetchUsers = async () => {
        try {
            const res = await fetch("/api/efiling/users?is_active=true");
            if (res.ok) {
                const data = await res.json();
                // API returns array directly, not wrapped in object
                setUsers(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            console.error("Error fetching users:", error);
        }
    };

    const addRecipient = () => {
        if (recipientType === "EVERYONE") {
            const exists = recipients.some((r) => r.type === "EVERYONE");
            if (!exists) {
                setRecipients([...recipients, { type: "EVERYONE", id: null, name: "Everyone" }]);
            }
        } else if (selectedRecipientId) {
            const option = recipientOptions.find((opt) => opt.id.toString() === selectedRecipientId);
            if (option) {
                const exists = recipients.some(
                    (r) => r.type === recipientType && r.id === option.id
                );
                if (!exists) {
                    setRecipients([
                        ...recipients,
                        {
                            type: recipientType,
                            id: option.id,
                            name: option.name || option.designation || option.title || "Unknown",
                        },
                    ]);
                }
            }
        }
        setSelectedRecipientId("");
        setShowRecipientModal(false);
    };

    const removeRecipient = (index) => {
        setRecipients(recipients.filter((_, i) => i !== index));
    };

    const handleSubmit = async (send = false) => {
        if (!formData.subject || !formData.content) {
            toast({
                title: "Error",
                description: "Subject and content are required",
                variant: "destructive",
            });
            return;
        }

        if (recipients.length === 0) {
            toast({
                title: "Error",
                description: "Please add at least one recipient",
                variant: "destructive",
            });
            return;
        }

        setLoading(true);
        try {
            const payload = {
                ...formData,
                category_id: formData.category_id || null,
                department_id: formData.department_id || null,
                role_id: formData.role_id || null,
                expires_at: formData.expires_at || null,
                recipients: recipients,
            };

            const res = await fetch("/api/efiling/daak", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                const data = await res.json();
                if (send) {
                    const sendRes = await fetch(`/api/efiling/daak/${data.daak.id}/send`, {
                        method: "POST",
                    });
                    if (sendRes.ok) {
                        toast({
                            title: "Success",
                            description: "Daak created and sent successfully",
                        });
                        router.push("/efiling/daak");
                    } else {
                        toast({
                            title: "Warning",
                            description: "Daak created but failed to send",
                            variant: "destructive",
                        });
                    }
                } else {
                    toast({
                        title: "Success",
                        description: "Daak created successfully",
                    });
                    router.push("/efiling/daak");
                }
            } else {
                const error = await res.json();
                toast({
                    title: "Error",
                    description: error.error || "Failed to create daak",
                    variant: "destructive",
                });
            }
        } catch (error) {
            console.error("Error creating daak:", error);
            toast({
                title: "Error",
                description: "Failed to create daak",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">Create Daak</h1>
                    <p className="text-gray-600 mt-1">Create a new daak/letter</p>
                </div>
                <Button variant="outline" onClick={() => router.back()}>
                    Cancel
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Daak Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label>Subject *</Label>
                            <Input
                                value={formData.subject}
                                onChange={(e) =>
                                    setFormData({ ...formData, subject: e.target.value })
                                }
                                placeholder="Enter daak subject"
                            />
                        </div>
                        <div>
                            <Label>Category</Label>
                            <Select
                                value={formData.category_id || undefined}
                                onValueChange={(value) =>
                                    setFormData({ ...formData, category_id: value === "none" ? "" : value })
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select category" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">None</SelectItem>
                                    {categories.map((cat) => (
                                        <SelectItem key={cat.id} value={cat.id.toString()}>
                                            {cat.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Priority</Label>
                            <Select
                                value={formData.priority}
                                onValueChange={(value) =>
                                    setFormData({ ...formData, priority: value })
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="LOW">Low</SelectItem>
                                    <SelectItem value="NORMAL">Normal</SelectItem>
                                    <SelectItem value="HIGH">High</SelectItem>
                                    <SelectItem value="URGENT">Urgent</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Expires At</Label>
                            <Input
                                type="datetime-local"
                                value={formData.expires_at}
                                onChange={(e) =>
                                    setFormData({ ...formData, expires_at: e.target.value })
                                }
                            />
                        </div>
                    </div>

                    <div className="col-span-2">
                        <Label className="text-base font-semibold mb-3 block">Content *</Label>
                        {/* A4 Page Container with scroll */}
                        <div className="bg-gray-100 p-4 md:p-8 rounded-lg border border-gray-200 overflow-auto" style={{ maxHeight: '85vh' }}>
                            <div className="bg-white border-2 border-gray-300 shadow-xl mx-auto w-full md:w-[210mm]" 
                                 style={{ 
                                     minHeight: '297mm', 
                                     padding: '20mm'
                                 }}>
                                <TipTapEditor
                                    value={formData.content}
                                    onChange={(value) =>
                                        setFormData({ ...formData, content: value })
                                    }
                                    placeholder="Start typing your daak content here..."
                                    className="min-h-[400px]"
                                />
                            </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-2 text-center italic">
                            A4 Document Format (210mm × 297mm)
                        </p>
                    </div>

                    <div className="flex gap-4">
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="urgent"
                                checked={formData.is_urgent}
                                onCheckedChange={(checked) =>
                                    setFormData({ ...formData, is_urgent: checked })
                                }
                            />
                            <Label htmlFor="urgent">Mark as Urgent</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="public"
                                checked={formData.is_public}
                                onCheckedChange={(checked) =>
                                    setFormData({ ...formData, is_public: checked })
                                }
                            />
                            <Label htmlFor="public">Make Public (visible to all)</Label>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle>Recipients</CardTitle>
                        <Button onClick={() => setShowRecipientModal(true)}>
                            <Plus className="w-4 h-4 mr-2" />
                            Add Recipient
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {recipients.length === 0 ? (
                        <p className="text-gray-500 text-center py-4">
                            No recipients added. Click "Add Recipient" to add recipients.
                        </p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {recipients.map((recipient, index) => (
                                <Badge key={index} variant="secondary" className="text-sm py-1 px-3">
                                    {recipient.name}
                                    <button
                                        onClick={() => removeRecipient(index)}
                                        className="ml-2 hover:text-red-500"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </Badge>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {showRecipientModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                    <Card className="bg-white p-6 rounded-lg w-full max-w-md">
                        <CardContent className="space-y-4">
                            <h3 className="text-lg font-semibold">Add Recipient</h3>
                            <div>
                                <Label>Recipient Type</Label>
                                <Select
                                    value={recipientType}
                                    onValueChange={setRecipientType}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="USER">User</SelectItem>
                                        <SelectItem value="ROLE">Role</SelectItem>
                                        <SelectItem value="ROLE_GROUP">Role Group</SelectItem>
                                        <SelectItem value="TEAM">Team</SelectItem>
                                        <SelectItem value="DEPARTMENT">Department</SelectItem>
                                        <SelectItem value="EVERYONE">Everyone</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {recipientType !== "EVERYONE" && (
                                <div>
                                    <Label>Select {recipientType.replace("_", " ")}</Label>
                                    <Select
                                        value={selectedRecipientId}
                                        onValueChange={setSelectedRecipientId}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder={`Select ${recipientType}`} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {recipientOptions.length > 0 ? (
                                                recipientOptions.map((opt) => (
                                                    <SelectItem
                                                        key={opt.id}
                                                        value={opt.id.toString()}
                                                    >
                                                        {opt.name || opt.designation || opt.title || `ID: ${opt.id}`}
                                                    </SelectItem>
                                                ))
                                            ) : (
                                                <SelectItem value="no-options" disabled>
                                                    No options available
                                                </SelectItem>
                                            )}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                            <div className="flex gap-2 justify-end">
                                <Button
                                    variant="outline"
                                    onClick={() => setShowRecipientModal(false)}
                                >
                                    Cancel
                                </Button>
                                <Button onClick={addRecipient}>Add</Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            <div className="flex justify-end gap-2">
                <Button
                    variant="outline"
                    onClick={() => handleSubmit(false)}
                    disabled={loading}
                >
                    <Save className="w-4 h-4 mr-2" />
                    Save Draft
                </Button>
                <Button onClick={() => handleSubmit(true)} disabled={loading}>
                    <Send className="w-4 h-4 mr-2" />
                    Create & Send
                </Button>
            </div>
        </div>
    );
}

