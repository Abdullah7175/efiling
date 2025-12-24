"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useFormik } from "formik";
import * as Yup from "yup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, ArrowLeft, Save, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const validationSchema = Yup.object({
    subject: Yup.string().required('Subject is required').min(10, 'Subject must be at least 10 characters').max(500, 'Subject must not exceed 500 characters'),
    category_id: Yup.number().required('Category is required').min(1, 'Please select a category'),
    department_id: Yup.number().required('Department is required').min(1, 'Please select a department'),
    file_type_id: Yup.number().required('File type is required').min(1, 'Please select a file type'),
    assigned_to: Yup.mixed().nullable(),
    remarks: Yup.string().max(1000, 'Remarks must not exceed 1000 characters'),
});

export default function CreateNewFile() {
    const { data: session } = useSession();
    const router = useRouter();
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [departments, setDepartments] = useState([]);
    const [categories, setCategories] = useState([]);
    const [fileTypes, setFileTypes] = useState([]);
    const [users, setUsers] = useState([]);
    const [selectedDepartment, setSelectedDepartment] = useState(null);
    const [selectedWorkflow, setSelectedWorkflow] = useState(null);

    useEffect(() => { if (!session?.user?.id) return; fetchInitialData(); }, [session?.user?.id]);

    const fetchInitialData = async () => {
        try {
            const [deptRes, catRes, typeRes] = await Promise.all([
                fetch('/api/efiling/departments'),
                fetch('/api/efiling/categories'),
                fetch('/api/efiling/file-types')
            ]);
            if (deptRes.ok) setDepartments(await deptRes.json());
            if (catRes.ok) setCategories(await catRes.json());
            if (typeRes.ok) {
                const typeData = await typeRes.json();
                const list = Array.isArray(typeData) ? typeData : (Array.isArray(typeData.fileTypes) ? typeData.fileTypes : []);
                setFileTypes(list);
            }
        } catch (error) {
            console.error('Error fetching initial data:', error);
            toast({ title: "Error", description: "Failed to load form data", variant: "destructive" });
        }
    };

    const fetchUsersByDepartment = async (departmentId) => {
        if (!departmentId) { setUsers([]); return; }
        try { const res = await fetch(`/api/efiling/users?department_id=${departmentId}`); const data = res.ok ? await res.json() : []; setUsers(Array.isArray(data) ? data : []); } catch { setUsers([]); }
    };

    const formik = useFormik({
        initialValues: { subject: '', category_id: '', department_id: '', file_type_id: '', assigned_to: null, remarks: '' },
        validationSchema,
        onSubmit: async (values) => {
            setLoading(true);
            try {
                const response = await fetch('/api/efiling/files', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...values,
                        category_id: parseInt(values.category_id),
                        department_id: parseInt(values.department_id),
                        file_type_id: parseInt(values.file_type_id),
                        assigned_to: values.assigned_to ? parseInt(values.assigned_to) : null,
                        priority: 'high', confidentiality_level: 'normal',
                    })
                });
                if (response.ok) { const result = await response.json(); toast({ title: 'Success', description: `File ticket created successfully with number: ${result.file_number}` }); router.push(`/efiling/files/${result.id}/edit-document`); }
                else { const error = await response.json(); toast({ title: 'Error', description: error.error || 'Failed to create file ticket', variant: 'destructive' }); }
            } catch (error) { console.error('Error creating file ticket:', error); toast({ title: 'Error', description: 'Failed to create file ticket', variant: 'destructive' }); }
            finally { setLoading(false); }
        }
    });

    const handleDepartmentChange = (departmentId) => { formik.setFieldValue('department_id', departmentId); formik.setFieldValue('assigned_to', null); setSelectedDepartment(departmentId); fetchUsersByDepartment(departmentId); };
    const handleCategoryChange = (categoryId) => { formik.setFieldValue('category_id', categoryId); };

    const handleFileTypeChange = async (fileTypeId) => {
        formik.setFieldValue('file_type_id', fileTypeId);
        if (fileTypeId) {
            try {
                const response = await fetch(`/api/efiling/workflow-templates?file_type_id=${fileTypeId}`);
                if (response.ok) { const data = await response.json(); setSelectedWorkflow(data && data.length ? data[0] : null); }
            } catch { setSelectedWorkflow(null); }
        } else { setSelectedWorkflow(null); }
    };

    return (
        <div className="container mx-auto px-4 py-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-4">
                    <Button variant="ghost" onClick={() => router.back()} className="flex items-center"><ArrowLeft className="w-4 h-4 mr-2" />Back</Button>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Create New File Ticket</h1>
                        <p className="text-gray-600">Create a new file ticket for document processing</p>
                    </div>
                </div>
            </div>

            <form onSubmit={formik.handleSubmit}>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-6">
                        <Card>
                            <CardHeader><CardTitle className="flex items-center"><FileText className="w-5 h-5 mr-2" />File Ticket Information</CardTitle></CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <Label htmlFor="subject">Subject *</Label>
                                    <Input id="subject" name="subject" value={formik.values.subject} onChange={formik.handleChange} onBlur={formik.handleBlur} placeholder="Enter file subject..." className={formik.touched.subject && formik.errors.subject ? 'border-red-500' : ''} />
                                    {formik.touched.subject && formik.errors.subject && (<p className="text-red-500 text-sm mt-1">{formik.errors.subject}</p>)}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <Label htmlFor="department_id">Department *</Label>
                                        <Select value={formik.values.department_id ? formik.values.department_id.toString() : ""} onValueChange={handleDepartmentChange}>
                                            <SelectTrigger><SelectValue placeholder="Select Department" /></SelectTrigger>
                                            <SelectContent>{departments.map((dept) => (<SelectItem key={dept.id} value={dept.id.toString()}>{dept.name}</SelectItem>))}</SelectContent>
                                        </Select>
                                        {formik.touched.department_id && formik.errors.department_id && (<p className="text-red-500 text-sm mt-1">{formik.errors.department_id}</p>)}
                                    </div>

                                    <div>
                                        <Label htmlFor="category_id">Category *</Label>
                                        <Select value={formik.values.category_id ? formik.values.category_id.toString() : ""} onValueChange={handleCategoryChange}>
                                            <SelectTrigger><SelectValue placeholder="Select Category" /></SelectTrigger>
                                            <SelectContent>{categories.filter(cat => !selectedDepartment || cat.department_id == selectedDepartment).map((cat) => (<SelectItem key={cat.id} value={cat.id.toString()}>{cat.name}</SelectItem>))}</SelectContent>
                                        </Select>
                                        {formik.touched.category_id && formik.errors.category_id && (<p className="text-red-500 text-sm mt-1">{formik.errors.category_id}</p>)}
                                    </div>
                                </div>

                                <div>
                                    <Label htmlFor="file_type_id">File Type *</Label>
                                    <Select value={formik.values.file_type_id ? formik.values.file_type_id.toString() : ""} onValueChange={handleFileTypeChange}>
                                        <SelectTrigger><SelectValue placeholder="Select File Type" /></SelectTrigger>
                                        <SelectContent>{fileTypes.map((ft) => (<SelectItem key={ft.id} value={ft.id.toString()}>{ft.name} ({ft.code})</SelectItem>))}</SelectContent>
                                    </Select>
                                    <p className="text-sm text-gray-500 mt-1">Workflow will be attached based on the selected file type</p>
                                    {formik.touched.file_type_id && formik.errors.file_type_id && (<p className="text-red-500 text-sm mt-1">{formik.errors.file_type_id}</p>)}
                                </div>

                                {/* <div>
                                    <Label htmlFor="assigned_to">Initial Assignment (Optional)</Label>
                                    <Select value={formik.values.assigned_to ? formik.values.assigned_to.toString() : 'none'} onValueChange={(value) => formik.setFieldValue('assigned_to', value === 'none' ? null : value)}>
                                        <SelectTrigger><SelectValue placeholder="Select User (Optional)" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">No Assignment</SelectItem>
                                            {users.map((user) => (<SelectItem key={user.id} value={user.id.toString()}>{user.name} - {user.designation}</SelectItem>))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-sm text-gray-500 mt-1">Workflow will be attached based on the selected file type</p>
                                </div> */}


                                <div>
                                    <Label htmlFor="remarks">Initial Remarks</Label>
                                    <Textarea id="remarks" name="remarks" value={formik.values.remarks} onChange={formik.handleChange} onBlur={formik.handleBlur} placeholder="Enter any initial remarks..." rows={3} />
                                    {formik.touched.remarks && formik.errors.remarks && (<p className="text-red-500 text-sm mt-1">{formik.errors.remarks}</p>)}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="space-y-6">
                        <Card>
                            <CardHeader><CardTitle>File Ticket Preview</CardTitle></CardHeader>
                            <CardContent className="space-y-3">
                                <div>
                                    <Label className="text-sm font-medium text-gray-600">File Number</Label>
                                    <p className="text-sm text-gray-900">{formik.values.department_id && departments.find(d => d.id == formik.values.department_id)?.code ? `${departments.find(d => d.id == formik.values.department_id).code}/${new Date().getFullYear()}/XXXX` : 'Will be generated'}</p>
                                </div>
                                <div>
                                    <Label className="text-sm font-medium text-gray-600">Subject</Label>
                                    <p className="text-sm text-gray-900 truncate">{formik.values.subject || 'Not specified'}</p>
                                </div>
                                <div>
                                    <Label className="text-sm font-medium text-gray-600">Department</Label>
                                    <p className="text-sm text-gray-900">{departments.find(d => d.id == formik.values.department_id)?.name || 'Not selected'}</p>
                                </div>
                                <div>
                                    <Label className="text-sm font-medium text-gray-600">Priority</Label>
                                    <p className="text-sm text-gray-900 font-semibold text-red-600">High (Default)</p>
                                </div>
                            </CardContent>
                        </Card>

                        {selectedWorkflow && (
                            <Card>
                                <CardHeader><CardTitle className="flex items-center"><AlertCircle className="w-4 h-4 mr-2 text-blue-600" />Workflow Preview</CardTitle></CardHeader>
                                <CardContent className="space-y-3">
                                    <div><Label className="text-sm font-medium text-gray-600">Workflow Name</Label><p className="text-sm text-gray-900 font-medium">{selectedWorkflow.name}</p></div>
                                    <div><Label className="text-sm font-medium text-gray-600">Description</Label><p className="text-sm text-gray-900">{selectedWorkflow.description || 'No description available'}</p></div>
                                    <div><Label className="text-sm font-medium text-gray-600">Status</Label><p className="text-sm text-green-600 font-medium">✓ Auto-assigned</p></div>
                                </CardContent>
                            </Card>
                        )}

                        <Card>
                            <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
                            <CardContent className="space-y-3">
                                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={loading || !formik.isValid}>{loading ? (<div className="flex items-center"><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>Creating...</div>) : (<div className="flex items-center"><Save className="w-4 h-4 mr-2" />Create File Ticket</div>)}</Button>
                                <Button type="button" variant="outline" onClick={() => router.back()} className="w-full">Cancel</Button>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader><CardTitle className="flex items-center"><AlertCircle className="w-5 h-5 mr-2" />Help</CardTitle></CardHeader>
                            <CardContent className="space-y-2 text-sm text-gray-600">
                                <p>• This creates a file ticket number</p>
                                <p>• After creation, you&apos;ll be redirected to document editor</p>
                                <p>• Document editor will open in a new window</p>
                                <p>• You can format and create the actual document there</p>
                                <p>• E-signatures will be applied during document processing</p>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </form>
        </div>
    );
} 