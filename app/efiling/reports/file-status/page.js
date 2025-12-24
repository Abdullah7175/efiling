"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { FileText, Download, Filter, BarChart3, Calendar, Clock, CheckCircle, AlertCircle, XCircle } from 'lucide-react';

export default function FileStatusReport() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [files, setFiles] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [fileTypes, setFileTypes] = useState([]);
    const [filters, setFilters] = useState({
        department: 'all',
        fileType: 'all',
        status: 'all',
        dateRange: 'all'
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            await Promise.all([
                loadFiles(),
                loadDepartments(),
                loadFileTypes()
            ]);
        } catch (error) {
            console.error('Error loading data:', error);
            toast({
                title: "Error",
                description: "Failed to load report data",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    const loadFiles = async () => {
        try {
            console.log('Loading files from /api/efiling/files');
            const response = await fetch('/api/efiling/files');
            console.log('Files API response status:', response.status);
            
            if (response.ok) {
                const data = await response.json();
                console.log('Files API response data:', data);
                setFiles(Array.isArray(data) ? data : []);
            } else {
                const errorData = await response.json();
                console.error('Files API error:', errorData);
                toast({
                    title: "Error",
                    description: `Failed to load files: ${errorData.error || 'Unknown error'}`,
                    variant: "destructive"
                });
            }
        } catch (error) {
            console.error('Error loading files:', error);
            toast({
                title: "Error",
                description: "Failed to load files",
                variant: "destructive"
            });
        }
    };

    const loadDepartments = async () => {
        try {
            console.log('Loading departments from /api/efiling/departments');
            const response = await fetch('/api/efiling/departments?is_active=true');
            console.log('Departments API response status:', response.status);
            
            if (response.ok) {
                const data = await response.json();
                console.log('Departments API response data:', data);
                setDepartments(Array.isArray(data) ? data : []);
            } else {
                const errorData = await response.json();
                console.error('Departments API error:', errorData);
            }
        } catch (error) {
            console.error('Error loading departments:', error);
        }
    };

    const loadFileTypes = async () => {
        try {
            console.log('Loading file types from /api/efiling/file-types');
            const response = await fetch('/api/efiling/file-types?is_active=true');
            console.log('File types API response status:', response.status);
            
            if (response.ok) {
                const data = await response.json();
                console.log('File types API response data:', data);
                setFileTypes(data.fileTypes || []);
            } else {
                const errorData = await response.json();
                console.error('File types API error:', errorData);
            }
        } catch (error) {
            console.error('Error loading file types:', error);
        }
    };

    const getStatusColor = (status) => {
        switch (status?.toLowerCase()) {
            case 'pending':
                return 'bg-yellow-100 text-yellow-800';
            case 'in_progress':
                return 'bg-blue-100 text-blue-800';
            case 'completed':
                return 'bg-green-100 text-green-800';
            case 'rejected':
                return 'bg-red-100 text-red-800';
            case 'on_hold':
                return 'bg-orange-100 text-orange-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    const getStatusIcon = (status) => {
        switch (status?.toLowerCase()) {
            case 'pending':
                return <Clock className="w-4 h-4" />;
            case 'in_progress':
                return <BarChart3 className="w-4 h-4" />;
            case 'completed':
                return <CheckCircle className="w-4 h-4" />;
            case 'rejected':
                return <XCircle className="w-4 h-4" />;
            case 'on_hold':
                return <AlertCircle className="w-4 h-4" />;
            default:
                return <FileText className="w-4 h-4" />;
        }
    };

    const filteredFiles = files.filter(file => {
        const matchesDepartment = filters.department === 'all' || file.department_id == filters.department;
        const matchesFileType = filters.fileType === 'all' || file.file_type_id == filters.fileType;
        const matchesStatus = filters.status === 'all' || file.status === filters.status;
        
        let matchesDate = true;
        if (filters.dateRange !== 'all') {
            const fileDate = new Date(file.created_at);
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            const lastWeek = new Date(today);
            lastWeek.setDate(lastWeek.getDate() - 7);
            const lastMonth = new Date(today);
            lastMonth.setMonth(lastMonth.getMonth() - 1);

            switch (filters.dateRange) {
                case 'today':
                    matchesDate = fileDate.toDateString() === today.toDateString();
                    break;
                case 'yesterday':
                    matchesDate = fileDate.toDateString() === yesterday.toDateString();
                    break;
                case 'lastWeek':
                    matchesDate = fileDate >= lastWeek;
                    break;
                case 'lastMonth':
                    matchesDate = fileDate >= lastMonth;
                    break;
            }
        }
        
        return matchesDepartment && matchesFileType && matchesStatus && matchesDate;
    });

    const exportToCSV = () => {
        const headers = ['File Number', 'Subject', 'Department', 'File Type', 'Status', 'Created Date', 'Current Stage', 'Assigned To'];
        const csvData = filteredFiles.map(file => [
            file.file_number || 'N/A',
            file.subject || 'N/A',
            file.department_name || 'N/A',
            file.file_type_name || 'N/A',
            file.status || 'N/A',
            new Date(file.created_at).toLocaleDateString(),
            file.current_stage || 'N/A',
            file.assigned_to_name || 'N/A'
        ]);

        const csvContent = [headers, ...csvData]
            .map(row => row.map(cell => `"${cell}"`).join(','))
            .join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `file_status_report_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);

        toast({
            title: "Success",
            description: "Report exported to CSV successfully",
        });
    };

    const getStats = () => {
        const total = filteredFiles.length;
        const pending = filteredFiles.filter(f => f.status?.toLowerCase() === 'pending').length;
        const inProgress = filteredFiles.filter(f => f.status?.toLowerCase() === 'in_progress').length;
        const completed = filteredFiles.filter(f => f.status?.toLowerCase() === 'completed').length;
        const rejected = filteredFiles.filter(f => f.status?.toLowerCase() === 'rejected').length;
        const onHold = filteredFiles.filter(f => f.status?.toLowerCase() === 'on_hold').length;

        return { total, pending, inProgress, completed, rejected, onHold };
    };

    const stats = getStats();

    return (
        <div className="container mx-auto px-4 py-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">File Status Report</h1>
                    <p className="text-gray-600">Track the status and progress of all e-filing documents</p>
                </div>
                <Button onClick={exportToCSV} className="flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    Export CSV
                </Button>
            </div>

            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Total Files</p>
                                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                            </div>
                            <FileText className="w-8 h-8 text-gray-400" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Pending</p>
                                <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
                            </div>
                            <Clock className="w-8 h-8 text-yellow-400" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">In Progress</p>
                                <p className="text-2xl font-bold text-blue-600">{stats.inProgress}</p>
                            </div>
                            <BarChart3 className="w-8 h-8 text-blue-400" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Completed</p>
                                <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
                            </div>
                            <CheckCircle className="w-8 h-8 text-green-400" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Rejected</p>
                                <p className="text-2xl font-bold text-red-600">{stats.rejected}</p>
                            </div>
                            <XCircle className="w-8 h-8 text-red-400" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">On Hold</p>
                                <p className="text-2xl font-bold text-orange-600">{stats.onHold}</p>
                            </div>
                            <AlertCircle className="w-8 h-8 text-orange-400" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Filter className="w-5 h-5" />
                        Filters
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <label className="text-sm font-medium">Department</label>
                            <Select value={filters.department} onValueChange={(value) => setFilters(prev => ({ ...prev, department: value }))}>
                                <SelectTrigger>
                                    <SelectValue placeholder="All Departments" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Departments</SelectItem>
                                    {departments.map((dept) => (
                                        <SelectItem key={dept.id} value={dept.id.toString()}>
                                            {dept.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="text-sm font-medium">File Type</label>
                            <Select value={filters.fileType} onValueChange={(value) => setFilters(prev => ({ ...prev, fileType: value }))}>
                                <SelectTrigger>
                                    <SelectValue placeholder="All File Types" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All File Types</SelectItem>
                                    {fileTypes.map((type) => (
                                        <SelectItem key={type.id} value={type.id.toString()}>
                                            {type.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="text-sm font-medium">Status</label>
                            <Select value={filters.status} onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}>
                                <SelectTrigger>
                                    <SelectValue placeholder="All Statuses" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Statuses</SelectItem>
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="in_progress">In Progress</SelectItem>
                                    <SelectItem value="completed">Completed</SelectItem>
                                    <SelectItem value="rejected">Rejected</SelectItem>
                                    <SelectItem value="on_hold">On Hold</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="text-sm font-medium">Date Range</label>
                            <Select value={filters.dateRange} onValueChange={(value) => setFilters(prev => ({ ...prev, dateRange: value }))}>
                                <SelectTrigger>
                                    <SelectValue placeholder="All Time" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Time</SelectItem>
                                    <SelectItem value="today">Today</SelectItem>
                                    <SelectItem value="yesterday">Yesterday</SelectItem>
                                    <SelectItem value="lastWeek">Last 7 Days</SelectItem>
                                    <SelectItem value="lastMonth">Last 30 Days</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Files Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Files ({filteredFiles.length})</CardTitle>
                    <CardDescription>
                        Detailed view of all files with their current status
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="text-center py-8">
                            <div className="text-lg">Loading files...</div>
                        </div>
                    ) : filteredFiles.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                            <p className="text-lg">No files found</p>
                            <p className="text-sm">Try adjusting your filters</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>File Number</TableHead>
                                        <TableHead>Subject</TableHead>
                                        <TableHead>Department</TableHead>
                                        <TableHead>File Type</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Created Date</TableHead>
                                        <TableHead>Current Stage</TableHead>
                                        <TableHead>Assigned To</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredFiles.map((file) => (
                                        <TableRow key={file.id}>
                                            <TableCell className="font-medium">
                                                {file.file_number || 'N/A'}
                                            </TableCell>
                                            <TableCell className="max-w-xs truncate">
                                                {file.subject || 'N/A'}
                                            </TableCell>
                                            <TableCell>{file.department_name || 'N/A'}</TableCell>
                                            <TableCell>{file.file_type_name || 'N/A'}</TableCell>
                                            <TableCell>
                                                <Badge className={getStatusColor(file.status)}>
                                                    <div className="flex items-center gap-1">
                                                        {getStatusIcon(file.status)}
                                                        {file.status || 'Unknown'}
                                                    </div>
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {file.created_at ? new Date(file.created_at).toLocaleDateString() : 'N/A'}
                                            </TableCell>
                                            <TableCell>{file.current_stage || 'N/A'}</TableCell>
                                            <TableCell>{file.assigned_to_name || 'N/A'}</TableCell>
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
