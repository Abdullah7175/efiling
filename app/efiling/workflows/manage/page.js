'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { 
    Search, 
    Filter, 
    Eye, 
    Clock, 
    AlertTriangle, 
    CheckCircle, 
    XCircle,
    Play,
    Pause,
    Square
} from 'lucide-react';

export default function ManageWorkflows() {
    const { data: session } = useSession();
    const router = useRouter();
    const { toast } = useToast();
    
    const [workflows, setWorkflows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState('');
    const [departments, setDepartments] = useState([]);

    useEffect(() => {
        if (session?.user) {
            loadWorkflows();
            loadDepartments();
        }
    }, [session]);

    const loadWorkflows = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams({
                userId: session.user.id
            });
            
            if (statusFilter) params.append('status', statusFilter);
            if (departmentFilter) params.append('departmentId', departmentFilter);

            const response = await fetch(`/api/efiling/workflows?${params}`);
            if (response.ok) {
                const data = await response.json();
                setWorkflows(data.workflows || []);
            } else {
                toast({
                    title: "Error",
                    description: "Failed to load workflows",
                    variant: "destructive"
                });
            }
        } catch (error) {
            console.error('Error loading workflows:', error);
            toast({
                title: "Error",
                description: "Failed to load workflows",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    const loadDepartments = async () => {
        try {
            const response = await fetch('/api/efiling/departments?is_active=true');
            if (response.ok) {
                const data = await response.json();
                setDepartments(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            console.error('Error loading departments:', error);
        }
    };

    const getStatusBadge = (status, slaBreached) => {
        if (slaBreached) {
            return <Badge variant="destructive" className="flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                SLA Breached
            </Badge>;
        }

        switch (status) {
            case 'IN_PROGRESS':
                return <Badge variant="default" className="flex items-center gap-1">
                    <Play className="w-3 h-3" />
                    In Progress
                </Badge>;
            case 'COMPLETED':
                return <Badge variant="secondary" className="flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Completed
                </Badge>;
            case 'PAUSED':
                return <Badge variant="outline" className="flex items-center gap-1">
                    <Pause className="w-3 h-3" />
                    Paused
                </Badge>;
            case 'CANCELLED':
                return <Badge variant="destructive" className="flex items-center gap-1">
                    <XCircle className="w-3 h-3" />
                    Cancelled
                </Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    const getPriorityBadge = (priority) => {
        switch (priority) {
            case 'HIGH':
                return <Badge variant="destructive">High</Badge>;
            case 'MEDIUM':
                return <Badge variant="default">Medium</Badge>;
            case 'LOW':
                return <Badge variant="secondary">Low</Badge>;
            default:
                return <Badge variant="outline">{priority}</Badge>;
        }
    };

    const filteredWorkflows = workflows.filter(workflow => {
        const matchesSearch = 
            workflow.file_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            workflow.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            workflow.template_name?.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesStatus = statusFilter === 'all' || !statusFilter || workflow.workflow_status === statusFilter;
        const matchesDepartment = departmentFilter === 'all' || !departmentFilter || workflow.department_name === departments.find(d => d.id === departmentFilter)?.name;
        
        return matchesSearch && matchesStatus && matchesDepartment;
    });

    const handleViewWorkflow = (workflowId) => {
        router.push(`/efiling/workflows/${workflowId}`);
    };

    const handleCreateWorkflow = () => {
        router.push('/efiling/workflows/create');
    };

    if (!session) {
        return <div>Please sign in to access this page.</div>;
    }

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">Manage Workflows</h1>
                    <p className="text-muted-foreground">
                        Monitor and manage e-filing workflows across all departments
                    </p>
                </div>
                <Button onClick={handleCreateWorkflow}>
                    Create Workflow
                </Button>
            </div>

            {/* Filters */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Filter className="w-5 h-5" />
                        Filters
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <label className="text-sm font-medium">Search</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                                <Input
                                    placeholder="Search files, subjects..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10"
                                />
                            </div>
                        </div>
                        
                        <div>
                            <label className="text-sm font-medium">Status</label>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger>
                                    <SelectValue placeholder="All Statuses" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Statuses</SelectItem>
                                    <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                                    <SelectItem value="COMPLETED">Completed</SelectItem>
                                    <SelectItem value="PAUSED">Paused</SelectItem>
                                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        
                        <div>
                            <label className="text-sm font-medium">Department</label>
                            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                                <SelectTrigger>
                                    <SelectValue placeholder="All Departments" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Departments</SelectItem>
                                    {departments.map((dept) => (
                                        <SelectItem key={dept.id} value={dept.id}>
                                            {dept.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        
                        <div className="flex items-end">
                            <Button 
                                variant="outline" 
                                onClick={() => {
                                    setSearchTerm('');
                                    setStatusFilter('all');
                                    setDepartmentFilter('all');
                                }}
                            >
                                Clear Filters
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Workflows Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Workflows</CardTitle>
                    <CardDescription>
                        {filteredWorkflows.length} workflow{filteredWorkflows.length !== 1 ? 's' : ''} found
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="text-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                            <p className="mt-2 text-muted-foreground">Loading workflows...</p>
                        </div>
                    ) : filteredWorkflows.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-muted-foreground">No workflows found</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>File Number</TableHead>
                                    <TableHead>Subject</TableHead>
                                    <TableHead>Template</TableHead>
                                    <TableHead>Current Stage</TableHead>
                                    <TableHead>Assignee</TableHead>
                                    <TableHead>Department</TableHead>
                                    <TableHead>Priority</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>SLA Deadline</TableHead>
                                    <TableHead>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredWorkflows.map((workflow) => (
                                    <TableRow key={workflow.id}>
                                        <TableCell className="font-medium">
                                            {workflow.file_number}
                                        </TableCell>
                                        <TableCell className="max-w-xs truncate">
                                            {workflow.subject}
                                        </TableCell>
                                        <TableCell>{workflow.template_name}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline">
                                                {workflow.current_stage_name}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {workflow.assigned_user_name ? (
                                                <div>
                                                    <div className="font-medium">{workflow.assigned_user_name}</div>
                                                    <div className="text-sm text-muted-foreground">
                                                        {workflow.assigned_user_designation}
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground">Unassigned</span>
                                            )}
                                        </TableCell>
                                        <TableCell>{workflow.department_name}</TableCell>
                                        <TableCell>
                                            {getPriorityBadge(workflow.priority)}
                                        </TableCell>
                                        <TableCell>
                                            {getStatusBadge(workflow.workflow_status, workflow.sla_breached)}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {new Date(workflow.sla_deadline).toLocaleDateString()}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleViewWorkflow(workflow.id)}
                                            >
                                                <Eye className="w-4 h-4" />
                                            </Button>
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
