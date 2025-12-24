"use client";

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Bell, FileText, User, Clock, Check, Archive } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Notifications() {
    const { data: session } = useSession();
    const { toast } = useToast();
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // all, unread, dismissed

    useEffect(() => {
        if (session?.user?.id) {
            fetchNotifications();
        }
    }, [session?.user?.id]);

    const fetchNotifications = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/efiling/notifications');
            if (response.ok) {
                const data = await response.json();
                setNotifications(data.notifications || []);
            }
        } catch (error) {
            console.error('Error fetching notifications:', error);
            toast({
                title: "Error",
                description: "Failed to load notifications",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const markAsRead = async (notificationId) => {
        try {
            const response = await fetch(`/api/efiling/notifications/${notificationId}/read`, {
                method: 'PUT'
            });
            if (response.ok) {
                setNotifications(prev => 
                    prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
                );
                toast({
                    title: "Success",
                    description: "Notification marked as read",
                });
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to mark notification as read",
                variant: "destructive",
            });
        }
    };

    const dismissNotification = async (notificationId) => {
        try {
            const response = await fetch(`/api/efiling/notifications/${notificationId}/dismiss`, {
                method: 'PUT'
            });
            if (response.ok) {
                setNotifications(prev => 
                    prev.map(n => n.id === notificationId ? { ...n, is_dismissed: true } : n)
                );
                toast({
                    title: "Success",
                    description: "Notification dismissed",
                });
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to dismiss notification",
                variant: "destructive",
            });
        }
    };

    const getNotificationIcon = (type) => {
        switch (type) {
            case 'file_assigned':
                return <FileText className="w-5 h-5 text-blue-600" />;
            case 'file_marked_to':
                return <User className="w-5 h-5 text-green-600" />;
            case 'workflow_update':
                return <Clock className="w-5 h-5 text-orange-600" />;
            default:
                return <Bell className="w-5 h-5 text-gray-600" />;
        }
    };

    const getNotificationColor = (type) => {
        switch (type) {
            case 'file_assigned':
                return 'bg-blue-100 text-blue-800';
            case 'file_marked_to':
                return 'bg-green-100 text-green-800';
            case 'workflow_update':
                return 'bg-orange-100 text-orange-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    const filteredNotifications = notifications.filter(notification => {
        if (filter === 'unread') return !notification.is_read && !notification.is_dismissed;
        if (filter === 'dismissed') return notification.is_dismissed;
        return !notification.is_dismissed;
    });

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-lg">Loading notifications...</div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Notifications</h1>
                    <p className="text-gray-600">Stay updated with your e-filing activities</p>
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex space-x-2 mb-6">
                <Button
                    variant={filter === 'all' ? 'default' : 'outline'}
                    onClick={() => setFilter('all')}
                >
                    All ({notifications.filter(n => !n.is_dismissed).length})
                </Button>
                <Button
                    variant={filter === 'unread' ? 'default' : 'outline'}
                    onClick={() => setFilter('unread')}
                >
                    Unread ({notifications.filter(n => !n.is_read && !n.is_dismissed).length})
                </Button>
                <Button
                    variant={filter === 'dismissed' ? 'default' : 'outline'}
                    onClick={() => setFilter('dismissed')}
                >
                    Dismissed ({notifications.filter(n => n.is_dismissed).length})
                </Button>
            </div>

            {/* Notifications List */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Bell className="w-5 h-5" />
                        {filter === 'all' && 'All Notifications'}
                        {filter === 'unread' && 'Unread Notifications'}
                        {filter === 'dismissed' && 'Dismissed Notifications'}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {filteredNotifications.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <Bell className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                            <p className="text-lg">No notifications found</p>
                            <p className="text-sm">You&apos;re all caught up!</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {filteredNotifications.map((notification) => (
                                <div
                                    key={notification.id}
                                    className={`p-4 border rounded-lg ${
                                        notification.is_read ? 'bg-gray-50' : 'bg-white'
                                    } ${!notification.is_read ? 'border-l-4 border-l-blue-500' : ''}`}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-start gap-3 flex-1">
                                            {getNotificationIcon(notification.type)}
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Badge className={getNotificationColor(notification.type)}>
                                                        {notification.type.replace('_', ' ').toUpperCase()}
                                                    </Badge>
                                                    {!notification.is_read && (
                                                        <Badge variant="secondary">New</Badge>
                                                    )}
                                                </div>
                                                <p className="font-medium text-gray-900 mb-1">
                                                    {notification.type.replace('_', ' ').toUpperCase()}
                                                </p>
                                                <p className="text-gray-600 text-sm mb-2">
                                                    {notification.message}
                                                </p>
                                                <div className="flex items-center gap-4 text-xs text-gray-500">
                                                    <span>{new Date(notification.created_at).toLocaleString()}</span>
                                                    {notification.file_number && (
                                                        <span>File: {notification.file_number}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            {!notification.is_read && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => markAsRead(notification.id)}
                                                >
                                                    <Check className="w-4 h-4 mr-1" />
                                                    Mark Read
                                                </Button>
                                            )}
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => dismissNotification(notification.id)}
                                            >
                                                <Archive className="w-4 h-4 mr-1" />
                                                Dismiss
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
