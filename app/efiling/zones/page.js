"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Edit2, Loader2, MapPin, RefreshCw, Save, Trash2, X } from "lucide-react";

const initialForm = {
    name: "",
    ce_type: "",
    description: "",
    is_active: true,
};

export default function ZonesManagementPage() {
    const { data: session } = useSession();
    const { toast } = useToast();
    const [zones, setZones] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(initialForm);
    const [editingId, setEditingId] = useState(null);
    const [districts, setDistricts] = useState([]);
    const [towns, setTowns] = useState([]);
    const [selectedTownIds, setSelectedTownIds] = useState([]);

    const canManage = useMemo(() => {
        const role = Number(session?.user?.role);
        return role === 1 || role === 2;
    }, [session?.user?.role]);

    useEffect(() => {
        fetchReferenceData();
        fetchZones();
    }, []);

    const parseList = (payload) => {
        if (!payload) return [];
        if (Array.isArray(payload)) return payload;
        if (Array.isArray(payload?.data)) return payload.data;
        if (Array.isArray(payload?.rows)) return payload.rows;
        if (Array.isArray(payload?.districts)) return payload.districts;
        if (Array.isArray(payload?.towns)) return payload.towns;
        return [];
    };

    const fetchReferenceData = async () => {
        try {
            const [districtRes, townRes] = await Promise.all([
                fetch('/api/districts?limit=1000'),
                fetch('/api/towns?limit=1000'),
            ]);

            if (districtRes.ok) {
                const data = await districtRes.json();
                const list = parseList(data);
                setDistricts(list);
            }
            if (townRes.ok) {
                const data = await townRes.json();
                const list = parseList(data);
                setTowns(list);
            }
        } catch (error) {
            console.error('Failed to load reference data', error);
            toast({
                title: 'Error',
                description: 'Unable to load district/town lists',
                variant: 'destructive',
            });
        }
    };

    const fetchZones = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/efiling/zones");
            if (!res.ok) throw new Error("Failed to load zones");
            const data = await res.json();
            setZones(Array.isArray(data?.zones) ? data.zones : []);
        } catch (error) {
            console.error(error);
            toast({
                title: "Error",
                description: "Unable to load zones",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setForm(initialForm);
        setEditingId(null);
        setSelectedTownIds([]);
    };

    const townLookup = useMemo(() => {
        const map = new Map();
        towns.forEach((town) => {
            map.set(town.id, town);
        });
        return map;
    }, [towns]);

    const townsByDistrict = useMemo(() => {
        const map = new Map();
        towns.forEach((town) => {
            const list = map.get(town.district_id) || [];
            list.push(town);
            map.set(town.district_id, list);
        });
        return map;
    }, [towns]);

    const toggleTown = (townId, checked) => {
        setSelectedTownIds((prev) => {
            const set = new Set(prev);
            if (checked) {
                set.add(townId);
            } else {
                set.delete(townId);
            }
            return Array.from(set);
        });
    };

    const selectDistrictTowns = (districtId, include) => {
        const districtTowns = townsByDistrict.get(districtId) || [];
        setSelectedTownIds((prev) => {
            const set = new Set(prev);
            districtTowns.forEach((town) => {
                if (include) set.add(town.id);
                else set.delete(town.id);
            });
            return Array.from(set);
        });
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!canManage) return;
        if (!form.name.trim()) {
            toast({
                title: "Validation",
                description: "Zone name is required",
                variant: "destructive",
            });
            return;
        }

        setSaving(true);
        try {
            const payload = {
                name: form.name.trim(),
                ce_type: form.ce_type.trim() || null,
                description: form.description.trim() || null,
                is_active: !!form.is_active,
                locations: selectedTownIds.map((townId) => {
                    const town = townLookup.get(townId);
                    return {
                        town_id: townId,
                        district_id: town?.district_id || null,
                    };
                }),
            };

            let response;
            if (editingId) {
                response = await fetch("/api/efiling/zones", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: editingId, ...payload }),
                });
            } else {
                response = await fetch("/api/efiling/zones", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            }

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error?.error || "Operation failed");
            }

            toast({
                title: "Success",
                description: editingId ? "Zone updated" : "Zone created",
            });
            resetForm();
            await fetchZones();
        } catch (error) {
            console.error(error);
            toast({
                title: "Error",
                description: error.message || "Unable to save zone",
                variant: "destructive",
            });
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (zone) => {
        setEditingId(zone.id);
        setForm({
            name: zone.name || "",
            ce_type: zone.ce_type || "",
            description: zone.description || "",
            is_active: zone.is_active,
        });
    };

    useEffect(() => {
        if (!editingId) return;
        const zone = zones.find((item) => item.id === editingId);
        if (!zone) return;
        const townIds = new Set();
        const districtOnly = [];
        (zone.locations || []).forEach((loc) => {
            if (loc.town_id) {
                townIds.add(loc.town_id);
            } else if (loc.district_id) {
                districtOnly.push(loc.district_id);
            }
        });
        districtOnly.forEach((districtId) => {
            const districtTowns = townsByDistrict.get(districtId) || [];
            districtTowns.forEach((town) => townIds.add(town.id));
        });
        const next = Array.from(townIds);
        setSelectedTownIds((prev) => {
            if (prev.length === next.length && prev.every((id) => next.includes(id))) {
                return prev;
            }
            return next;
        });
    }, [editingId, zones, townsByDistrict]);

    const handleDelete = async (id) => {
        if (!canManage) return;
        if (!confirm("Delete this zone?")) return;
        try {
            const res = await fetch(`/api/efiling/zones?id=${id}`, { method: "DELETE" });
            if (!res.ok) {
                const error = await res.json().catch(() => ({}));
                throw new Error(error?.error || "Failed to delete zone");
            }
            toast({ title: "Deleted", description: "Zone removed" });
            if (editingId === id) resetForm();
            await fetchZones();
        } catch (error) {
            console.error(error);
            toast({
                title: "Error",
                description: error.message || "Unable to delete zone",
                variant: "destructive",
            });
        }
    };

    return (
        <div className="container mx-auto px-4 py-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                        <MapPin className="w-7 h-7 text-blue-600" /> Zones Management
                    </h1>
                    <p className="text-gray-600">
                        Configure KW&SC zones to drive geographic routing.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={fetchZones} disabled={loading}>
                        <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                        Refresh
                    </Button>
                </div>
            </div>

            {canManage ? (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            {editingId ? "Edit Zone" : "Add New Zone"}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Zone Name
                                    </label>
                                    <Input
                                        value={form.name}
                                        onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                                        placeholder="e.g. Zone-I (Korangi / Malir)"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        CE Type (optional)
                                    </label>
                                    <Input
                                        value={form.ce_type}
                                        onChange={(e) => setForm((prev) => ({ ...prev, ce_type: e.target.value }))}
                                        placeholder="e.g. Water & Sewerage"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Description (optional)
                                </label>
                                <Textarea
                                    value={form.description}
                                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                                    rows={3}
                                    placeholder="Provide additional context for this zone"
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="zone-active"
                                    checked={form.is_active}
                                    onCheckedChange={(checked) =>
                                        setForm((prev) => ({ ...prev, is_active: Boolean(checked) }))
                                    }
                                />
                                <label htmlFor="zone-active" className="text-sm text-gray-700">
                                    Zone is active
                                </label>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Covered Towns
                                </label>
                                <div className="max-h-72 overflow-y-auto border rounded-md p-4 space-y-4">
                                    {districts.map((district) => {
                                        const districtTowns = townsByDistrict.get(district.id) || [];
                                        if (districtTowns.length === 0) return null;
                                        const allSelected = districtTowns.every((town) => selectedTownIds.includes(town.id));
                                        const partiallySelected = !allSelected && districtTowns.some((town) => selectedTownIds.includes(town.id));
                                        return (
                                            <div key={district.id}>
                                                <div className="flex items-center justify-between text-sm font-semibold text-gray-700">
                                                    <span>{district.title || district.name}</span>
                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-blue-600 hover:text-blue-700"
                                                            onClick={() => selectDistrictTowns(district.id, true)}
                                                        >
                                                            Select All
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-gray-500 hover:text-gray-700"
                                                            onClick={() => selectDistrictTowns(district.id, false)}
                                                        >
                                                            Clear
                                                        </Button>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                                                    {districtTowns.map((town) => (
                                                        <label key={town.id} className="flex items-center gap-2 text-sm text-gray-700">
                                                            <Checkbox
                                                                checked={selectedTownIds.includes(town.id)}
                                                                onCheckedChange={(checked) => toggleTown(town.id, Boolean(checked))}
                                                            />
                                                            <span>{town.town || town.name}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                                {partiallySelected && <p className="text-xs text-yellow-600 mt-1">Partial selection</p>}
                                            </div>
                                        );
                                    })}
                                    {districts.length === 0 && (
                                        <p className="text-sm text-gray-500">No districts/towns found.</p>
                                    )}
                                </div>
                                {selectedTownIds.length > 0 && (
                                    <p className="text-sm text-gray-600 mt-2">
                                        Selected towns: {selectedTownIds.length}
                                    </p>
                                )}
                            </div>

                            <div className="flex items-center gap-2">
                                <Button type="submit" disabled={saving}>
                                    {saving ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving
                                        </>
                                    ) : (
                                        <>
                                            <Save className="w-4 h-4 mr-2" /> {editingId ? "Update Zone" : "Create Zone"}
                                        </>
                                    )}
                                </Button>
                                {editingId && (
                                    <Button type="button" variant="outline" onClick={resetForm}>
                                        <X className="w-4 h-4 mr-2" /> Cancel Edit
                                    </Button>
                                )}
                            </div>
                        </form>
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardContent className="py-6 text-gray-600">
                        You have read-only access to zone definitions.
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Registered Zones ({zones.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center h-40 text-gray-600">
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Loading zones...
                        </div>
                    ) : zones.length === 0 ? (
                        <div className="text-center text-gray-500 py-10">
                            <MapPin className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                            No zones configured yet.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>CE Type</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead>Coverage</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="w-32">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {zones.map((zone) => (
                                        <TableRow key={zone.id}>
                                            <TableCell className="font-medium">{zone.name}</TableCell>
                                            <TableCell>{zone.ce_type || "-"}</TableCell>
                                            <TableCell className="max-w-md">
                                                {zone.description ? (
                                                    <span className="text-gray-700">{zone.description}</span>
                                                ) : (
                                                    <span className="text-gray-400">No description</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="max-w-sm">
                                                <div className="flex flex-wrap gap-1">
                                                    {(zone.locations || []).slice(0, 6).map((loc, index) => (
                                                        <Badge key={`${zone.id}-${index}`} variant="outline" className="text-xs">
                                                            {loc.town_name || loc.district_name || 'Unknown'}
                                                        </Badge>
                                                    ))}
                                                    {(zone.locations || []).length > 6 && (
                                                        <Badge variant="secondary" className="text-xs">
                                                            +{(zone.locations || []).length - 6} more
                                                        </Badge>
                                                    )}
                                                    {(zone.locations || []).length === 0 && (
                                                        <span className="text-xs text-gray-500">No towns assigned</span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={zone.is_active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                                                    {zone.is_active ? "Active" : "Inactive"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    {canManage && (
                                                        <>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => handleEdit(zone)}
                                                            >
                                                                <Edit2 className="w-4 h-4" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="text-red-600 hover:text-red-700"
                                                                onClick={() => handleDelete(zone.id)}
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

