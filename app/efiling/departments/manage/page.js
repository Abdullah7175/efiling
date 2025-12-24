"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, Search, Filter, Plus, Edit, Trash2, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Pagination } from "@/components/ui/pagination";

export default function ManageDepartments() {
    const { data: session } = useSession();
    const router = useRouter();
    const { toast } = useToast();
    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(5);

    useEffect(() => {
        if (!session?.user?.id) return;
        fetchData();
    }, [session?.user?.id]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const deptRes = await fetch('/api/efiling/departments');
            const deptData = await deptRes.json();
            setDepartments(Array.isArray(deptData) ? deptData : []);
        } catch (error) {
            console.error('Error fetching data:', error);
            toast({
                title: "Error",
                description: "Failed to load departments",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (deptId) => {
        if (!confirm('Are you sure you want to delete this department?')) return;

        try {
            const response = await fetch(`/api/efiling/departments?id=${deptId}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                toast({
                    title: "Success",
                    description: "Department deleted successfully",
                });
                fetchData();
            } else {
                const error = await response.json();
                toast({
                    title: "Error",
                    description: error.error || "Failed to delete department",
                    variant: "destructive",
                });
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to delete department",
                variant: "destructive",
            });
        }
    };

    const filteredDepartments = departments.filter(dept =>
        dept.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        dept.code?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Calculate pagination
    const totalPages = Math.ceil(filteredDepartments.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedDepartments = filteredDepartments.slice(startIndex, endIndex);

    const handlePageChange = (page) => {
        setCurrentPage(page);
    };

    const handleItemsPerPageChange = (newItemsPerPage) => {
        setItemsPerPage(newItemsPerPage);
        setCurrentPage(1);
    };

    useEffect(() => {
        setCurrentPage(1); // Reset to first page when search changes
    }, [searchTerm]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-lg">Loading departments...</div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Manage Departments</h1>
                    <p className="text-gray-600">Create and manage e-filing departments</p>
                </div>
                <Button onClick={() => router.push('/efiling/departments/add')} className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Department
                </Button>
            </div>

            <Card className="mb-6">
                <CardHeader>
                    <CardTitle className="flex items-center">
                        <Filter className="w-5 h-5 mr-2" />
                        Search Departments
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <Input
                            placeholder="Search by department name or code..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Departments ({filteredDepartments.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    {filteredDepartments.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <Building2 className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                            <p>No departments found</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Department Code</TableHead>
                                        <TableHead>Department Name</TableHead>
                                        <TableHead>Parent Department</TableHead>
                                        <TableHead>Users</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginatedDepartments.map((dept) => (
                                        <TableRow key={dept.id}>
                                            <TableCell className="font-medium">{dept.code}</TableCell>
                                            <TableCell>{dept.name}</TableCell>
                                            <TableCell>{dept.parent_department_name || '-'}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center">
                                                    <Users className="w-4 h-4 mr-1" />
                                                    {dept.user_count || 0}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={dept.is_active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                                                    {dept.is_active ? 'Active' : 'Inactive'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex space-x-2">
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm"
                                                        onClick={() => router.push(`/efiling/departments/${dept.id}/edit`)}
                                                    >
                                                        <Edit className="w-4 h-4" />
                                                    </Button>
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm"
                                                        onClick={() => handleDelete(dept.id)}
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
                        </div>
                    )}
                    
                    {/* Pagination */}
                    {filteredDepartments.length > 0 && (
                        <div className="mt-4">
                            <Pagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                totalItems={filteredDepartments.length}
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