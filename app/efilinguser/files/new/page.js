"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useFormik } from "formik";
import * as Yup from "yup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    FileText,
    ArrowLeft,
    Save,
    Building2,
    User,
    AlertCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEfilingUser } from "@/context/EfilingUserContext";
import { SearchableDropdown } from "@/components/SearchableDropdown";
import { getFiscalYear } from "@/lib/utils";

const validationSchema = Yup.object({
    subject: Yup.string()
        .required('Subject is required')
        .min(10, 'Subject must be at least 10 characters')
        .max(500, 'Subject must not exceed 500 characters'),
    category_id: Yup.number()
        .required('Category is required')
        .min(1, 'Please select a category'),
    department_id: Yup.number()
        .required('Department is required')
        .min(1, 'Please select a department'),
    file_type_id: Yup.number()
        .required('File type is required')
        .min(1, 'Please select a file type'),
    assigned_to: Yup.mixed().nullable(),
    remarks: Yup.string().max(1000, 'Remarks must not exceed 1000 characters'),
});

export default function CreateNewFile() {
    const { data: session, status: sessionStatus } = useSession();
    const router = useRouter();
    const { toast } = useToast();
    const { profile: userProfile, isGlobal } = useEfilingUser();

    const [loading, setLoading] = useState(false);
    const [departments, setDepartments] = useState([]);
    const [categories, setCategories] = useState([]);
    const [fileTypes, setFileTypes] = useState([]);
    const [users, setUsers] = useState([]);
    const dataFetchedRef = useRef(false);

    const userDepartmentId = userProfile?.department_id ? Number(userProfile.department_id) : null;


    const filterDepartmentsByUser = (rawDepartments = []) => {
        if (isGlobal) return rawDepartments;
        if (!userDepartmentId) return [];
        return rawDepartments.filter((dept) => Number(dept.id) === userDepartmentId);
    };

    const filterCategoriesByUser = (rawCategories = []) => {
        if (isGlobal) return rawCategories;
        if (!userDepartmentId) return [];
        return rawCategories.filter((category) => Number(category.department_id) === userDepartmentId);
    };

    const filterFileTypesByUser = (rawFileTypes = []) => {
        if (isGlobal) return rawFileTypes;
        if (!userDepartmentId) return [];
        return rawFileTypes.filter((type) => {
            if (type.department_id && Number(type.department_id) !== userDepartmentId) {
                return false;
            }
            return true;
        });
    };

    const profileReady = isGlobal || Boolean(userProfile);
    const fetchInitialData = useCallback(async () => {
        // Don't make API calls if user is not authenticated or session is loading
        if (sessionStatus !== 'authenticated' || !session?.user?.id || !profileReady) {
            return;
        }
        
        // Prevent multiple fetches
        if (dataFetchedRef.current) {
            return;
        }
        
        dataFetchedRef.current = true;
        
        try {
            const [deptRes, catRes, typeRes] = await Promise.allSettled([
                fetch('/api/efiling/departments').catch(err => {
                    console.error('Error fetching departments:', err);
                    return { ok: false, status: 500 };
                }),
                fetch('/api/efiling/categories').catch(err => {
                    console.error('Error fetching categories:', err);
                    return { ok: false, status: 500 };
                }),
                fetch('/api/efiling/file-types').catch(err => {
                    console.error('Error fetching file types:', err);
                    return { ok: false, status: 500 };
                }),
            ]);

            if (deptRes.status === 'fulfilled' && deptRes.value.ok) {
                try {
                    const deptData = await deptRes.value.json();
                    const list = Array.isArray(deptData?.departments) ? deptData.departments : Array.isArray(deptData) ? deptData : [];
                    setDepartments(filterDepartmentsByUser(list));
                } catch (err) {
                    console.error('Error parsing departments response:', err);
                }
            }
            if (catRes.status === 'fulfilled' && catRes.value.ok) {
                try {
                    const catData = await catRes.value.json();
                    const list = Array.isArray(catData?.categories) ? catData.categories : Array.isArray(catData) ? catData : [];
                    setCategories(filterCategoriesByUser(list));
                } catch (err) {
                    console.error('Error parsing categories response:', err);
                }
            }
            if (typeRes.status === 'fulfilled' && typeRes.value.ok) {
                try {
                    const typeData = await typeRes.value.json();
                    const list = Array.isArray(typeData?.fileTypes) ? typeData.fileTypes : Array.isArray(typeData) ? typeData : [];
                    setFileTypes(filterFileTypesByUser(list));
                } catch (err) {
                    console.error('Error parsing file types response:', err);
                }
            }

        } catch (error) {
            // Only log errors if session is still authenticated (to avoid logging logout-related errors)
            if (sessionStatus === 'authenticated' && !loading) {
                console.error('Error fetching initial data:', error);
                // Don't show toast if we're navigating away (file was just created)
                toast({ title: "Error", description: "Failed to load some form data. Please refresh if needed.", variant: "destructive" });
            }
        } finally {
            // Reset the flag after a delay to allow refetch if needed
            setTimeout(() => {
                dataFetchedRef.current = false;
            }, 5000);
        }
    }, [filterDepartmentsByUser, filterCategoriesByUser, filterFileTypesByUser, toast, session?.user?.id, sessionStatus, profileReady, loading]);

    useEffect(() => {
        if (sessionStatus !== 'authenticated' || !session?.user?.id || !profileReady) return;
        fetchInitialData();
    }, [sessionStatus, session?.user?.id, profileReady, fetchInitialData]);

    const fetchUsersByDepartment = async (departmentId) => {
        if (!departmentId) { setUsers([]); return; }
        try {
            const res = await fetch(`/api/efiling/users?department_id=${departmentId}`);
            const data = res.ok ? await res.json() : [];
            setUsers(Array.isArray(data) ? data : []);
        } catch {
            setUsers([]);
        }
    };


    const formik = useFormik({
        initialValues: {
            subject: '',
            category_id: '',
            department_id: '',
            file_type_id: '',
            assigned_to: null,
            remarks: '',
        },
        validationSchema,
        onSubmit: async (values) => {
            setLoading(true);
            try {
                const response = await fetch('/api/efiling/files', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...values,
                        category_id: parseInt(values.category_id),
                        department_id: parseInt(values.department_id),
                        file_type_id: parseInt(values.file_type_id),
                        assigned_to: values.assigned_to ? parseInt(values.assigned_to) : null,
                        priority: 'high',
                        confidentiality_level: 'normal',
                    }),
                });

                if (response.ok) {
                    const result = await response.json();
                    // Prevent further data fetching since we're navigating away
                    dataFetchedRef.current = true;
                    toast({ title: "Success", description: `File ticket created successfully with number: ${result.file_number}` });
                    // Small delay to ensure toast is visible before navigation
                    setTimeout(() => {
                        router.push(`/efilinguser/files/${result.id}/edit-document`);
                    }, 100);
                } else {
                    const error = await response.json();
                    toast({ title: "Error", description: error.error || "Failed to create file ticket", variant: "destructive" });
                }
            } catch (error) {
                console.error('Error creating file ticket:', error);
                toast({ title: "Error", description: "Failed to create file ticket", variant: "destructive" });
            } finally {
                setLoading(false);
            }
        },
    });


    const selectedDepartmentId = formik.values.department_id ? Number(formik.values.department_id) : null;
    const selectedCategoryId = formik.values.category_id ? Number(formik.values.category_id) : null;

    const availableCategories = useMemo(() => {
        return categories.filter((category) => {
            if (!selectedDepartmentId) return true;
            return Number(category.department_id) === selectedDepartmentId;
        });
    }, [categories, selectedDepartmentId]);

    const availableFileTypes = useMemo(() => {
        return fileTypes.filter((type) => {
            if (selectedDepartmentId && type.department_id && Number(type.department_id) !== selectedDepartmentId) {
                return false;
            }
            if (selectedCategoryId && type.category_id && Number(type.category_id) !== selectedCategoryId) {
                return false;
            }
            return true;
        });
    }, [fileTypes, selectedDepartmentId, selectedCategoryId]);


    const handleDepartmentChange = (departmentId) => {
        formik.setFieldValue('department_id', departmentId);
        formik.setFieldValue('category_id', '');
        formik.setFieldValue('file_type_id', '');
        formik.setFieldValue('assigned_to', null);
        const numericId = Number(departmentId);
        fetchUsersByDepartment(Number.isNaN(numericId) ? null : numericId);
    };

    const handleCategoryChange = (categoryId) => {
        formik.setFieldValue('category_id', categoryId);
        formik.setFieldValue('file_type_id', '');
    };

    const handleFileTypeChange = async (fileTypeId) => {
        formik.setFieldValue('file_type_id', fileTypeId);
    };

    useEffect(() => {
        if (!profileReady || !departments.length) return;

        const currentValue = formik.values.department_id;
        if (currentValue) {
            const numericCurrent = Number(currentValue);
            if (!departments.some((dept) => Number(dept.id) === numericCurrent)) {
                formik.setFieldValue('department_id', '');
                formik.setFieldValue('category_id', '');
                formik.setFieldValue('file_type_id', '');
            } else {
                fetchUsersByDepartment(numericCurrent);
            }
            return;
        }

        let target = null;
        if (!isGlobal && userDepartmentId && departments.some((dept) => Number(dept.id) === userDepartmentId)) {
            target = userDepartmentId;
        } else if (departments.length === 1) {
            target = Number(departments[0].id);
        }

        if (target !== null) {
            formik.setFieldValue('department_id', target.toString());
            fetchUsersByDepartment(target);
        }
    }, [departments, profileReady, isGlobal, userDepartmentId]);

    useEffect(() => {
        const current = formik.values.category_id;
        if (current) {
            const numericCurrent = Number(current);
            if (!availableCategories.some((category) => Number(category.id) === numericCurrent)) {
                formik.setFieldValue('category_id', '');
                formik.setFieldValue('file_type_id', '');
            }
        } else if (availableCategories.length === 1) {
            const target = availableCategories[0].id.toString();
            if (formik.values.category_id !== target) {
                formik.setFieldValue('category_id', target);
            }
        }
    }, [availableCategories]);

    useEffect(() => {
        const current = formik.values.file_type_id;
        if (current) {
            const numericCurrent = Number(current);
            if (!availableFileTypes.some((type) => Number(type.id) === numericCurrent)) {
                formik.setFieldValue('file_type_id', '');
            }
        } else if (availableFileTypes.length === 1) {
            const target = availableFileTypes[0].id.toString();
            if (formik.values.file_type_id !== target) {
                formik.setFieldValue('file_type_id', target);
            }
        }
    }, [availableFileTypes]);


    if (!profileReady) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-lg">Loading your profile…</div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-4">
                    <Button variant="ghost" onClick={() => router.back()} className="flex items-center">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back
                    </Button>
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
                            <CardHeader>
                                <CardTitle className="flex items-center">
                                    <FileText className="w-5 h-5 mr-2" />
                                    File Ticket Information
                                </CardTitle>
                            </CardHeader>
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
                                            <SelectTrigger id="department_id">
                                                <SelectValue placeholder="Select Department" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {departments.map((dept) => (
                                                    <SelectItem key={dept.id} value={dept.id.toString()}>
                                                        {dept.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {formik.touched.department_id && formik.errors.department_id && (<p className="text-red-500 text-sm mt-1">{formik.errors.department_id}</p>)}
                                    </div>

                                    <div>
                                        <Label htmlFor="category_id">Category *</Label>
                                        <Select value={formik.values.category_id ? formik.values.category_id.toString() : ""} onValueChange={handleCategoryChange}>
                                            <SelectTrigger id="category_id">
                                                <SelectValue placeholder="Select Category" />
                                            </SelectTrigger>
                                        <SelectContent>
                                            {availableCategories.map((cat) => (
                                                <SelectItem key={cat.id} value={cat.id.toString()}>
                                                    {cat.name}
                                                </SelectItem>
                                            ))}
                                            </SelectContent>
                                        </Select>
                                        {formik.touched.category_id && formik.errors.category_id && (<p className="text-red-500 text-sm mt-1">{formik.errors.category_id}</p>)}
                                    </div>
                                </div>

                                <div>
                                    <Label htmlFor="file_type_id">File Type *</Label>
                                    <Select value={formik.values.file_type_id ? formik.values.file_type_id.toString() : ""} onValueChange={handleFileTypeChange}>
                                        <SelectTrigger id="file_type_id">
                                            <SelectValue placeholder="Select File Type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableFileTypes.map((ft) => (
                                                <SelectItem key={ft.id} value={ft.id.toString()}>
                                                    {ft.name} ({ft.code})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-sm text-gray-500 mt-1">Marking rules and SLA deadlines will be applied automatically for this file type.</p>
                                    {formik.touched.file_type_id && formik.errors.file_type_id && (<p className="text-red-500 text-sm mt-1">{formik.errors.file_type_id}</p>)}
                                </div>

                                {/* <div>
                                    <Label htmlFor="assigned_to">Initial Assignment (Optional)</Label>
                                    <Select value={formik.values.assigned_to ? formik.values.assigned_to.toString() : 'none'} onValueChange={(value) => formik.setFieldValue('assigned_to', value === 'none' ? null : value)}>
                                        <SelectTrigger id="assigned_to">
                                            <SelectValue placeholder="Select User (Optional)" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">No Assignment</SelectItem>
                                            {users.map((user) => (
                                                <SelectItem key={user.id} value={user.id.toString()}>
                                                    {user.name} - {user.designation}
                                                </SelectItem>
                                            ))}
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
                            <CardHeader>
                                <CardTitle>File Ticket Preview</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div>
                                    <Label className="text-sm font-medium text-gray-600">File Number</Label>
                                    <p className="text-sm text-gray-900">
                                        {formik.values.department_id && departments.find(d => d.id == formik.values.department_id)?.code 
                                            ? `${departments.find(d => d.id == formik.values.department_id).code}/${getFiscalYear()}/XXXX` 
                                            : 'Will be generated'}
                                    </p>
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

                        <Card>
                            <CardHeader>
                                <CardTitle>Actions</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={loading || !formik.isValid}>
                                    {loading ? (<div className="flex items-center"><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>Creating...</div>) : (<div className="flex items-center"><Save className="w-4 h-4 mr-2" />Create File Ticket</div>)}
                                </Button>
                                <Button type="button" variant="outline" onClick={() => router.back()} className="w-full">Cancel</Button>
                            </CardContent>
                        </Card>

                        {/* <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center"><AlertCircle className="w-5 h-5 mr-2" />Help</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2 text-sm text-gray-600">
                                <p>• This creates a file ticket number</p>
                                <p>• After creation, you&apos;ll be redirected to document editor</p>
                                <p>• Document editor will open in a new window</p>
                                <p>• You can format and create the actual document there</p>
                                <p>• E-signatures will be applied during document processing</p>
                            </CardContent>
                        </Card> */}
                    </div>
                </div>
            </form>
        </div>
    );
} 