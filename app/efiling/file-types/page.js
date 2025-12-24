"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Search, Filter, Plus, Edit, Trash2, Eye, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Pagination } from "@/components/ui/pagination";

export default function FileTypes() {
    const { data: session } = useSession();
    const router = useRouter();
    const { toast } = useToast();
    const [fileTypes, setFileTypes] = useState([]);
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
            const response = await fetch('/api/efiling/file-types');
            if (response.ok) {
                const data = await response.json();
                setFileTypes(data.fileTypes || []);
            }
        } catch (error) {
            console.error('Error fetching file types:', error);
            toast({
                title: "Error",
                description: "Failed to load file types",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (fileTypeId, fileTypeName) => {
        if (!confirm(`Are you sure you want to delete the file type "${fileTypeName}"?`)) return;

        try {
            const response = await fetch(`/api/efiling/file-types?id=${fileTypeId}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                toast({
                    title: "Success",
                    description: "File type deleted successfully",
                });
                fetchData();
            } else {
                const error = await response.json();
                toast({
                    title: "Error",
                    description: error.error || "Failed to delete file type",
                    variant: "destructive",
                });
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to delete file type",
                variant: "destructive",
            });
        }
    };

    const filteredFileTypes = fileTypes.filter(fileType =>
        fileType.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        fileType.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        fileType.department_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Calculate pagination
    const totalPages = Math.ceil(filteredFileTypes.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedFileTypes = filteredFileTypes.slice(startIndex, endIndex);

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
                <div className="text-lg">Loading file types...</div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">File Types</h1>
                    <p className="text-gray-600">Manage e-filing file types and categories</p>
                </div>
                <Button onClick={() => router.push('/efiling/file-types/create')} className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Create File Type
                </Button>
            </div>

            <Card className="mb-6">
                <CardHeader>
                    <CardTitle className="flex items-center">
                        <Filter className="w-5 h-5 mr-2" />
                        Search File Types
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <Input
                            placeholder="Search by name, code, or department..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>File Types ({filteredFileTypes.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    {filteredFileTypes.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                            <p>No file types found</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Code</TableHead>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Department</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginatedFileTypes.map((fileType) => (
                                        <TableRow key={fileType.id}>
                                            <TableCell className="font-medium">{fileType.code}</TableCell>
                                            <TableCell>{fileType.name}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center">
                                                    <Building2 className="w-4 h-4 mr-1" />
                                                    {fileType.department_name || '-'}
                                                </div>
                                            </TableCell>
                                            <TableCell className="max-w-xs truncate">
                                                {fileType.description || '-'}
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={fileType.is_active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                                                    {fileType.is_active ? 'Active' : 'Inactive'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex space-x-2">
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm"
                                                        onClick={() => router.push(`/efiling/file-types/${fileType.id}`)}
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                    </Button>
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm"
                                                        onClick={() => router.push(`/efiling/file-types/${fileType.id}/edit`)}
                                                    >
                                                        <Edit className="w-4 h-4" />
                                                    </Button>
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm"
                                                        onClick={() => handleDelete(fileType.id, fileType.name)}
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
                    {filteredFileTypes.length > 0 && (
                        <div className="mt-4">
                            <Pagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                totalItems={filteredFileTypes.length}
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

