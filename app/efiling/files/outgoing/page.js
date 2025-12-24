"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Search, Filter, Eye, Download, Send, Archive } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function OutgoingFiles() {
    const { data: session } = useSession();
    const router = useRouter();
    const { toast } = useToast();
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (!session?.user?.id) return;
        fetchData();
    }, [session?.user?.id]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const filesRes = await fetch('/api/efiling/files?type=outgoing');
            const filesData = await filesRes.json();
            setFiles(Array.isArray(filesData) ? filesData : []);
        } catch (error) {
            console.error('Error fetching data:', error);
            toast({
                title: "Error",
                description: "Failed to load outgoing files",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const filteredFiles = files.filter(file =>
        file.file_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        file.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        file.recipient_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-lg">Loading outgoing files...</div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Outgoing Files</h1>
                    <p className="text-gray-600">Manage files sent to external parties</p>
                </div>
                <Button onClick={() => router.push('/efiling/files/new?type=outgoing')} className="bg-green-600 hover:bg-green-700">
                    <Send className="w-4 h-4 mr-2" />
                    Create Outgoing File
                </Button>
            </div>

            <Card className="mb-6">
                <CardHeader>
                    <CardTitle className="flex items-center">
                        <Filter className="w-5 h-5 mr-2" />
                        Search Files
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <Input
                            placeholder="Search by file number, subject, or recipient..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Outgoing Files ({filteredFiles.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    {filteredFiles.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <Archive className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                            <p>No outgoing files found</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>File Number</TableHead>
                                        <TableHead>Subject</TableHead>
                                        <TableHead>Recipient</TableHead>
                                        <TableHead>Department</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Sent Date</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredFiles.map((file) => (
                                        <TableRow key={file.id}>
                                            <TableCell className="font-medium">{file.file_number}</TableCell>
                                            <TableCell className="max-w-xs truncate">{file.subject}</TableCell>
                                            <TableCell>{file.recipient_name || '-'}</TableCell>
                                            <TableCell>{file.department_name}</TableCell>
                                            <TableCell>
                                                <Badge className="bg-green-100 text-green-800">{file.status_name}</Badge>
                                            </TableCell>
                                            <TableCell>{formatDate(file.sent_date || file.created_at)}</TableCell>
                                            <TableCell>
                                                <div className="flex space-x-2">
                                                    <Button variant="ghost" size="sm" onClick={() => router.push(`/efiling/files/${file.id}`)}>
                                                        <Eye className="w-4 h-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="sm">
                                                        <Download className="w-4 h-4" />
                                                    </Button>
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