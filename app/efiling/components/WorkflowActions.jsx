"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { 
    CheckCircle, 
    XCircle, 
    ArrowRight, 
    RotateCcw, 
    Clock,
    AlertCircle,
    User,
    Building
} from "lucide-react";

export default function WorkflowActions({ fileId, currentUser }) {
    const { toast } = useToast();
    const [workflowStatus, setWorkflowStatus] = useState(null);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [remarks, setRemarks] = useState("");
    const [showActionForm, setShowActionForm] = useState(false);
    const [selectedAction, setSelectedAction] = useState("");

    useEffect(() => {
        if (fileId) {
            fetchWorkflowStatus();
        }
    }, [fileId]);

    const fetchWorkflowStatus = async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/efiling/files/${fileId}/progress-workflow`);
            if (response.ok) {
                const data = await response.json();
                setWorkflowStatus(data);
            }
        } catch (error) {
            console.error('Error fetching workflow status:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleWorkflowAction = async (action) => {
        if (!remarks.trim()) {
            toast({
                title: "Remarks Required",
                description: "Please provide remarks for this action",
                variant: "destructive",
            });
            return;
        }

        try {
            setActionLoading(true);
            const response = await fetch(`/api/efiling/files/${fileId}/progress-workflow`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action,
                    userId: currentUser?.id,
                    remarks: remarks.trim()
                })
            });

            if (response.ok) {
                const result = await response.json();
                toast({
                    title: "Success",
                    description: `File ${action.toLowerCase()}d successfully`,
                });
                
                // Reset form and refresh status
                setRemarks("");
                setShowActionForm(false);
                setSelectedAction("");
                fetchWorkflowStatus();
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Action failed');
            }
        } catch (error) {
            toast({
                title: "Error",
                description: error.message || "Failed to perform action",
                variant: "destructive",
            });
        } finally {
            setActionLoading(false);
        }
    };

    const getActionButtons = () => {
        if (!workflowStatus) return null;

        const buttons = [];

        // Approve button
        buttons.push(
            <Button
                key="approve"
                onClick={() => {
                    setSelectedAction("APPROVE");
                    setShowActionForm(true);
                }}
                className="bg-green-600 hover:bg-green-700"
                disabled={actionLoading}
            >
                <CheckCircle className="w-4 h-4 mr-2" />
                Approve
            </Button>
        );

        // Forward button
        buttons.push(
            <Button
                key="forward"
                onClick={() => {
                    setSelectedAction("FORWARD");
                    setShowActionForm(true);
                }}
                className="bg-blue-600 hover:bg-blue-700"
                disabled={actionLoading}
            >
                <ArrowRight className="w-4 h-4 mr-2" />
                Forward
            </Button>
        );

        // Reject button
        buttons.push(
            <Button
                key="reject"
                onClick={() => {
                    setSelectedAction("REJECT");
                    setShowActionForm(true);
                }}
                variant="destructive"
                disabled={actionLoading}
            >
                <XCircle className="w-4 h-4 mr-2" />
                Reject
            </Button>
        );

        // Return button
        buttons.push(
            <Button
                key="return"
                onClick={() => {
                    setSelectedAction("RETURN");
                    setShowActionForm(true);
                }}
                variant="outline"
                disabled={actionLoading}
            >
                <RotateCcw className="w-4 h-4 mr-2" />
                Return
            </Button>
        );

        return buttons;
    };

    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Workflow Status</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-center py-4">
                        <Clock className="w-5 h-5 animate-spin mr-2" />
                        Loading workflow status...
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (!workflowStatus || !workflowStatus.workflow_template_name) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Workflow Status</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-center py-4 text-gray-500">
                        <AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                        <p>No workflow assigned to this file</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            {/* Current Workflow Status */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center">
                        <Clock className="w-5 h-5 mr-2" />
                        Workflow Status
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label className="text-sm font-medium text-gray-600">Workflow Template</Label>
                            <p className="text-sm text-gray-900 font-medium">
                                {workflowStatus.workflow_template_name}
                            </p>
                        </div>
                        <div>
                            <Label className="text-sm font-medium text-gray-600">Current Stage</Label>
                            <Badge className="bg-blue-100 text-blue-800">
                                {workflowStatus.stage_name || 'Not started'}
                            </Badge>
                        </div>
                        <div>
                            <Label className="text-sm font-medium text-gray-600">Stage Order</Label>
                            <p className="text-sm text-gray-900">
                                {workflowStatus.stage_order || 'N/A'}
                            </p>
                        </div>
                        <div>
                            <Label className="text-sm font-medium text-gray-600">Status</Label>
                            <Badge className="bg-green-100 text-green-800">
                                {workflowStatus.workflow_status || 'Active'}
                            </Badge>
                        </div>
                    </div>

                    {workflowStatus.description && (
                        <div>
                            <Label className="text-sm font-medium text-gray-600">Stage Description</Label>
                            <p className="text-sm text-gray-700 mt-1">
                                {workflowStatus.description}
                            </p>
                        </div>
                    )}

                    {workflowStatus.department_name && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Building className="w-4 h-4" />
                            <span>{workflowStatus.department_name}</span>
                        </div>
                    )}

                    {workflowStatus.role_name && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                            <User className="w-4 h-4" />
                            <span>{workflowStatus.role_name}</span>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Workflow Actions */}
            <Card>
                <CardHeader>
                    <CardTitle>Workflow Actions</CardTitle>
                </CardHeader>
                <CardContent>
                    {!showActionForm ? (
                        <div className="flex flex-wrap gap-2">
                            {getActionButtons()}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="remarks">Remarks for {selectedAction.toLowerCase()} action</Label>
                                <Textarea
                                    id="remarks"
                                    value={remarks}
                                    onChange={(e) => setRemarks(e.target.value)}
                                    placeholder={`Enter remarks for ${selectedAction.toLowerCase()} action...`}
                                    rows={3}
                                    className="mt-1"
                                />
                            </div>
                            
                            <div className="flex gap-2">
                                <Button
                                    onClick={() => handleWorkflowAction(selectedAction)}
                                    disabled={actionLoading || !remarks.trim()}
                                    className="bg-blue-600 hover:bg-blue-700"
                                >
                                    {actionLoading ? (
                                        <Clock className="w-4 h-4 animate-spin mr-2" />
                                    ) : (
                                        <CheckCircle className="w-4 h-4 mr-2" />
                                    )}
                                    {actionLoading ? "Processing..." : `Confirm ${selectedAction}`}
                                </Button>
                                
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setShowActionForm(false);
                                        setSelectedAction("");
                                        setRemarks("");
                                    }}
                                    disabled={actionLoading}
                                >
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
