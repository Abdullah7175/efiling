'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Plus, Trash2, Clock, Users, FileText } from 'lucide-react';

export default function CreateWorkflowTemplate() {
    const { data: session } = useSession();
    const router = useRouter();
    const { toast } = useToast();
    
    const [loading, setLoading] = useState(false);
    const [departments, setDepartments] = useState([]);
    const [roles, setRoles] = useState([]);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        stages: []
    });

    useEffect(() => {
        if (session?.user) {
            loadDepartments();
            loadRoles();
        }
    }, [session]);

    const loadDepartments = async () => {
        try {
            const response = await fetch('/api/efiling/departments');
            if (response.ok) {
                const data = await response.json();
                setDepartments(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            console.error('Error loading departments:', error);
        }
    };

    const loadRoles = async () => {
        try {
            const response = await fetch('/api/efiling/roles');
            if (response.ok) {
                const data = await response.json();
                setRoles(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            console.error('Error loading roles:', error);
        }
    };

    const addStage = () => {
        const newStage = {
            id: Date.now(),
            stage_name: '',
            stage_code: '',
            stage_order: formData.stages.length + 1,
            description: '',
            stage_type: 'ADMINISTRATIVE',
            sla_hours: 168,
            cycles: []
        };
        setFormData(prev => ({
            ...prev,
            stages: [...prev.stages, newStage]
        }));
    };

    const removeStage = (index) => {
        setFormData(prev => ({
            ...prev,
            stages: prev.stages.filter((_, i) => i !== index)
        }));
    };

    const updateStage = (index, field, value) => {
        setFormData(prev => ({
            ...prev,
            stages: prev.stages.map((stage, i) => 
                i === index ? { ...stage, [field]: value } : stage
            )
        }));
    };

    const addCycle = (stageIndex) => {
        const stage = formData.stages[stageIndex];
        const newCycle = {
            id: Date.now() + Math.random(),
            cycle_name: '',
            cycle_code: '',
            cycle_order: stage.cycles.length + 1,
            description: '',
            from_role_id: null,
            to_role_id: null,
            from_department_id: null,
            to_department_id: null,
            sla_hours: 24,
            can_attach_files: true,
            can_comment: true,
            can_escalate: false,
            requirements: '',
            is_timer_reset: false
        };
        
        setFormData(prev => ({
            ...prev,
            stages: prev.stages.map((stage, i) => 
                i === stageIndex 
                    ? { ...stage, cycles: [...stage.cycles, newCycle] }
                    : stage
            )
        }));
    };

    const removeCycle = (stageIndex, cycleIndex) => {
        setFormData(prev => ({
            ...prev,
            stages: prev.stages.map((stage, i) => 
                i === stageIndex 
                    ? { ...stage, cycles: stage.cycles.filter((_, j) => j !== cycleIndex) }
                    : stage
            )
        }));
    };

    const updateCycle = (stageIndex, cycleIndex, field, value) => {
        setFormData(prev => ({
            ...prev,
            stages: prev.stages.map((stage, i) => 
                i === stageIndex 
                    ? {
                        ...stage,
                        cycles: stage.cycles.map((cycle, j) => 
                            j === cycleIndex ? { ...cycle, [field]: value } : cycle
                        )
                    }
                    : stage
            )
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.name || formData.stages.length === 0) {
            toast({
                title: "Validation Error",
                description: "Please provide template name and at least one stage",
                variant: "destructive"
            });
            return;
        }

        // Validate each stage has cycles
        for (let i = 0; i < formData.stages.length; i++) {
            if (formData.stages[i].cycles.length === 0) {
                toast({
                    title: "Validation Error",
                    description: `Stage ${i + 1} must have at least one cycle`,
                    variant: "destructive"
                });
                return;
            }
        }

        try {
            setLoading(true);
            
            const response = await fetch('/api/efiling/workflow-templates', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: formData.name,
                    description: formData.description,
                    stages: formData.stages.map(stage => ({
                        name: stage.stage_name,
                        code: stage.stage_code,
                        description: stage.description,
                        stageType: stage.stage_type,
                        slaHours: stage.sla_hours,
                        cycles: stage.cycles.map(cycle => ({
                            name: cycle.cycle_name,
                            code: cycle.cycle_code,
                            description: cycle.description,
                            fromRoleId: cycle.from_role_id,
                            toRoleId: cycle.to_role_id,
                            fromDepartmentId: cycle.from_department_id,
                            toDepartmentId: cycle.to_department_id,
                            slaHours: cycle.sla_hours,
                            canAttachFiles: cycle.can_attach_files,
                            canComment: cycle.can_comment,
                            canEscalate: cycle.can_escalate,
                            requirements: cycle.requirements,
                            isTimerReset: cycle.is_timer_reset
                        }))
                    })),
                    createdBy: session.user.id,
                    ipAddress: '127.0.0.1',
                    userAgent: navigator.userAgent
                }),
            });

            if (response.ok) {
                const data = await response.json();
                toast({
                    title: "Success",
                    description: "Workflow template created successfully",
                });
                router.push('/efiling/workflow-templates');
            } else {
                const error = await response.json();
                toast({
                    title: "Error",
                    description: error.error || "Failed to create workflow template",
                    variant: "destructive"
                });
            }
        } catch (error) {
            console.error('Error creating workflow template:', error);
            toast({
                title: "Error",
                description: "Failed to create workflow template",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    if (!session) {
        return <div>Please sign in to access this page.</div>;
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
                    <h1 className="text-3xl font-bold">Create Workflow Template</h1>
                    <p className="text-muted-foreground">
                        Define workflow stages and cycles for file types
                    </p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Template Details</CardTitle>
                        <CardDescription>
                            Define the workflow template name and description
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label htmlFor="name">Template Name *</Label>
                            <Input
                                id="name"
                                placeholder="e.g., Water Bulk Work for Pipeline"
                                value={formData.name}
                                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                required
                            />
                        </div>
                        <div>
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                placeholder="Describe the workflow purpose and requirements..."
                                value={formData.description}
                                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                rows={3}
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>Workflow Stages</CardTitle>
                                <CardDescription>
                                    Define major stages (Administrative, Financial, Execution) and cycles within each stage
                                </CardDescription>
                            </div>
                            <Button
                                type="button"
                                onClick={addStage}
                                className="flex items-center gap-2"
                            >
                                <Plus className="w-4 h-4" />
                                Add Stage
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-6">
                            {formData.stages.map((stage, stageIndex) => (
                                <div key={stage.id} className="border rounded-lg p-6 space-y-4 bg-gray-50">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">
                                                {stageIndex + 1}
                                            </div>
                                            <div>
                                                <h4 className="text-lg font-semibold">Stage {stageIndex + 1}</h4>
                                                <p className="text-sm text-muted-foreground">Major workflow stage</p>
                                            </div>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => removeStage(stageIndex)}
                                            className="text-red-600 hover:text-red-700"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <Label>Stage Name *</Label>
                                            <Input
                                                placeholder="e.g., Administrative Stage"
                                                value={stage.stage_name}
                                                onChange={(e) => updateStage(stageIndex, 'stage_name', e.target.value)}
                                                required
                                            />
                                        </div>
                                        <div>
                                            <Label>Stage Code *</Label>
                                            <Input
                                                placeholder="e.g., ADMIN"
                                                value={stage.stage_code}
                                                onChange={(e) => updateStage(stageIndex, 'stage_code', e.target.value)}
                                                required
                                            />
                                        </div>
                                        <div>
                                            <Label>Stage Type</Label>
                                            <Select
                                                value={stage.stage_type}
                                                onValueChange={(value) => updateStage(stageIndex, 'stage_type', value)}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="ADMINISTRATIVE">Administrative</SelectItem>
                                                    <SelectItem value="FINANCIAL">Financial</SelectItem>
                                                    <SelectItem value="EXECUTION">Execution</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <Label>Stage Description</Label>
                                        <Textarea
                                            placeholder="Describe what this stage accomplishes..."
                                            value={stage.description}
                                            onChange={(e) => updateStage(stageIndex, 'description', e.target.value)}
                                            rows={2}
                                        />
                                    </div>
                                    
                                    <div>
                                        <Label>Stage SLA (Hours)</Label>
                                        <Input
                                            type="number"
                                            placeholder="168 (7 days)"
                                            value={stage.sla_hours}
                                            onChange={(e) => updateStage(stageIndex, 'sla_hours', parseInt(e.target.value) || 168)}
                                        />
                                    </div>

                                    {/* Cycles within this stage */}
                                    <div className="border-t pt-4">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-2">
                                                <Clock className="w-4 h-4" />
                                                <h5 className="font-medium">Cycles within Stage {stageIndex + 1}</h5>
                                            </div>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => addCycle(stageIndex)}
                                                className="flex items-center gap-2"
                                            >
                                                <Plus className="w-3 h-3" />
                                                Add Cycle
                                            </Button>
                                        </div>
                                        
                                        <div className="space-y-4">
                                            {stage.cycles.map((cycle, cycleIndex) => (
                                                <div key={cycle.id} className="border rounded-lg p-4 space-y-4 bg-white">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-6 h-6 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center text-xs font-medium">
                                                                {cycleIndex + 1}
                                                            </div>
                                                            <h6 className="font-medium">Cycle {cycleIndex + 1}</h6>
                                                        </div>
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => removeCycle(stageIndex, cycleIndex)}
                                                            className="text-red-600 hover:text-red-700 h-8 px-2"
                                                        >
                                                            <Trash2 className="w-3 h-3" />
                                                        </Button>
                                                    </div>
                                                    
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div>
                                                            <Label>Cycle Name *</Label>
                                                            <Input
                                                                placeholder="e.g., XEN Create File then Mark to SE"
                                                                value={cycle.cycle_name}
                                                                onChange={(e) => updateCycle(stageIndex, cycleIndex, 'cycle_name', e.target.value)}
                                                                required
                                                            />
                                                        </div>
                                                        <div>
                                                            <Label>Cycle Code *</Label>
                                                            <Input
                                                                placeholder="e.g., XEN_TO_SE"
                                                                value={cycle.cycle_code}
                                                                onChange={(e) => updateCycle(stageIndex, cycleIndex, 'cycle_code', e.target.value)}
                                                                required
                                                            />
                                                        </div>
                                                    </div>
                                                    
                                                    <div>
                                                        <Label>Description</Label>
                                                        <Textarea
                                                            placeholder="Describe what happens in this cycle..."
                                                            value={cycle.description}
                                                            onChange={(e) => updateCycle(stageIndex, cycleIndex, 'description', e.target.value)}
                                                            rows={2}
                                                        />
                                                    </div>
                                                    
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                        <div>
                                                            <Label>From Role</Label>
                                                            <Select
                                                                value={cycle.from_role_id || 'none'}
                                                                onValueChange={(value) => updateCycle(stageIndex, cycleIndex, 'from_role_id', value === 'none' ? null : parseInt(value))}
                                                            >
                                                                <SelectTrigger>
                                                                    <SelectValue placeholder="Select role" />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="none">No specific role</SelectItem>
                                                                    {roles.map((role) => (
                                                                        <SelectItem key={role.id} value={role.id}>
                                                                            {role.name}
                                                                        </SelectItem>                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                        <div>
                                                            <Label>To Role</Label>
                                                            <Select
                                                                value={cycle.to_role_id || ''}
                                                                onValueChange={(value) => updateCycle(stageIndex, cycleIndex, 'to_role_id', value === '' ? null : parseInt(value))}
                                                            >
                                                                <SelectTrigger>
                                                                    <SelectValue placeholder="Select role" />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="none">No specific role</SelectItem>
                                                                    {roles.map((role) => (
                                                                        <SelectItem key={role.id} value={role.id}>
                                                                            {role.name}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                        <div>
                                                            <Label>Cycle SLA (Hours)</Label>
                                                            <Input
                                                                type="number"
                                                                placeholder="24"
                                                                value={cycle.sla_hours}
                                                                onChange={(e) => updateCycle(stageIndex, cycleIndex, 'sla_hours', parseInt(e.target.value) || 24)}
                                                            />
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                        <div>
                                                            <Label>From Department</Label>
                                                            <Select
                                                                value={cycle.from_department_id || ''}
                                                                onValueChange={(value) => updateCycle(stageIndex, cycleIndex, 'from_department_id', value === '' ? null : parseInt(value))}
                                                            >
                                                                <SelectTrigger>
                                                                    <SelectValue placeholder="Select department" />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="none">No specific department</SelectItem>
                                                                    {departments.map((dept) => (
                                                                        <SelectItem key={dept.id} value={dept.id}>
                                                                            {dept.name}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                        <div>
                                                            <Label>To Department</Label>
                                                            <Select
                                                                value={cycle.to_department_id || 'none'}
                                                                onValueChange={(value) => updateCycle(stageIndex, cycleIndex, 'to_department_id', value === 'none' ? null : parseInt(value))}
                                                            >
                                                                <SelectTrigger>
                                                                    <SelectValue placeholder="Select department" />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="none">No specific department</SelectItem>
                                                                    {departments.map((dept) => (
                                                                        <SelectItem key={dept.id} value={dept.id}>
                                                                            {dept.name}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                        <div className="flex items-center space-x-2">
                                                            <input
                                                                type="checkbox"
                                                                id={`timer_reset_${stageIndex}_${cycleIndex}`}
                                                                checked={cycle.is_timer_reset}
                                                                onChange={(e) => updateCycle(stageIndex, cycleIndex, 'is_timer_reset', e.target.checked)}
                                                                className="rounded"
                                                            />
                                                            <Label htmlFor={`timer_reset_${stageIndex}_${cycleIndex}`}>Timer Reset</Label>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div className="flex items-center space-x-2">
                                                            <input
                                                                type="checkbox"
                                                                id={`can_attach_${stageIndex}_${cycleIndex}`}
                                                                checked={cycle.can_attach_files}
                                                                onChange={(e) => updateCycle(stageIndex, cycleIndex, 'can_attach_files', e.target.checked)}
                                                                className="rounded"
                                                            />
                                                            <Label htmlFor={`can_attach_${stageIndex}_${cycleIndex}`}>Can attach files</Label>
                                                        </div>
                                                        <div className="flex items-center space-x-2">
                                                            <input
                                                                type="checkbox"
                                                                id={`can_comment_${stageIndex}_${cycleIndex}`}
                                                                checked={cycle.can_comment}
                                                                onChange={(e) => updateCycle(stageIndex, cycleIndex, 'can_comment', e.target.checked)}
                                                                className="rounded"
                                                            />
                                                            <Label htmlFor={`can_comment_${stageIndex}_${cycleIndex}`}>Can add comments</Label>
                                                        </div>
                                                    </div>
                                                    
                                                    <div>
                                                        <Label>Requirements/Attachments</Label>
                                                        <Textarea
                                                            placeholder="e.g., ATTACHMENT OF BIDDING DOCUMENTS, ATTACHMENT OF NOTE SHEET,BUDGET SLIP"
                                                            value={cycle.requirements}
                                                            onChange={(e) => updateCycle(stageIndex, cycleIndex, 'requirements', e.target.value)}
                                                            rows={2}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                            
                                            {stage.cycles.length === 0 && (
                                                <div className="text-center py-6 text-muted-foreground border-2 border-dashed rounded-lg">
                                                    <p>No cycles defined for this stage yet.</p>
                                                    <p>Click &quot;Add Cycle&quot; to start building the workflow cycles.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            
                            {formData.stages.length === 0 && (
                                <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                                    <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                                    <p className="text-lg font-medium">No stages defined yet.</p>
                                    <p>Click &quot;Add Stage&quot; to start building your workflow template.</p>
                                    <p className="text-sm mt-2">Each stage (Administrative, Financial, Execution) contains multiple cycles.</p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <div className="flex justify-end gap-4">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => router.back()}
                        disabled={loading}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        disabled={loading || !formData.name || formData.stages.length === 0}
                        className="flex items-center gap-2"
                    >
                        {loading ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                Creating...
                            </>
                        ) : (
                            <>
                                <Plus className="w-4 h-4" />
                                Create Template
                            </>
                        )}
                    </Button>
                </div>
            </form>
        </div>
    );
}

