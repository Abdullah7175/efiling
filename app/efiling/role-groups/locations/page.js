"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Users, RefreshCw, Save, Trash2, X, Filter } from "lucide-react";

const initialForm = {
    role_group_id: "",
    zone_id: "",
    district_id: "",
    town_id: "",
    division_id: "",
};

export default function RoleGroupLocationsPage() {
    const { data: session } = useSession();
    const { toast } = useToast();

    const [locations, setLocations] = useState([]);
    const [roleGroups, setRoleGroups] = useState([]);
    const [zones, setZones] = useState([]);
    const [districts, setDistricts] = useState([]);
    const [towns, setTowns] = useState([]);
    const [divisions, setDivisions] = useState([]);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(initialForm);
    const [editingId, setEditingId] = useState(null);
    const [roleGroupFilter, setRoleGroupFilter] = useState("all");

    const canManage = useMemo(() => {
        const role = Number(session?.user?.role);
        return role === 1 || role === 2;
    }, [session?.user?.role]);

    useEffect(() => {
        loadReferenceData();
    }, []);

    useEffect(() => {
        fetchLocations();
    }, [roleGroupFilter]);

    const loadReferenceData = async () => {
        try {
            const [roleGroupRes, zoneRes, districtRes, townRes, divisionRes] = await Promise.all([
                fetch("/api/efiling/role-groups?is_active=true"),
                fetch("/api/efiling/zones?is_active=true"),
                fetch("/api/districts?limit=1000"),
                fetch("/api/towns?limit=1000"),
                fetch("/api/efiling/divisions?is_active=true"),
            ]);

            const roleGroupData = await roleGroupRes.json();
            setRoleGroups(Array.isArray(roleGroupData?.roleGroups) ? roleGroupData.roleGroups : []);

            const zoneData = await zoneRes.json();
            setZones(Array.isArray(zoneData?.zones) ? zoneData.zones : []);

            const districtData = await districtRes.json();
            setDistricts(Array.isArray(districtData?.data) ? districtData.data : Array.isArray(districtData) ? districtData : []);

            const townData = await townRes.json();
            setTowns(Array.isArray(townData?.data) ? townData.data : Array.isArray(townData) ? townData : []);

            const divisionData = await divisionRes.json();
            setDivisions(Array.isArray(divisionData?.divisions) ? divisionData.divisions : []);
        } catch (error) {
            console.error("Failed to load reference data", error);
            toast({
                title: "Error",
                description: "Unable to load reference data",
                variant: "destructive",
            });
        }
    };

    const fetchLocations = async () => {
        setLoading(true);
        try {
            const url = roleGroupFilter !== "all"
                ? `/api/efiling/role-groups/locations?role_group_id=${roleGroupFilter}`
                : "/api/efiling/role-groups/locations";
            const res = await fetch(url);
            if (!res.ok) throw new Error("Failed to load role group locations");
            const data = await res.json();
            setLocations(Array.isArray(data?.locations) ? data.locations : []);
        } catch (error) {
            console.error(error);
            toast({
                title: "Error",
                description: "Unable to load role group locations",
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

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!canManage) return;

        if (!form.role_group_id) {
            toast({
                title: "Validation",
                description: "Select a role group",
                variant: "destructive",
            });
            return;
        }

        if (!form.zone_id && !form.district_id && !form.town_id && !form.division_id) {
            toast({
                title: "Validation",
                description: "Select at least one geographic scope",
                variant: "destructive",
            });
            return;
        }

        setSaving(true);
        try {
            const payload = {
                role_group_id: Number(form.role_group_id),
                zone_id: form.zone_id ? Number(form.zone_id) : null,
                district_id: form.district_id ? Number(form.district_id) : null,
                town_id: form.town_id ? Number(form.town_id) : null,
                division_id: form.division_id ? Number(form.division_id) : null,
            };

            const response = await fetch("/api/efiling/role-groups/locations", {
                method: editingId ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error?.error || "Unable to save mapping");
            }

            toast({
                title: "Success",
                description: editingId ? "Role group mapping updated" : "Role group mapping created",
            });
            resetForm();
            await fetchLocations();
        } catch (error) {
            console.error(error);
            toast({
                title: "Error",
                description: error.message || "Unable to save mapping",
                variant: "destructive",
            });
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (location) => {
        setEditingId(location.id);
        setForm({
            role_group_id: location.role_group_id?.toString() || "",
            zone_id: location.zone_id?.toString() || "",
            district_id: location.district_id?.toString() || "",
            town_id: location.town_id?.toString() || "",
            division_id: location.division_id?.toString() || "",
        });
    };

    const handleDelete = async (id) => {
        if (!canManage) return;
        if (!confirm("Delete this role group mapping?")) return;

        try {
            const res = await fetch(`/api/efiling/role-groups/locations?id=${id}`, { method: "DELETE" });
            if (!res.ok) {
                const error = await res.json().catch(() => ({}));
                throw new Error(error?.error || "Failed to delete mapping");
            }
            toast({ title: "Deleted", description: "Role group mapping removed" });
            if (editingId === id) resetForm();
            await fetchLocations();
        } catch (error) {
            console.error(error);
            toast({
                title: "Error",
                description: error.message || "Unable to delete mapping",
                variant: "destructive",
            });
        }
    };

    const filteredTowns = useMemo(() => {
        if (!form.district_id) return towns;
        const districtId = Number(form.district_id);
        return towns.filter((town) => Number(town.district_id) === districtId);
    }, [towns, form.district_id]);

    const roleGroupOptions = useMemo(() => {
        return [...roleGroups].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }, [roleGroups]);

    return (
        <div className="container mx-auto px-4 py-6 space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                        <Users className="w-7 h-7 text-blue-600" /> Role Group Location Mappings
                    </h1>
                    <p className="text-gray-600">
                        Keep role groups scoped to the correct geography for dashboards and filters.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Select value={roleGroupFilter} onValueChange={setRoleGroupFilter}>
                        <SelectTrigger className="w-52">
                            <SelectValue placeholder="Filter by role group" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Role Groups</SelectItem>
                            {roleGroupOptions.map((group) => (
                                <SelectItem key={group.id} value={group.id.toString()}>
                                    {group.name} {group.code ? `(${group.code})` : ""}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button variant="outline" onClick={fetchLocations} disabled={loading}>
                        <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                        Refresh
                    </Button>
                </div>
            </div>

            {canManage ? (
                <Card>
                    <CardHeader>
                        <CardTitle>{editingId ? "Edit Mapping" : "Create Mapping"}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form className="space-y-4" onSubmit={handleSubmit}>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Role Group</label>
                                    <Select
                                        value={form.role_group_id}
                                        onValueChange={(value) => setForm((prev) => ({ ...prev, role_group_id: value }))}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select role group" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {roleGroupOptions.map((group) => (
                                                <SelectItem key={group.id} value={group.id.toString()}>
                                                    {group.name} {group.code ? `(${group.code})` : ""}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Zone (optional)</label>
                                    <Select
                                        value={form.zone_id || "none"}
                                        onValueChange={(value) =>
                                            setForm((prev) => ({ ...prev, zone_id: value === "none" ? "" : value }))
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select zone" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">No zone restriction</SelectItem>
                                            {zones.map((zone) => (
                                                <SelectItem key={zone.id} value={zone.id.toString()}>
                                                    {zone.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Division (optional)</label>
                                    <Select
                                        value={form.division_id || "none"}
                                        onValueChange={(value) =>
                                            setForm((prev) => ({ ...prev, division_id: value === "none" ? "" : value }))
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select division" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">No division restriction</SelectItem>
                                            {divisions.map((division) => (
                                                <SelectItem key={division.id} value={division.id.toString()}>
                                                    {division.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">District (optional)</label>
                                    <Select
                                        value={form.district_id || "none"}
                                        onValueChange={(value) =>
                                            setForm((prev) => ({
                                                ...prev,
                                                district_id: value === "none" ? "" : value,
                                                town_id: "",
                                            }))
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select district" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">No district restriction</SelectItem>
                                            {districts.map((district) => (
                                                <SelectItem key={district.id} value={district.id.toString()}>
                                                    {district.title}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Town (optional)</label>
                                    <Select
                                        value={form.town_id || "none"}
                                        onValueChange={(value) =>
                                            setForm((prev) => ({ ...prev, town_id: value === "none" ? "" : value }))
                                        }
                                        disabled={!form.district_id && filteredTowns.length === 0}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select town" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">No town restriction</SelectItem>
                                            {filteredTowns.map((town) => (
                                                <SelectItem key={town.id} value={town.id.toString()}>
                                                    {town.town}{town.subtown ? ` (${town.subtown})` : ""}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <Button type="submit" disabled={saving}>
                                    {saving ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving
                                        </>
                                    ) : (
                                        <>
                                            <Save className="w-4 h-4 mr-2" /> {editingId ? "Update Mapping" : "Create Mapping"}
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
                        You have read-only access to role group location mappings.
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader className="flex items-center justify-between">
                    <CardTitle>Role Group Mappings ({locations.length})</CardTitle>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Filter className="w-4 h-4" />
                        {roleGroupFilter === "all" ? "All role groups" : "Filtered by role group"}
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center h-40 text-gray-600">
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Loading mappings...
                        </div>
                    ) : locations.length === 0 ? (
                        <div className="text-center text-gray-500 py-10">
                            No role group location mappings configured.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Role Group</TableHead>
                                        <TableHead>Zone</TableHead>
                                        <TableHead>Division</TableHead>
                                        <TableHead>District</TableHead>
                                        <TableHead>Town</TableHead>
                                        <TableHead className="w-28">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {locations.map((loc) => (
                                        <TableRow key={loc.id}>
                                            <TableCell>
                                                <div className="font-medium">{loc.role_group_name || "-"}</div>
                                                <div className="text-xs text-gray-500">{loc.role_group_code}</div>
                                            </TableCell>
                                            <TableCell>{loc.zone_name || <span className="text-gray-400">All zones</span>}</TableCell>
                                            <TableCell>{loc.division_name || <span className="text-gray-400">All divisions</span>}</TableCell>
                                            <TableCell>{loc.district_name || <span className="text-gray-400">All districts</span>}</TableCell>
                                            <TableCell>{loc.town_name || <span className="text-gray-400">All towns</span>}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    {canManage && (
                                                        <>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => handleEdit(loc)}
                                                            >
                                                                Edit
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="text-red-600 hover:text-red-700"
                                                                onClick={() => handleDelete(loc.id)}
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

