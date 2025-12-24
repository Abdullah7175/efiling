"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Filter, Shield, Edit, Trash2, Eye } from "lucide-react";
import Link from "next/link";

export default function PermissionsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const { toast } = useToast();
    
    const [permissions, setPermissions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterResource, setFilterResource] = useState("all");
    const [filterAction, setFilterAction] = useState("all");

    useEffect(() => {
        if (status === "loading") return;
        
        if (!session) {
            router.push("/login");
            return;
        }

        loadPermissions();
    }, [session, status, router]);

    const loadPermissions = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/efiling/permissions');
            if (response.ok) {
                const data = await response.json();
                setPermissions(data.permissions || []);
            } else {
                throw new Error('Failed to load permissions');
            }
        } catch (error) {
            console.error('Error loading permissions:', error);
            toast({
                title: "Error",
                description: "Failed to load permissions",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleDeletePermission = async (id) => {
        if (!confirm('Are you sure you want to delete this permission?')) return;
        
        try {
            const response = await fetch(`/api/efiling/permissions/${id}`, {
                method: 'DELETE',
            });
            
            if (response.ok) {
                toast({
                    title: "Success",
                    description: "Permission deleted successfully",
                });
                loadPermissions();
            } else {
                throw new Error('Failed to delete permission');
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to delete permission",
                variant: "destructive",
            });
        }
    };

    const filteredPermissions = permissions.filter(permission => {
        const matchesSearch = permission.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            permission.description?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesResource = filterResource === "all" || permission.resource_type === filterResource;
        const matchesAction = filterAction === "all" || permission.action === filterAction;
        
        return matchesSearch && matchesResource && matchesAction;
    });

    const resourceTypes = [...new Set(permissions.map(p => p.resource_type))];
    const actions = [...new Set(permissions.map(p => p.action))];

    if (status === "loading") {
        return <div>Loading...</div>;
    }

    if (!session) {
        return null;
    }

    return (
        <div className="container mx-auto py-6 px-4">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        <Shield className="w-8 h-8" />
                        Permissions Management
                    </h1>
                    <p className="text-gray-600 mt-2">
                        Manage system permissions and access control
                    </p>
                </div>
                <Link href="/efiling/permissions/create">
                    <Button className="flex items-center gap-2">
                        <Plus className="w-4 h-4" />
                        Create Permission
                    </Button>
                </Link>
            </div>

            {/* Filters and Search */}
            <Card className="mb-6">
                <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <Input
                                placeholder="Search permissions..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        
                        <Select value={filterResource} onValueChange={setFilterResource}>
                            <SelectTrigger>
                                <SelectValue placeholder="Resource Type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Resource Types</SelectItem>
                                {resourceTypes.map(type => (
                                    <SelectItem key={type} value={type}>
                                        {type.charAt(0).toUpperCase() + type.slice(1)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        
                        <Select value={filterAction} onValueChange={setFilterAction}>
                            <SelectTrigger>
                                <SelectValue placeholder="Action" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Actions</SelectItem>
                                {actions.map(action => (
                                    <SelectItem key={action} value={action}>
                                        {action.charAt(0).toUpperCase() + action.slice(1)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        
                        <Button
                            variant="outline"
                            onClick={() => {
                                setSearchTerm("");
                                setFilterResource("all");
                                setFilterAction("all");
                            }}
                        >
                            Clear Filters
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Permissions Table */}
            <Card>
                <CardHeader>
                    <CardTitle>System Permissions</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="text-center py-8">Loading permissions...</div>
                    ) : filteredPermissions.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            No permissions found
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Permission Name</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead>Resource Type</TableHead>
                                    <TableHead>Action</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredPermissions.map((permission) => (
                                    <TableRow key={permission.id}>
                                        <TableCell className="font-medium">
                                            {permission.name}
                                        </TableCell>
                                        <TableCell>
                                            {permission.description || "No description"}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline">
                                                {permission.resource_type}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="secondary">
                                                {permission.action}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={permission.is_active ? "default" : "destructive"}>
                                                {permission.is_active ? "Active" : "Inactive"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Link href={`/efiling/permissions/${permission.id}`}>
                                                    <Button variant="outline" size="sm">
                                                        <Eye className="w-4 h-4" />
                                                    </Button>
                                                </Link>
                                                <Link href={`/efiling/permissions/${permission.id}/edit`}>
                                                    <Button variant="outline" size="sm">
                                                        <Edit className="w-4 h-4" />
                                                    </Button>
                                                </Link>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleDeletePermission(permission.id)}
                                                    className="text-red-600 hover:text-red-700"
                                                >
                                                    <Trash2 className="w-4 h-4" />
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
        </div>
    );
}

