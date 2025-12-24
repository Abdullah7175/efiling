"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Search, Filter, Plus, Edit, Trash2, Eye, Settings, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Pagination } from "@/components/ui/pagination";

export default function WorkflowTemplates() {
    const { data: session } = useSession();
    const router = useRouter();
    const { toast } = useToast();
    const [templates, setTemplates] = useState([]);
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
            const response = await fetch('/api/efiling/workflow-templates');
            if (response.ok) {
                const data = await response.json();
                setTemplates(data.templates || []);
            }
        } catch (error) {
            console.error('Error fetching workflow templates:', error);
            toast({
                title: "Error",
                description: "Failed to load workflow templates",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (templateId, templateName) => {
        if (!confirm(`Are you sure you want to delete the workflow template "${templateName}"?`)) return;

        try {
            const response = await fetch(`/api/efiling/workflow-templates?id=${templateId}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                toast({
                    title: "Success",
                    description: "Workflow template deleted successfully",
                });
                fetchData();
            } else {
                const error = await response.json();
                toast({
                    title: "Error",
                    description: error.error || "Failed to delete workflow template",
                    variant: "destructive",
                });
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to delete workflow template",
                variant: "destructive",
            });
        }
    };

    const filteredTemplates = templates.filter(template =>
        template.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        template.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        template.file_type_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Calculate pagination
    const totalPages = Math.ceil(filteredTemplates.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedTemplates = filteredTemplates.slice(startIndex, endIndex);

    const handlePageChange = (page) => {
        setCurrentPage(page);
    };

    const handleItemsPerPageChange = (newItemsPerPage) => {
        setItemsPerPage(newItemsPerPage);
        setCurrentPage(1);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-lg">Loading workflow templates...</div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Workflow Templates</h1>
                    <p className="text-gray-600">Manage e-filing workflow templates and stages</p>
                </div>
                <Button onClick={() => router.push('/efiling/workflow-templates/create')} className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Template
                </Button>
            </div>

            <Card className="mb-6">
                <CardHeader>
                    <CardTitle className="flex items-center">
                        <Filter className="w-5 h-5 mr-2" />
                        Search Templates
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <Input
                            placeholder="Search by name, description, or file type..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Workflow Templates ({filteredTemplates.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    {filteredTemplates.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                            <p>No workflow templates found</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Template Name</TableHead>
                                        <TableHead>File Type</TableHead>
                                        <TableHead>Stages</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginatedTemplates.map((template) => (
                                        <TableRow key={template.id}>
                                            <TableCell className="font-medium">{template.name}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{template.file_type_name || 'N/A'}</Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center">
                                                    <Clock className="w-4 h-4 mr-1" />
                                                    {template.stage_count || 0} stages
                                                </div>
                                            </TableCell>
                                            <TableCell className="max-w-xs truncate">
                                                {template.description || 'No description'}
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={template.is_active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                                                    {template.is_active ? 'Active' : 'Inactive'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex space-x-2">
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm"
                                                        onClick={() => router.push(`/efiling/workflow-templates/${template.id}`)}
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                    </Button>
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm"
                                                        onClick={() => router.push(`/efiling/workflow-templates/${template.id}/edit`)}
                                                    >
                                                        <Edit className="w-4 h-4" />
                                                    </Button>
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm"
                                                        onClick={() => handleDelete(template.id, template.name)}
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
                    {filteredTemplates.length > 0 && (
                        <div className="mt-4">
                            <Pagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                totalItems={filteredTemplates.length}
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

