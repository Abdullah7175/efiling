"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Map, RefreshCw, Save, Trash2, Edit2 } from "lucide-react";

const NONE_OPTION = "__none";

const initialForm = {
    id: null,
    name: "",
    code: "",
    ce_type: "",
    department_id: "",
    description: "",
    is_active: true,
};

export default function DivisionsPage() {
    const { data: session } = useSession();
    const { toast } = useToast();

    const [divisions, setDivisions] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(initialForm);
    const [editingId, setEditingId] = useState(null);

    const canManage = useMemo(() => {
        const role = Number(session?.user?.role);
        return role === 1 || role === 2;
    }, [session?.user?.role]);

    useEffect(() => {
        if (!session?.user?.id) return;
        loadReferenceData();
        fetchDivisions();
    }, [session?.user?.id]);

    const loadReferenceData = async () => {
        try {
            const res = await fetch("/api/efiling/departments?is_active=true");
            if (res.ok) {
                const data = await res.json();
                setDepartments(Array.isArray(data) ? data : data?.departments || []);
            }
        } catch (error) {
            console.error("Failed to load departments", error);
            toast({
                title: "Error",
                description: "Unable to load departments",
                variant: "destructive",
            });
        }
    };

    const fetchDivisions = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/efiling/divisions");
            if (!res.ok) throw new Error("Failed to fetch divisions");
            const data = await res.json();
            setDivisions(Array.isArray(data?.divisions) ? data.divisions : []);
        } catch (error) {
            console.error(error);
            toast({
                title: "Error",
                description: "Unable to load divisions",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setForm(initialForm);
        setEditingId(null);
    };

    const onSubmit = async (event) => {
        event.preventDefault();
        if (!canManage) return;

        if (!form.name.trim()) {
            toast({ title: "Name is required", variant: "destructive" });
            return;
        }

        setSaving(true);
        try {
            const payload = {
                name: form.name.trim(),
                code: form.code.trim() || null,
                ce_type: form.ce_type.trim() || null,
                department_id: form.department_id ? Number(form.department_id) : null,
                description: form.description.trim() || null,
                is_active: !!form.is_active,
            };

            let response;
            if (editingId) {
                response = await fetch("/api/efiling/divisions", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: editingId, ...payload }),
                });
            } else {
                response = await fetch("/api/efiling/divisions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            }

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error?.error || "Operation failed");
            }

            toast({ title: "Success", description: editingId ? "Division updated" : "Division created" });
            resetForm();
            await fetchDivisions();
        } catch (error) {
            console.error(error);
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setSaving(false);
        }
    };

    const onEdit = (division) => {
        setEditingId(division.id);
        setForm({
            id: division.id,
            name: division.name || "",
            code: division.code || "",
            ce_type: division.ce_type || "",
            department_id: division.department_id ? division.department_id.toString() : "",
            description: division.description || "",
            is_active: division.is_active !== false,
        });
    };

    const onDelete = async (id) => {
        if (!canManage) return;
        if (!confirm("Delete this division? This cannot be undone.")) return;
        try {
            const res = await fetch(`/api/efiling/divisions?id=${id}`, { method: "DELETE" });
            if (!res.ok) {
                const error = await res.json().catch(() => ({}));
                throw new Error(error?.error || "Unable to delete division");
            }
            toast({ title: "Deleted", description: "Division removed" });
            if (editingId === id) resetForm();
            await fetchDivisions();
        } catch (error) {
            console.error(error);
            toast({ title: "Error", description: error.message, variant: "destructive" });
        }
    };

    const departmentOptions = useMemo(() => {
        return [...departments].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }, [departments]);

    return (
        <div className="container mx-auto px-4 py-6 space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                        <Map className="w-7 h-7 text-blue-600" /> Divisions
                    </h1>
                    <p className="text-gray-600">
                        Manage division-level organizational units used for routing and dashboards.
                    </p>
                </div>
                <Button variant="outline" onClick={fetchDivisions} disabled={loading}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                    Refresh
                </Button>
            </div>

            {canManage ? (
                <Card>
                    <CardHeader>
                        <CardTitle>{editingId ? "Edit Division" : "Create Division"}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form className="space-y-4" onSubmit={onSubmit}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Division Name</label>
                                    <Input
                                        value={form.name}
                                        onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                                        placeholder="e.g. Dhabeji Pumping Division"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Division Code</label>
                                    <Input
                                        value={form.code}
                                        onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
                                        placeholder="e.g. WB_DHABEJI"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">CE Type</label>
                                    <Input
                                        value={form.ce_type}
                                        onChange={(e) => setForm((prev) => ({ ...prev, ce_type: e.target.value }))}
                                        placeholder="e.g. Water Bulk E&M"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Owning Department</label>
                                    <Select
                                        value={form.department_id ? form.department_id : NONE_OPTION}
                                        onValueChange={(value) =>
                                            setForm((prev) => ({
                                                ...prev,
                                                department_id: value === NONE_OPTION ? "" : value,
                                            }))
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select department (optional)" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={NONE_OPTION}>No department</SelectItem>
                                            {departmentOptions.map((dept) => (
                                                <SelectItem key={dept.id} value={dept.id.toString()}>
                                                    {dept.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                                <Textarea
                                    rows={3}
                                    value={form.description}
                                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                                    placeholder="Optional additional details about this division"
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="division-active"
                                    checked={form.is_active}
                                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, is_active: Boolean(checked) }))}
                                />
                                <label htmlFor="division-active" className="text-sm text-gray-700">
                                    Division is active
                                </label>
                            </div>

                            <div className="flex items-center gap-2">
                                <Button type="submit" disabled={saving}>
                                    {saving ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving
                                        </>
                                    ) : (
                                        <>
                                            <Save className="w-4 h-4 mr-2" /> {editingId ? "Update Division" : "Create Division"}
                                        </>
                                    )}
                                </Button>
                                {editingId && (
                                    <Button type="button" variant="outline" onClick={resetForm}>
                                        Cancel
                                    </Button>
                                )}
                            </div>
                        </form>
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardContent className="py-6 text-gray-600">
                        You have read-only access to divisions.
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader className="flex items-center justify-between">
                    <CardTitle>Existing Divisions ({divisions.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center h-40 text-gray-600">
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Loading divisions...
                        </div>
                    ) : divisions.length === 0 ? (
                        <div className="text-center text-gray-500 py-10">
                            No divisions found.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Code</TableHead>
                                        <TableHead>CE Type</TableHead>
                                        <TableHead>Department</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="w-32">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {divisions.map((division) => (
                                        <TableRow key={division.id}>
                                            <TableCell className="font-medium">{division.name}</TableCell>
                                            <TableCell>{division.code || "-"}</TableCell>
                                            <TableCell>{division.ce_type || "-"}</TableCell>
                                            <TableCell>{division.department_name || "-"}</TableCell>
                                            <TableCell>
                                                <span className={`text-sm ${division.is_active ? "text-green-700" : "text-red-600"}`}>
                                                    {division.is_active ? "Active" : "Inactive"}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    {canManage && (
                                                        <>
                                                            <Button variant="outline" size="sm" onClick={() => onEdit(division)}>
                                                                <Edit2 className="w-4 h-4 mr-1" /> Edit
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="text-red-600 hover:text-red-700"
                                                                onClick={() => onDelete(division.id)}
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </Button>
                                                        </>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

