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
import { 
    Activity, 
    Search, 
    Filter, 
    Eye, 
    Clock, 
    User, 
    FileText, 
    Shield,
    Calendar,
    Download
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function UserActivityActions() {
    const { data: session } = useSession();
    const router = useRouter();
    const { toast } = useToast();
    const [actions, setActions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [actionTypeFilter, setActionTypeFilter] = useState('all');
    const [userFilter, setUserFilter] = useState('all');
    const [dateFilter, setDateFilter] = useState('all');
    const [users, setUsers] = useState([]);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(25);
    const [totalPages, setTotalPages] = useState(1);

    useEffect(() => {
        if (!session?.user?.id) return;
        fetchData();
    }, [session?.user?.id]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch user actions
            const url = `/api/efiling/user-actions?page=${page}&limit=${limit}`;
            const actionsRes = await fetch(url);
            const actionsData = await actionsRes.json();
            const arr = Array.isArray(actionsData?.data) ? actionsData.data : (Array.isArray(actionsData) ? actionsData : []);
            setActions(arr);
            setTotalPages(actionsData?.totalPages || 1);

            // Fetch users for filter
            const usersRes = await fetch('/api/efiling/users?is_active=true');
            const usersData = await usersRes.json();
            setUsers(Array.isArray(usersData) ? usersData : []);
        } catch (error) {
            console.error('Error fetching data:', error);
            toast({
                title: "Error",
                description: "Failed to load user actions",
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
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getActionColor = (actionType) => {
        const colors = {
            'create': 'bg-green-100 text-green-800',
            'update': 'bg-blue-100 text-blue-800',
            'delete': 'bg-red-100 text-red-800',
            'approve': 'bg-emerald-100 text-emerald-800',
            'reject': 'bg-rose-100 text-rose-800',
            'sign': 'bg-purple-100 text-purple-800',
            'transfer': 'bg-orange-100 text-orange-800',
            'view': 'bg-gray-100 text-gray-800'
        };
        return colors[actionType] || 'bg-gray-100 text-gray-800';
    };

    const getActionIcon = (actionType) => {
        const icons = {
            'create': '➕',
            'update': '✏️',
            'delete': '🗑️',
            'approve': '✅',
            'reject': '❌',
            'sign': '✍️',
            'transfer': '🔄',
            'view': '👁️'
        };
        return icons[actionType] || '📝';
    };

    const filteredActions = actions.filter(action => {
        const matchesSearch = 
            action.action_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            action.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            action.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            action.file_number?.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesActionType = actionTypeFilter === 'all' || action.action_type === actionTypeFilter;
        const matchesUser = userFilter === 'all' || action.user_id == userFilter;
        
        let matchesDate = true;
        if (dateFilter !== 'all') {
            const actionDate = new Date(action.timestamp);
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            const lastWeek = new Date(today);
            lastWeek.setDate(lastWeek.getDate() - 7);
            const lastMonth = new Date(today);
            lastMonth.setMonth(lastMonth.getMonth() - 1);

            switch (dateFilter) {
                case 'today':
                    matchesDate = actionDate.toDateString() === today.toDateString();
                    break;
                case 'yesterday':
                    matchesDate = actionDate.toDateString() === yesterday.toDateString();
                    break;
                case 'lastWeek':
                    matchesDate = actionDate >= lastWeek;
                    break;
                case 'lastMonth':
                    matchesDate = actionDate >= lastMonth;
                    break;
            }
        }
        
        return matchesSearch && matchesActionType && matchesUser && matchesDate;
    });

    const exportActions = () => {
        const csvContent = [
            ['Date', 'User', 'Action', 'Description', 'File Number', 'IP Address', 'User Agent'].join(','),
            ...filteredActions.map(action => [
                formatDate(action.timestamp),
                action.user_name || 'Unknown',
                action.action_type || 'Unknown',
                action.description || 'No description',
                action.file_number || 'N/A',
                action.ip_address || 'N/A',
                action.user_agent || 'N/A'
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `user-actions-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-lg">Loading user actions...</div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">User Activity Actions</h1>
                    <p className="text-gray-600">Track and monitor all user actions in the e-filing system</p>
                </div>
                <Button onClick={exportActions} variant="outline" className="flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    Export CSV
                </Button>
            </div>

            {/* Filters */}
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle className="flex items-center">
                        <Filter className="w-5 h-5 mr-2" />
                        Filter Actions
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <Input
                                placeholder="Search actions..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        
                        <Select value={actionTypeFilter} onValueChange={setActionTypeFilter}>
                            <SelectTrigger>
                                <SelectValue placeholder="Action Type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Actions</SelectItem>
                                <SelectItem value="create">Create</SelectItem>
                                <SelectItem value="update">Update</SelectItem>
                                <SelectItem value="delete">Delete</SelectItem>
                                <SelectItem value="approve">Approve</SelectItem>
                                <SelectItem value="reject">Reject</SelectItem>
                                <SelectItem value="sign">Sign</SelectItem>
                                <SelectItem value="transfer">Transfer</SelectItem>
                                <SelectItem value="view">View</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={userFilter} onValueChange={setUserFilter}>
                            <SelectTrigger>
                                <SelectValue placeholder="User" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Users</SelectItem>
                                {users.map((user) => (
                                    <SelectItem key={user.id} value={user.id.toString()}>
                                        {user.name || user.employee_id}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={dateFilter} onValueChange={setDateFilter}>
                            <SelectTrigger>
                                <SelectValue placeholder="Date Range" />
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
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Activity className="w-5 h-5" />
                        User Actions ({filteredActions.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {filteredActions.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <Activity className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                            <p>No user actions found</p>
                        </div>
                    ) : (
                        <>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date & Time</TableHead>
                                        <TableHead>User</TableHead>
                                        <TableHead>Action</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead>File Number</TableHead>
                                        <TableHead>IP Address</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredActions.map((action) => (
                                        <TableRow key={action.id}>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Clock className="w-4 h-4 text-gray-500" />
                                                    <span className="text-sm">
                                                        {formatDate(action.timestamp)}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <User className="w-4 h-4 text-gray-500" />
                                                    <span className="font-medium">
                                                        {action.user_name || 'Unknown User'}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={getActionColor(action.action_type)}>
                                                    <span className="mr-1">{getActionIcon(action.action_type)}</span>
                                                    {action.action_type || 'Unknown'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="max-w-xs truncate">
                                                {action.description || 'No description'}
                                            </TableCell>
                                            <TableCell>
                                                {action.file_number ? (
                                                    <div className="flex items-center gap-2">
                                                        <FileText className="w-4 h-4 text-gray-500" />
                                                        <span className="font-mono text-sm">
                                                            {action.file_number}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-400">N/A</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <span className="font-mono text-sm text-gray-600">
                                                    {action.ip_address || 'N/A'}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm"
                                                    onClick={() => router.push(`/efiling/files/${action.file_id}`)}
                                                    disabled={!action.file_id}
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        <div className="flex items-center justify-between mt-4">
                            <div className="text-sm text-gray-600">Page {page} of {totalPages}</div>
                            <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
                                <Select value={String(limit)} onValueChange={(v) => { setLimit(parseInt(v)); setPage(1); }}>
                                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="10">10</SelectItem>
                                        <SelectItem value="25">25</SelectItem>
                                        <SelectItem value="50">50</SelectItem>
                                        <SelectItem value="100">100</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</Button>
                            </div>
                        </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
