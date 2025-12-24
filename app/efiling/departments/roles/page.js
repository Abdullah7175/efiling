"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shield, Search, Filter, Plus, Edit, Trash2, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Pagination } from "@/components/ui/pagination";

export default function DepartmentRoles() {
    const { data: session } = useSession();
    const router = useRouter();
    const { toast } = useToast();
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(5);

    useEffect(() => {
        if (!session?.user?.id) return;
        fetchData();
    }, [session?.user?.id]);

    useEffect(() => {
        setCurrentPage(1); // Reset to first page when search changes
    }, [searchTerm]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const rolesRes = await fetch('/api/efiling/roles');
            const rolesData = await rolesRes.json();
            setRoles(rolesData.roles || []);
        } catch (error) {
            console.error('Error fetching data:', error);
            toast({
                title: "Error",
                description: "Failed to load department roles",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const filteredRoles = roles.filter(role =>
        role.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        role.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        role.department_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Calculate pagination
    const totalPages = Math.ceil(filteredRoles.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedRoles = filteredRoles.slice(startIndex, endIndex);

    const handlePageChange = (page) => {
        setCurrentPage(page);
    };

    const handleItemsPerPageChange = (newItemsPerPage) => {
        setItemsPerPage(newItemsPerPage);
        setCurrentPage(1);
    };

    const handleDeleteRole = async (roleId, roleName) => {
        if (!confirm(`Are you sure you want to delete role "${roleName}"?`)) {
            return;
        }

        try {
            const response = await fetch(`/api/efiling/roles?id=${roleId}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                toast({
                    title: "Success",
                    description: `Role "${roleName}" deleted successfully`,
                });
                fetchData(); // Refresh the list
            } else {
                const result = await response.json();
                throw new Error(result.error || 'Failed to delete role');
            }
        } catch (error) {
            toast({
                title: "Error",
                description: error.message || "Failed to delete role",
                variant: "destructive",
            });
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-lg">Loading department roles...</div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Department Roles</h1>
                    <p className="text-gray-600">Manage e-filing roles and permissions</p>
                </div>
                <Button onClick={() => router.push('/efiling/departments/roles/create')} className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Role
                </Button>
            </div>

            <Card className="mb-6">
                <CardHeader>
                    <CardTitle className="flex items-center">
                        <Filter className="w-5 h-5 mr-2" />
                        Search Roles
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <Input
                            placeholder="Search by role name, code, or department..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Department Roles ({filteredRoles.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    {filteredRoles.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <Shield className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                            <p>No department roles found</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Role Name</TableHead>
                                        <TableHead>Code</TableHead>
                                        <TableHead>Department</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginatedRoles.map((role) => (
                                        <TableRow key={role.id}>
                                            <TableCell className="font-medium">{role.name}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{role.code}</Badge>
                                            </TableCell>
                                            <TableCell>
                                                {role.department_name ? (
                                                    <div className="flex items-center gap-2">
                                                        <Building2 className="w-4 h-4 text-gray-500" />
                                                        {role.department_name}
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-400">No Department</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="max-w-xs truncate">
                                                {role.description || 'No description'}
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={role.is_active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                                                    {role.is_active ? 'Active' : 'Inactive'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex space-x-2">
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm"
                                                        onClick={() => router.push(`/efiling/departments/roles/${role.id}/edit`)}
                                                    >
                                                        <Edit className="w-4 h-4" />
                                                    </Button>
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm" 
                                                        className="text-red-600 hover:text-red-700"
                                                        onClick={() => handleDeleteRole(role.id, role.name)}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                    
                    {/* Pagination */}
                    {filteredRoles.length > 0 && (
                        <div className="mt-4">
                            <Pagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                totalItems={filteredRoles.length}
                                itemsPerPage={itemsPerPage}
                                onPageChange={handlePageChange}
                                onItemsPerPageChange={handleItemsPerPageChange}
                            />
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
