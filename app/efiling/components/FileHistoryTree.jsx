'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
    FileText, 
    User, 
    Clock, 
    CheckCircle, 
    ArrowRight, 
    MessageSquare, 
    Edit3, 
    Paperclip,
    Calendar,
    Building,
    Shield,
    AlertCircle,
    Play,
    Pause,
    StopCircle
} from 'lucide-react';

export default function FileHistoryTree({ fileId, includeInternal = false }) {
    const [loading, setLoading] = useState(true);
    const [history, setHistory] = useState(null);
    const [error, setError] = useState(null);
    const [filterType, setFilterType] = useState('all');

    useEffect(() => {
        if (fileId) {
            loadFileHistory();
        }
    }, [fileId, includeInternal]);

    const loadFileHistory = async () => {
        try {
            setLoading(true);
            setError(null);
            
            const response = await fetch(
                `/api/efiling/files/${fileId}/history?includeInternal=${includeInternal}`
            );
            
            if (!response.ok) {
                throw new Error('Failed to load file history');
            }
            
            const data = await response.json();
            setHistory(data.history);
        } catch (error) {
            console.error('Error loading file history:', error);
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    const getActionIcon = (type) => {
        switch (type) {
            case 'file_created':
                return <FileText className="h-4 w-4" />;
            case 'file_movement':
                return <ArrowRight className="h-4 w-4" />;
            case 'workflow_stage':
                return <Play className="h-4 w-4" />;
            case 'stage_completed':
                return <CheckCircle className="h-4 w-4" />;
            case 'workflow_action':
                return <Edit3 className="h-4 w-4" />;
            case 'comment':
                return <MessageSquare className="h-4 w-4" />;
            case 'signature':
                return <Shield className="h-4 w-4" />;
            case 'attachment':
                return <Paperclip className="h-4 w-4" />;
            case 'user_action':
                return <User className="h-4 w-4" />;
            default:
                return <Clock className="h-4 w-4" />;
        }
    };

    const getActionColor = (type) => {
        switch (type) {
            case 'file_created':
                return 'bg-blue-100 text-blue-800';
            case 'file_movement':
                return 'bg-green-100 text-green-800';
            case 'workflow_stage':
                return 'bg-purple-100 text-purple-800';
            case 'stage_completed':
                return 'bg-emerald-100 text-emerald-800';
            case 'workflow_action':
                return 'bg-orange-100 text-orange-800';
            case 'comment':
                return 'bg-indigo-100 text-indigo-800';
            case 'signature':
                return 'bg-teal-100 text-teal-800';
            case 'attachment':
                return 'bg-pink-100 text-pink-800';
            case 'user_action':
                return 'bg-gray-100 text-gray-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    const getStatusBadge = (status, slaBreached = false) => {
        if (slaBreached) {
            return <Badge variant="destructive">SLA Breached</Badge>;
        }
        
        switch (status) {
            case 'PENDING':
                return <Badge variant="default">Pending</Badge>;
            case 'IN_PROGRESS':
                return <Badge variant="default">In Progress</Badge>;
            case 'COMPLETED':
                return <Badge variant="default">Completed</Badge>;
            case 'RETURNED':
                return <Badge variant="destructive">Returned</Badge>;
            case 'ESCALATED':
                return <Badge variant="destructive">Escalated</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getTimeAgo = (dateString) => {
        if (!dateString) return '';
        
        const now = new Date();
        const date = new Date(dateString);
        const diffInHours = Math.floor((now - date) / (1000 * 60 * 60));
        
        if (diffInHours < 1) return 'Just now';
        if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
        
        const diffInDays = Math.floor(diffInHours / 24);
        if (diffInDays < 7) return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
        
        const diffInWeeks = Math.floor(diffInDays / 7);
        if (diffInWeeks < 4) return `${diffInWeeks} week${diffInWeeks > 1 ? 's' : ''} ago`;
        
        const diffInMonths = Math.floor(diffInDays / 30);
        return `${diffInMonths} month${diffInMonths > 1 ? 's' : ''} ago`;
    };

    const filteredTimeline = history?.timeline?.filter(item => {
        if (filterType === 'all') return true;
        return item.type === filterType;
    }) || [];

    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>File History</CardTitle>
                    <CardDescription>Loading file history...</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (error) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>File History</CardTitle>
                    <CardDescription>Error loading file history</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="text-center py-8 text-red-600">
                        <AlertCircle className="h-12 w-12 mx-auto mb-4" />
                        <p className="text-lg font-medium">Failed to load file history</p>
                        <p className="text-sm text-gray-600 mt-2">{error}</p>
                        <Button 
                            onClick={loadFileHistory} 
                            className="mt-4"
                            variant="outline"
                        >
                            Try Again
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (!history) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>File History</CardTitle>
                    <CardDescription>No history available</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="text-center py-8 text-gray-600">
                        <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No file history found.</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle>File History</CardTitle>
                        <CardDescription>
                            Complete timeline of file &quot;{history.file.file_number}&quot;
                        </CardDescription>
                    </div>
                    <Button 
                        onClick={loadFileHistory} 
                        variant="outline" 
                        size="sm"
                    >
                        Refresh
                    </Button>
                </div>
                
                {/* File Summary */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                    <div className="flex items-center space-x-2">
                        <Building className="h-4 w-4 text-gray-500" />
                        <span className="text-sm text-gray-600">
                            {history.file.department}
                        </span>
                    </div>
                    <div className="flex items-center space-x-2">
                        <FileText className="h-4 w-4 text-gray-500" />
                        <span className="text-sm text-gray-600">
                            {history.file.category}
                        </span>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Clock className="h-4 w-4 text-gray-500" />
                        <span className="text-sm text-gray-600">
                            Created: {formatDate(history.file.created_at)}
                        </span>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Shield className="h-4 w-4 text-gray-500" />
                        <span className="text-sm text-gray-600">
                            {history.file.priority} priority
                        </span>
                    </div>
                </div>
            </CardHeader>
            
            <CardContent>
                {/* Filter Tabs */}
                <Tabs value={filterType} onValueChange={setFilterType} className="mb-6">
                    <TabsList className="grid w-full grid-cols-6">
                        <TabsTrigger value="all">All</TabsTrigger>
                        <TabsTrigger value="workflow_stage">Stages</TabsTrigger>
                        <TabsTrigger value="file_movement">Movements</TabsTrigger>
                        <TabsTrigger value="comment">Comments</TabsTrigger>
                        <TabsTrigger value="signature">Signatures</TabsTrigger>
                        <TabsTrigger value="attachment">Attachments</TabsTrigger>
                    </TabsList>
                </Tabs>

                {/* Timeline */}
                <div className="space-y-4">
                    {filteredTimeline.length === 0 ? (
                        <div className="text-center py-8 text-gray-600">
                            <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>No {filterType === 'all' ? '' : filterType} events found.</p>
                        </div>
                    ) : (
                        filteredTimeline.map((item, index) => (
                            <div key={item.id} className="flex items-start space-x-4">
                                {/* Timeline Icon */}
                                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${getActionColor(item.type)}`}>
                                    {getActionIcon(item.type)}
                                </div>
                                
                                {/* Timeline Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center space-x-2 mb-1">
                                        <h4 className="text-sm font-medium text-gray-900">
                                            {item.action}
                                        </h4>
                                        {item.details?.status && (
                                            getStatusBadge(item.details.status, item.details.sla_breached)
                                        )}
                                    </div>
                                    
                                    <p className="text-sm text-gray-600 mb-2">
                                        {item.description}
                                    </p>
                                    
                                    {/* Additional Details */}
                                    {item.details && Object.keys(item.details).length > 0 && (
                                        <div className="bg-gray-50 rounded-lg p-3 mb-2">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                                                {Object.entries(item.details).map(([key, value]) => {
                                                    if (value && typeof value === 'string' && value.length < 100) {
                                                        return (
                                                            <div key={key} className="flex items-center space-x-1">
                                                                <span className="font-medium text-gray-700">
                                                                    {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:
                                                                </span>
                                                                <span className="text-gray-600">{value}</span>
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                })}
                                            </div>
                                        </div>
                                    )}
                                    
                                    {/* Metadata */}
                                    <div className="flex items-center space-x-4 text-xs text-gray-500">
                                        <div className="flex items-center space-x-1">
                                            <User className="h-3 w-3" />
                                            <span>{item.user}</span>
                                        </div>
                                        <div className="flex items-center space-x-1">
                                            <Calendar className="h-3 w-3" />
                                            <span>{formatDate(item.timestamp)}</span>
                                        </div>
                                        <span className="text-gray-400">
                                            {getTimeAgo(item.timestamp)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
                
                {/* Summary Stats */}
                <div className="mt-8 pt-6 border-t border-gray-200">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                        <div>
                            <div className="text-2xl font-bold text-blue-600">
                                {history.timeline.length}
                            </div>
                            <div className="text-sm text-gray-600">Total Events</div>
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-green-600">
                                {history.timeline.filter(item => item.type === 'workflow_stage').length}
                            </div>
                            <div className="text-sm text-gray-600">Workflow Stages</div>
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-purple-600">
                                {history.timeline.filter(item => item.type === 'comment').length}
                            </div>
                            <div className="text-sm text-gray-600">Comments</div>
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-teal-600">
                                {history.timeline.filter(item => item.type === 'signature').length}
                            </div>
                            <div className="text-sm text-gray-600">Signatures</div>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
