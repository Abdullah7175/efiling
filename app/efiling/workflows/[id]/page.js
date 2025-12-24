'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { 
    ArrowLeft, 
    Clock, 
    AlertTriangle, 
    CheckCircle, 
    XCircle,
    Play,
    Pause,
    Square,
    FileText,
    Users,
    History,
    Settings
} from 'lucide-react';
import { Label } from '@/components/ui/label';

export default function WorkflowDetails() {
    const { data: session } = useSession();
    const router = useRouter();
    const params = useParams();
    const { toast } = useToast();
    
    const [workflow, setWorkflow] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');

    useEffect(() => {
        if (session?.user && params.id) {
            loadWorkflow();
        }
    }, [session, params.id]);

    const loadWorkflow = async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/efiling/workflows/${params.id}?userId=${session.user.id}`);
            if (response.ok) {
                const data = await response.json();
                setWorkflow(data.workflow);
            } else {
                toast({
                    title: "Error",
                    description: "Failed to load workflow",
                    variant: "destructive"
                });
            }
        } catch (error) {
            console.error('Error loading workflow:', error);
            toast({
                title: "Error",
                description: "Failed to load workflow",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
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

    const getStageStatusBadge = (status) => {
        switch (status) {
            case 'IN_PROGRESS':
                return <Badge variant="default">In Progress</Badge>;
            case 'COMPLETED':
                return <Badge variant="secondary">Completed</Badge>;
            case 'REJECTED':
                return <Badge variant="destructive">Rejected</Badge>;
            case 'RETURNED':
                return <Badge variant="outline">Returned</Badge>;
            case 'ESCALATED':
                return <Badge variant="destructive">Escalated</Badge>;
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

    if (!session) {
        return <div>Please sign in to access this page.</div>;
    }

    if (loading) {
        return (
            <div className="container mx-auto p-6">
                <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                    <p className="mt-2 text-muted-foreground">Loading workflow...</p>
                </div>
            </div>
        );
    }

    if (!workflow) {
        return (
            <div className="container mx-auto p-6">
                <div className="text-center py-8">
                    <p className="text-muted-foreground">Workflow not found</p>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex items-center gap-4">
                <Button
                    variant="ghost"
                    onClick={() => router.back()}
                    className="flex items-center gap-2"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                </Button>
                <div>
                    <h1 className="text-3xl font-bold">Workflow Details</h1>
                    <p className="text-muted-foreground">
                        File: {workflow.file_number} - {workflow.subject}
                    </p>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="overview" className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Overview
                    </TabsTrigger>
                    <TabsTrigger value="stages" className="flex items-center gap-2">
                        <Settings className="w-4 h-4" />
                        Stages
                    </TabsTrigger>
                    <TabsTrigger value="actions" className="flex items-center gap-2">
                        <History className="w-4 h-4" />
                        Actions
                    </TabsTrigger>
                    <TabsTrigger value="team" className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        Team
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>File Information</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <Label className="text-sm font-medium text-muted-foreground">File Number</Label>
                                    <p className="font-medium">{workflow.file_number}</p>
                                </div>
                                <div>
                                    <Label className="text-sm font-medium text-muted-foreground">Subject</Label>
                                    <p>{workflow.subject}</p>
                                </div>
                                <div>
                                    <Label className="text-sm font-medium text-muted-foreground">Priority</Label>
                                    <div className="mt-1">{getPriorityBadge(workflow.priority)}</div>
                                </div>
                                <div>
                                    <Label className="text-sm font-medium text-muted-foreground">Created</Label>
                                    <p>{new Date(workflow.file_created_at).toLocaleDateString()}</p>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Workflow Status</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <Label className="text-sm font-medium text-muted-foreground">Status</Label>
                                    <div className="mt-1">{getStatusBadge(workflow.workflow_status, workflow.sla_breached)}</div>
                                </div>
                                <div>
                                    <Label className="text-sm font-medium text-muted-foreground">Current Stage</Label>
                                    <p className="font-medium">{workflow.current_stage_name}</p>
                                </div>
                                <div>
                                    <Label className="text-sm font-medium text-muted-foreground">Template</Label>
                                    <p>{workflow.template_name}</p>
                                </div>
                                <div>
                                    <Label className="text-sm font-medium text-muted-foreground">SLA Deadline</Label>
                                    <div className="flex items-center gap-1 mt-1">
                                        <Clock className="w-4 h-4" />
                                        {new Date(workflow.sla_deadline).toLocaleDateString()}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>Current Assignment</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {workflow.assigned_user_name ? (
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-lg font-medium">
                                        {workflow.assigned_user_name.charAt(0)}
                                    </div>
                                    <div>
                                        <div className="font-medium">{workflow.assigned_user_name}</div>
                                        <div className="text-sm text-muted-foreground">
                                            {workflow.assigned_user_designation} • {workflow.department_name}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-muted-foreground">No current assignee</p>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="stages" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Workflow Stages</CardTitle>
                            <CardDescription>
                                Progress through the workflow stages
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {workflow.stages.map((stage, index) => {
                                    const stageInstance = workflow.stageInstances?.find(si => si.stage_id === stage.id);
                                    const isCurrentStage = stage.id === workflow.current_stage_id;
                                    const isCompleted = stageInstance?.stage_status === 'COMPLETED';
                                    const isInProgress = stageInstance?.stage_status === 'IN_PROGRESS';

                                    return (
                                        <div key={stage.id} className={`border rounded-lg p-4 ${
                                            isCurrentStage ? 'border-primary bg-primary/5' : 
                                            isCompleted ? 'border-green-200 bg-green-50' : 
                                            'border-gray-200'
                                        }`}>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                                                        isCurrentStage ? 'bg-primary text-primary-foreground' :
                                                        isCompleted ? 'bg-green-500 text-white' :
                                                        'bg-gray-200 text-gray-600'
                                                    }`}>
                                                        {index + 1}
                                                    </div>
                                                    <div>
                                                        <div className="font-medium">{stage.stage_name}</div>
                                                        <div className="text-sm text-muted-foreground">
                                                            {stage.stage_code} • SLA: {stage.sla_hours}h
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {stageInstance && (
                                                        <div className="text-sm">
                                                            {getStageStatusBadge(stageInstance.stage_status)}
                                                        </div>
                                                    )}
                                                    {isCurrentStage && (
                                                        <Badge variant="outline">Current</Badge>
                                                    )}
                                                </div>
                                            </div>
                                            
                                            {stageInstance && (
                                                <div className="mt-3 pt-3 border-t">
                                                    <div className="text-sm text-muted-foreground">
                                                        Assigned to: {stageInstance.user_name} ({stageInstance.user_designation})
                                                    </div>
                                                    {stageInstance.started_at && (
                                                        <div className="text-sm text-muted-foreground">
                                                            Started: {new Date(stageInstance.started_at).toLocaleDateString()}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="actions" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Action History</CardTitle>
                            <CardDescription>
                                Recent actions performed on this workflow
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {workflow.actions && workflow.actions.length > 0 ? (
                                <div className="space-y-4">
                                    {workflow.actions.map((action) => (
                                        <div key={action.id} className="flex items-center justify-between p-3 border rounded-lg">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 bg-primary/10 text-primary rounded-full flex items-center justify-center text-sm font-medium">
                                                    {action.action_type.charAt(0)}
                                                </div>
                                                <div>
                                                    <div className="font-medium">{action.action_type}</div>
                                                    <div className="text-sm text-muted-foreground">
                                                        by {action.user_name} ({action.user_designation})
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-sm text-muted-foreground">
                                                {new Date(action.performed_at).toLocaleDateString()}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-center py-4 text-muted-foreground">
                                    No actions recorded yet
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="team" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Workflow Team</CardTitle>
                            <CardDescription>
                                Users involved in this workflow
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {workflow.stageInstances?.map((stageInstance) => (
                                    <div key={stageInstance.id} className="flex items-center justify-between p-3 border rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-primary/10 text-primary rounded-full flex items-center justify-center text-sm font-medium">
                                                {stageInstance.user_name?.charAt(0)}
                                            </div>
                                            <div>
                                                <div className="font-medium">{stageInstance.user_name}</div>
                                                <div className="text-sm text-muted-foreground">
                                                    {stageInstance.user_designation} • {stageInstance.stage_name}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sm font-medium">
                                                {getStageStatusBadge(stageInstance.stage_status)}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {stageInstance.started_at && new Date(stageInstance.started_at).toLocaleDateString()}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
