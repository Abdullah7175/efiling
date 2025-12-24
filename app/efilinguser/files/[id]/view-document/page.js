"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Download, Eye, FileText, User, Calendar, Building2, Shield, MessageSquare, Paperclip, Printer, FileDown, X, Maximize2, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import DocumentSignatureSystem from "../../../components/DocumentSignatureSystem";
import Image from "next/image";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

export default function DocumentViewer() {
    const { data: session } = useSession();
    const router = useRouter();
    const params = useParams();
    const { toast } = useToast();
    
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [pages, setPages] = useState([]);
    const [attachments, setAttachments] = useState([]);
    const [signatures, setSignatures] = useState([]);
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState("");
    const [posting, setPosting] = useState(false);
    const [currentPageId, setCurrentPageId] = useState(1);
    const [workRequest, setWorkRequest] = useState(null);
    const [beforeContent, setBeforeContent] = useState([]);
    const [selectedAttachment, setSelectedAttachment] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [timeline, setTimeline] = useState([]);

    const handlePrint = () => {
        window.print();
    };

    const handleExportPDF = async () => {
        try {
            toast({ title: "Generating PDF...", description: "Please wait while we prepare your document." });
            
            const originalTitle = document.title;
            document.title = `EFile_${file?.file_number || 'document'}_${new Date().toISOString().split('T')[0]}`;
            
            window.print();
            
            setTimeout(() => {
                document.title = originalTitle;
            }, 1000);
            
            toast({ 
                title: "PDF Export", 
                description: "Please select 'Save as PDF' in the print dialog to export." 
            });
        } catch (error) {
            console.error('PDF export error:', error);
            toast({ 
                title: "Export Failed", 
                description: "Failed to export PDF. Please try again.", 
                variant: "destructive" 
            });
        }
    };

	// SECURITY: Using centralized sanitization utility (DOMPurify-based)

    useEffect(() => {
		if (params.id) fetchFileData();
    }, [params.id]);

    useEffect(() => {
        if (file?.work_request_id) {
            fetchWorkRequest();
        }
    }, [file?.work_request_id]);

	async function fetchFileData() {
        try {
            setLoading(true);
			const fileRes = await fetch(`/api/efiling/files/${params.id}`);
			if (fileRes.ok) {
				const fileData = await fileRes.json();
                setFile(fileData);
				if (Array.isArray(fileData.pages) && fileData.pages.length) {
                    // Reverse pages so last page shows on top
                    const reversedPages = [...fileData.pages].reverse();
                    setPages(reversedPages);
                    setCurrentPageId(reversedPages[0]?.id || 1);
                } else {
					setPages([{ id: 1, pageNumber: 1, title: "Main Document", content: fileData.document_content || {}, type: "MAIN" }]);
				}
			}
			const attRes = await fetch(`/api/efiling/files/${params.id}/attachments`);
			if (attRes.ok) {
				const atts = await attRes.json();
				setAttachments(Array.isArray(atts) ? atts : []);
			}
			const sigRes = await fetch(`/api/efiling/files/${params.id}/signatures`);
			if (sigRes.ok) {
				const sigs = await sigRes.json();
				setSignatures(Array.isArray(sigs) ? sigs : []);
			}
			const comRes = await fetch(`/api/efiling/files/${params.id}/comments`);
			if (comRes.ok) {
				const coms = await comRes.json();
				setComments(Array.isArray(coms) ? coms : []);
			}
			const timelineRes = await fetch(`/api/efiling/files/${params.id}/timeline`);
			if (timelineRes.ok) {
				const timelineData = await timelineRes.json();
				setTimeline(Array.isArray(timelineData.events) ? timelineData.events : []);
			}
		} catch (e) {
			console.error(e);
			toast({ title: "Error", description: "Failed to fetch document data", variant: "destructive" });
        } finally {
            setLoading(false);
        }
	}

    async function fetchWorkRequest() {
        if (!file?.work_request_id) return;
        
        try {
            const workRes = await fetch(`/api/requests?id=${file.work_request_id}`);
            if (workRes.ok) {
                const workData = await workRes.json();
                setWorkRequest(workData);
                
                // Fetch before content for this work request
                const contentRes = await fetch(`/api/before-content?workRequestId=${file.work_request_id}`);
                if (contentRes.ok) {
                    const contentData = await contentRes.json();
                    setBeforeContent(Array.isArray(contentData) ? contentData : []);
                }
            }
        } catch (e) {
            console.error('Error fetching work request:', e);
        }
    }

    const openAttachmentModal = (attachment) => {
        setSelectedAttachment(attachment);
        setIsModalOpen(true);
    };

    const closeAttachmentModal = () => {
        setSelectedAttachment(null);
        setIsModalOpen(false);
    };

	const currentPage = pages.find((p) => p.id === currentPageId) || pages[0];
	const formatDate = (d) => new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
	const statusColor = (s) => ({ draft: "bg-gray-100 text-gray-800", pending: "bg-yellow-100 text-yellow-800", approved: "bg-green-100 text-green-800", rejected: "bg-red-100 text-red-800", completed: "bg-blue-100 text-blue-800" }[(s || "").toLowerCase()] || "bg-gray-100 text-gray-800");
	const priorityColor = (p) => ({ high: "bg-red-100 text-red-800", medium: "bg-yellow-100 text-yellow-800", low: "bg-green-100 text-green-800" }[(p || "").toLowerCase()] || "bg-gray-100 text-gray-800");

	async function postComment() {
		if (!newComment.trim()) return;
		try {
			setPosting(true);
			const res = await fetch(`/api/efiling/files/${params.id}/comments`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_id: session?.user?.id,
					user_name: session?.user?.name || 'User',
					user_role: String(session?.user?.role ?? ''),
					text: newComment.trim()
				})
			});
			if (!res.ok) throw new Error('Failed to add comment');
			setNewComment("");
			await fetchFileData();
		} catch (e) {
			toast({ title: 'Error', description: e.message, variant: 'destructive' });
		} finally {
			setPosting(false);
		}
	}

	if (loading) return <div className="flex items-center justify-center h-96"><div className="text-lg">Loading document...</div></div>;
	if (!file) return <div className="flex items-center justify-center h-96"><div className="text-lg text-red-600">Document not found</div></div>;

	// Debug logging
	console.log('Current state:', { workRequest, beforeContent, file });

    return (
        <>
            <style jsx global>{`
                @media print {
                    @page {
                        size: A4;
                        margin: 20mm;
                    }
                    
                    body {
                        print-color-adjust: exact;
                        -webkit-print-color-adjust: exact;
                    }
                    
                    .no-print {
                        display: none !important;
                    }
                    
                    .print-only {
                        display: block !important;
                    }
                }
            `}</style>
            
        <div className="min-h-screen bg-gray-50">
                {/* Enhanced Header with KWSC Logo */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-50">
                    <div className="container mx-auto px-4 py-4">
                        <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                                <Button variant="ghost" onClick={() => router.back()} className="flex items-center no-print">
                                    <ArrowLeft className="w-4 h-4 mr-2"/>
                                    Back
                                </Button>
                                <div className="flex items-center space-x-3">
                                    <Image 
                                        src="/logo.png" 
                                        alt="KWSC Logo" 
                                        width={40} 
                                        height={40} 
                                        className="h-10 w-auto"
                                    />
                        <div>
                                        <h1 className="text-2xl font-bold text-gray-900">Document Viewer</h1>
                                        <p className="text-sm text-gray-600">Karachi Water & Sewerage Corporation - E-Filing System</p>
                                        <p className="text-xs text-gray-500">File: {file.file_number} | Subject: {file.subject}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="flex space-x-2 no-print">
                                <Button onClick={handlePrint} variant="outline" className="bg-green-50 hover:bg-green-100 text-green-700 border-green-300">
                                    <Printer className="w-4 h-4 mr-2" />
                                    Print
                                </Button>
                                <Button onClick={handleExportPDF} variant="outline" className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-300">
                                    <FileDown className="w-4 h-4 mr-2" />
                                    Export PDF
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="container mx-auto px-4 py-6">
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    <div className="lg:col-span-3">
                        {pages.length > 1 && (
                            <Card className="mb-6">
								<CardHeader><CardTitle className="text-lg">Document Pages</CardTitle></CardHeader>
                                <CardContent>
                                    <div className="flex flex-wrap gap-2">
										{pages.map((p) => (
											<Button key={p.id} variant={currentPageId === p.id ? "default" : "outline"} size="sm" onClick={() => setCurrentPageId(p.id)}>{p.title}</Button>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        <Card className="min-h-[800px]">
                            <CardHeader>
                                <CardTitle className="flex items-center justify-between">
									<span>{currentPage?.title || "Document Content"}</span>
									<Badge className={statusColor(file.status_name)}>{file.status_name || "Unknown"}</Badge>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
								<div className="bg-white border border-gray-300 shadow-lg mx-auto" style={{ width: "210mm", minHeight: "297mm", padding: "20mm" }}>
									{currentPage?.content?.logo && (
										<div className="mb-4" dangerouslySetInnerHTML={{ __html: sanitizeHtml(currentPage.content.logo) }} />
									)}
                                <div className="text-center mb-8">
									<div className="text-lg font-semibold text-gray-800 mb-2" dangerouslySetInnerHTML={{ __html: sanitizeHtml(currentPage?.content?.header || "Document Header") }} />
                                    </div>
                                <div className="text-center mb-6">
									<div className="text-2xl font-bold text-gray-900 mb-2">{currentPage?.content?.title || "Document Title"}</div>
                                    </div>
									<div className="mb-6"><div className="text-lg font-medium text-gray-800 mb-2">Subject: <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(currentPage?.content?.subject || "Document Subject") }} /></div></div>
									<div className="mb-6 text-right"><div className="text-sm text-gray-600">Date: {currentPage?.content?.date || new Date().toLocaleDateString()}</div></div>
									<div className="mb-8"><div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(currentPage?.content?.matter || "<p>No content available</p>") }} /></div>
									<div className="mb-4"><div className="text-lg font-medium text-gray-800">{currentPage?.content?.regards || "Yours faithfully,"}</div></div>
									<div className="text-center mt-8"><div className="text-sm text-gray-600">{currentPage?.content?.footer || "Document Footer"}</div></div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Video Request Details Section */}
                        {file?.work_request_id && (
                            <Card className="mt-6 border-blue-200 bg-blue-50">
                                <CardHeader>
                                    <CardTitle className="text-lg text-blue-800 flex items-center">
                                        📹 Video Request Details
                                        <Badge className="ml-2 bg-blue-100 text-blue-800">Request #{file.work_request_id}</Badge>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {workRequest ? (
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <div className="flex items-center space-x-2">
                                                        <FileText className="w-4 h-4 text-blue-600"/>
                                                        <span className="text-sm font-medium text-blue-800">Request ID:</span>
                                                        <span className="text-sm text-gray-700">#{workRequest.id}</span>
                                                    </div>
                                                    <div className="flex items-center space-x-2">
                                                        <Building2 className="w-4 h-4 text-blue-600"/>
                                                        <span className="text-sm font-medium text-blue-800">Address:</span>
                                                        <span className="text-sm text-gray-700">{workRequest.address || "N/A"}</span>
                                                    </div>
                                                    <div className="flex items-center space-x-2">
                                                        <User className="w-4 h-4 text-blue-600"/>
                                                        <span className="text-sm font-medium text-blue-800">Type:</span>
                                                        <span className="text-sm text-gray-700">{workRequest.complaint_type || "N/A"}</span>
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <div className="flex items-center space-x-2">
                                                        <Calendar className="w-4 h-4 text-blue-600"/>
                                                        <span className="text-sm font-medium text-blue-800">Created:</span>
                                                        <span className="text-sm text-gray-700">{formatDate(workRequest.request_date)}</span>
                                                    </div>
                                                    <div className="flex items-center space-x-2">
                                                        <Badge className={statusColor(workRequest.status_name)}>{workRequest.status_name || "Unknown"}</Badge>
                                                    </div>
                                                    {workRequest.contact_number && (
                                                        <div className="flex items-center space-x-2">
                                                            <span className="text-sm font-medium text-blue-800">Contact:</span>
                                                            <span className="text-sm text-gray-700">{workRequest.contact_number}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            
                                            {workRequest.description && (
                                                <div className="mt-4 p-3 bg-white rounded border">
                                                    <div className="text-sm font-semibold text-blue-800 mb-2">Work Description:</div>
                                                    <div className="text-sm text-gray-700">{workRequest.description}</div>
                                                </div>
                                            )}

                                            {/* Before Content Section */}
                                            {beforeContent.length > 0 && (
                                                <div className="mt-4">
                                                    <div className="text-sm font-semibold text-blue-800 mb-3">Before Content ({beforeContent.length} items):</div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        {beforeContent.map((item) => (
                                                            <div key={item.id} className="border rounded-lg p-3 bg-white">
                                                                <div className="relative">
                                                                    {item.content_type === 'video' ? (
                                                                        <video
                                                                            src={item.link}
                                                                            className="w-full h-24 object-cover rounded"
                                                                            controls
                                                                        />
                                                                    ) : (
                                                                        <img
                                                                            src={item.link}
                                                                            alt={item.description || 'Before content'}
                                                                            className="w-full h-24 object-cover rounded"
                                                                        />
                                                                    )}
                                                                    <div className="absolute top-1 left-1">
                                                                        <Badge variant="secondary" className="text-xs">
                                                                            {item.content_type === 'video' ? '🎥 Video' : '📷 Image'}
                                                                        </Badge>
                                                                    </div>
                                                                </div>
                                                                {item.description && (
                                                                    <p className="text-xs text-gray-500 mt-2 line-clamp-2">
                                                                        {item.description}
                                                                    </p>
                                                                )}
                                                                <div className="text-xs text-gray-400 mt-1">
                                                                    Uploaded by: {item.creator_name || 'Unknown'}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="text-sm text-red-600">
                                            <div>❌ Video request details not available</div>
                                            <div className="mt-2 text-xs">
                                                <div>Work Request ID: {file.work_request_id}</div>
                                                <div>Status: Loading...</div>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    <div className="lg:col-span-1">
                        <div className="space-y-6">
                            <Card>
								<CardHeader><CardTitle className="text-lg">File Information</CardTitle></CardHeader>
                                <CardContent className="space-y-3">
									<div className="flex items-center space-x-2"><FileText className="w-4 h-4 text-gray-500"/><span className="text-sm text-gray-600">Number: {file.file_number}</span></div>
									<div className="flex items-center space-x-2"><Building2 className="w-4 h-4 text-gray-500"/><span className="text-sm text-gray-600">Department: {file.department_name || "N/A"}</span></div>
									<div className="flex items-center space-x-2"><User className="w-4 h-4 text-gray-500"/><span className="text-sm text-gray-600">Created by: {file.creator_user_name || file.created_by_name || 'Unknown'}</span></div>
									<div className="flex items-center space-x-2"><User className="w-4 h-4 text-gray-500"/><span className="text-sm text-gray-600">Assigned to: {file.assigned_to_name || "Unassigned"}</span></div>
									<div className="flex items-center space-x-2"><Calendar className="w-4 h-4 text-gray-500"/><span className="text-sm text-gray-600">Created: {formatDate(file.created_at)}</span></div>
									<div className="flex items-center space-x-2"><Badge className={priorityColor(file.priority)}>{file.priority || "Normal"} Priority</Badge></div>
									<div className="flex items-center space-x-2"><Badge variant="outline">{file.confidentiality_level || "Normal"} Confidentiality</Badge></div>
									{file.has_video_request && (
										<div className="flex items-center space-x-2">
											<Badge className={file.has_video_request === 'Yes' ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"}>
												{file.has_video_request === 'Yes' ? '📹 Video Request Attached' : 'No Video Request'}
											</Badge>
										</div>
									)}
									{file.ceo_approval_status && (
										<div className="flex items-center space-x-2">
											<Badge className={file.ceo_approval_status === 'approved' ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
												CEO: {file.ceo_approval_status === 'approved' ? 'Approved' : 'Not Approved'}
											</Badge>
										</div>
									)}
									{file.coo_approval_status && (
										<div className="flex items-center space-x-2">
											<Badge className={file.coo_approval_status === 'approved' ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
												COO: {file.coo_approval_status === 'approved' ? 'Approved' : 'Not Approved'}
											</Badge>
										</div>
									)}
                                </CardContent>
                            </Card>

                            {file?.work_request_id && workRequest && (
                                <Card>
                                <CardHeader>
                                        <CardTitle className="text-lg">Work Request Details</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                            <div className="flex items-center space-x-2"><FileText className="w-4 h-4 text-gray-500"/><span className="text-sm text-gray-600">Request ID: #{workRequest.id}</span></div>
                                            <div className="flex items-center space-x-2"><Building2 className="w-4 h-4 text-gray-500"/><span className="text-sm text-gray-600">Address: {workRequest.address || "N/A"}</span></div>
                                            <div className="flex items-center space-x-2"><User className="w-4 h-4 text-gray-500"/><span className="text-sm text-gray-600">Type: {workRequest.complaint_type || "N/A"}</span></div>
                                            <div className="flex items-center space-x-2"><Calendar className="w-4 h-4 text-gray-500"/><span className="text-sm text-gray-600">Created: {formatDate(workRequest.request_date)}</span></div>
                                            <div className="flex items-center space-x-2"><Badge className={statusColor(workRequest.status_name)}>{workRequest.status_name || "Unknown"}</Badge></div>
                                            {workRequest.description && (
                                                <div className="mt-3 p-2 bg-white rounded border">
                                                    <div className="text-xs font-semibold text-gray-700 mb-1">Description:</div>
                                                    <div className="text-xs text-gray-600">{workRequest.description}</div>
                                                </div>
                                            )}
                                            {workRequest.contact_number && (
                                                <div className="flex items-center space-x-2"><span className="text-xs text-gray-500">Contact: {workRequest.contact_number}</span></div>
                                    )}
                                </CardContent>
                            </Card>
                            )}

                            {beforeContent.length > 0 && (
                                <Card>
                                    <CardHeader><CardTitle className="text-lg">Before Content ({beforeContent.length})</CardTitle></CardHeader>
                                    <CardContent>
                                        <div className="space-y-3">
                                            {beforeContent.map((item) => (
                                                <div key={item.id} className="border rounded-lg p-3">
                                                    <div className="relative">
                                                        {item.content_type === 'video' ? (
                                                            <video
                                                                src={item.link}
                                                                className="w-full h-32 object-cover rounded"
                                                                controls
                                                            />
                                                        ) : (
                                                            <img
                                                                src={item.link}
                                                                alt={item.description || 'Before content'}
                                                                className="w-full h-32 object-cover rounded"
                                                            />
                                                        )}
                                                        <div className="absolute top-2 left-2">
                                                            <Badge variant="secondary" className="text-xs">
                                                                {item.content_type === 'video' ? 'Video' : 'Image'}
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                    {item.description && (
                                                        <p className="text-xs text-gray-500 mt-2 line-clamp-2">
                                                            {item.description}
                                                        </p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            <Card>
								<CardHeader><CardTitle className="text-lg flex items-center"><Paperclip className="w-4 h-4 mr-2"/>Attachments ({attachments.length})</CardTitle></CardHeader>
                                <CardContent>
                                    {attachments.length === 0 ? (
                                        <p className="text-sm text-gray-500">No attachments in this file.</p>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {attachments.map(a => (
                                                <div key={a.id} className="border rounded-lg p-3 hover:shadow-md transition-shadow cursor-pointer group" onClick={() => openAttachmentModal(a)}>
                                                    {a.file_url && a.file_type?.startsWith('image/') ? (
                                                        <div className="relative">
                                                            <Image 
                                                                src={a.file_url} 
                                                                alt={a.file_name} 
                                                                width={200} 
                                                                height={150} 
                                                                className="w-full h-32 object-cover rounded mb-2" 
                                                            />
                                                            <div className="absolute top-2 right-2 bg-black bg-opacity-50 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <Maximize2 className="w-4 h-4" />
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="w-full h-32 flex items-center justify-center bg-gray-100 rounded mb-2 text-gray-500">
                                                            <FileText className="w-8 h-8" />
                                                        </div>
                                                    )}
                                                    <div className="space-y-1">
                                                        <div className="font-medium text-sm truncate" title={a.file_name}>{a.file_name}</div>
                                                        <div className="text-xs text-gray-500">
                                                            {Math.round((a.file_size || 0)/1024)} KB • {formatDate(a.uploaded_at)}
                                                        </div>
                                                        <div className="text-xs text-blue-600 group-hover:text-blue-800">
                                                            Click to view
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            <Card>
								<CardHeader><CardTitle className="text-lg flex items-center"><Shield className="w-4 h-4 mr-2"/>Signatures ({signatures.length})</CardTitle></CardHeader>
                                <CardContent>
                                    <DocumentSignatureSystem
                                        fileId={params.id}
                                        userRole={session?.user?.role}
                                        canEditDocument={false}
                                        viewOnly={true}
                                    />
                                </CardContent>
                            </Card>

                            <Card>
								<CardHeader><CardTitle className="text-lg flex items-center"><Clock className="w-4 h-4 mr-2"/>Status Timeline ({timeline.length})</CardTitle></CardHeader>
                                <CardContent>
                                    <div className="space-y-4 max-h-80 overflow-auto pr-2">
                                        {timeline.length > 0 ? (
                                            <div className="relative">
                                                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>
                                                {timeline.map((event, index) => (
                                                    <div key={index} className="relative pl-10 pb-4">
                                                        <div className="absolute left-3 top-1 w-2 h-2 bg-blue-500 rounded-full border-2 border-white"></div>
                                                        <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
                                                            <div className="flex items-start justify-between mb-1">
                                                                <div className="text-sm font-semibold text-gray-900">{event.title}</div>
                                                                <Badge variant="outline" className="text-xs">
                                                                    {event.type}
                                                                </Badge>
                                                            </div>
                                                            <div className="text-xs text-gray-500 mb-2">{formatDate(event.timestamp)}</div>
                                                            {event.meta && event.meta.remarks && (
                                                                <div className="text-xs text-gray-600 mt-2 space-y-1">
                                                                    <div className="mt-1 italic text-gray-500">"{event.meta.remarks}"</div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-gray-500">No timeline events yet</p>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
								<CardHeader><CardTitle className="text-lg flex items-center"><MessageSquare className="w-4 h-4 mr-2"/>Comments ({comments.length})</CardTitle></CardHeader>
                                <CardContent>
                                    <div className="space-y-3 max-h-80 overflow-auto pr-2">
                                        {comments.length > 0 ? (
                                            comments.map((c) => (
                                                <div key={c.id} className="border-l-4 border-blue-500 pl-3">
                                                    <div className="text-sm font-medium text-gray-900">{c.user_name}</div>
                                                    <div className="text-xs text-gray-500">{formatDate(c.timestamp)}</div>
                                                    <div className="text-sm text-gray-700 mt-1 break-words">{c.text}</div>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-sm text-gray-500">No comments yet</p>
                                        )}
                                    </div>
                                    <div className="mt-4">
                                        <textarea
                                            value={newComment}
                                            onChange={(e) => setNewComment(e.target.value)}
                                            rows={3}
                                            placeholder="Add a comment..."
                                            className="w-full border rounded-md p-2 text-sm"
                                        />
                                        <div className="flex justify-end mt-2">
                                            <Button size="sm" onClick={postComment} disabled={posting || !newComment.trim()}>
                                                {posting ? 'Posting...' : 'Add Comment'}
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </div>
            </div>

            {/* Attachment Preview Modal */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center justify-between">
                            <span>{selectedAttachment?.file_name}</span>
                            <Button variant="ghost" size="sm" onClick={closeAttachmentModal}>
                                <X className="w-4 h-4" />
                            </Button>
                        </DialogTitle>
                    </DialogHeader>
                    {selectedAttachment && (
                        <div className="space-y-4">
                            {selectedAttachment.file_url && selectedAttachment.file_type?.startsWith('image/') ? (
                                <div className="text-center">
                                    <Image 
                                        src={selectedAttachment.file_url} 
                                        alt={selectedAttachment.file_name} 
                                        width={800} 
                                        height={600} 
                                        className="max-w-full h-auto mx-auto"
                                        style={{ objectFit: 'contain' }}
                                    />
                                </div>
                            ) : selectedAttachment.file_type === 'application/pdf' || selectedAttachment.file_name?.toLowerCase().endsWith('.pdf') ? (
                                <div className="space-y-4">
                                    <div className="border rounded-lg overflow-hidden bg-gray-50">
                                        {(() => {
                                            // Helper function to get the correct PDF URL
                                            const getPdfUrl = (fileUrl) => {
                                                if (!fileUrl) {
                                                    console.error('PDF file_url is missing');
                                                    return null;
                                                }
                                                // If it's already an API URL, return as is
                                                if (fileUrl.startsWith('/api/')) {
                                                    return fileUrl;
                                                }
                                                // If it starts with /uploads/, convert to /api/uploads/
                                                if (fileUrl.startsWith('/uploads/')) {
                                                    const converted = fileUrl.replace('/uploads/', '/api/uploads/');
                                                    console.log('PDF URL converted:', fileUrl, '->', converted);
                                                    return converted;
                                                }
                                                // If it's a full URL, return as is
                                                if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
                                                    return fileUrl;
                                                }
                                                // Otherwise, assume it's a relative path
                                                const converted = `/api/uploads${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;
                                                console.log('PDF URL converted (relative):', fileUrl, '->', converted);
                                                return converted;
                                            };
                                            
                                            const pdfUrl = getPdfUrl(selectedAttachment.file_url);
                                            
                                            if (!pdfUrl) {
                                                return (
                                                    <div className="p-8 text-center text-gray-500">
                                                        <FileText className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                                                        <p>PDF URL is missing or invalid</p>
                                                        <p className="text-xs mt-2">File: {selectedAttachment.file_name}</p>
                                                    </div>
                                                );
                                            }
                                            
                                            return (
                                                <>
                                                    {/* Use object tag as primary method, iframe as fallback */}
                                                    <object
                                                        data={pdfUrl}
                                                        type="application/pdf"
                                                        className="w-full h-[70vh] min-h-[500px] border-0"
                                                        title={selectedAttachment.file_name}
                                                        style={{ display: 'block' }}
                                                        onError={(e) => {
                                                            console.error('Object tag failed to load PDF:', pdfUrl, e);
                                                        }}
                                                    >
                                                        {/* Fallback to iframe if object tag doesn't work */}
                                                        <iframe
                                                            src={pdfUrl}
                                                            className="w-full h-[70vh] min-h-[500px] border-0"
                                                            title={selectedAttachment.file_name}
                                                            style={{ display: 'block' }}
                                                            onError={(e) => {
                                                                console.error('Iframe failed to load PDF:', pdfUrl, e);
                                                            }}
                                                        />
                                                    </object>
                                                </>
                                            );
                                        })()}
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        {(() => {
                                            const getPdfUrl = (fileUrl) => {
                                                if (!fileUrl) return null;
                                                if (fileUrl.startsWith('/api/')) return fileUrl;
                                                if (fileUrl.startsWith('/uploads/')) return fileUrl.replace('/uploads/', '/api/uploads/');
                                                if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) return fileUrl;
                                                return `/api/uploads${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;
                                            };
                                            const pdfUrl = getPdfUrl(selectedAttachment.file_url);
                                            return (
                                                <>
                                                    <Button 
                                                        variant="outline"
                                                        onClick={() => {
                                                            window.open(pdfUrl, '_blank');
                                                        }}
                                                    >
                                                        <Eye className="w-4 h-4 mr-2" />
                                                        Open in New Tab
                                                    </Button>
                                                    <Button 
                                                        variant="outline"
                                                        onClick={() => {
                                                            const link = document.createElement('a');
                                                            link.href = pdfUrl;
                                                            link.download = selectedAttachment.file_name;
                                                            link.target = '_blank';
                                                            document.body.appendChild(link);
                                                            link.click();
                                                            document.body.removeChild(link);
                                                        }}
                                                    >
                                                        <Download className="w-4 h-4 mr-2" />
                                                        Download File
                                                    </Button>
                                                </>
                                            );
                                        })()}
                                    </div>
                                </div>
                            ) : selectedAttachment.file_type === 'application/msword' || 
                                  selectedAttachment.file_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                                  selectedAttachment.file_name?.toLowerCase().endsWith('.doc') ||
                                  selectedAttachment.file_name?.toLowerCase().endsWith('.docx') ? (
                                <div className="space-y-4">
                                    <div className="border rounded-lg overflow-hidden bg-gray-50 p-4">
                                        <p className="text-sm text-gray-600 mb-4">
                                            Word documents cannot be previewed directly in the browser. Please download to view.
                                        </p>
                                        <div className="flex justify-center items-center min-h-[200px] bg-gray-100 rounded">
                                            <FileText className="w-24 h-24 text-gray-400" />
                                        </div>
                                    </div>
                                    <div className="flex justify-end">
                                        <Button 
                                            variant="outline"
                                            onClick={() => {
                                                const link = document.createElement('a');
                                                link.href = selectedAttachment.file_url;
                                                link.download = selectedAttachment.file_name;
                                                link.target = '_blank';
                                                document.body.appendChild(link);
                                                link.click();
                                                document.body.removeChild(link);
                                            }}
                                        >
                                            <Download className="w-4 h-4 mr-2" />
                                            Download File
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-8">
                                    <FileText className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                                    <p className="text-gray-600 mb-2">{selectedAttachment.file_name}</p>
                                    <p className="text-sm text-gray-500">
                                        {Math.round((selectedAttachment.file_size || 0)/1024)} KB • {formatDate(selectedAttachment.uploaded_at)}
                                    </p>
                                    <Button 
                                        className="mt-4" 
                                        onClick={() => window.open(selectedAttachment.file_url, '_blank')}
                                    >
                                        <Download className="w-4 h-4 mr-2" />
                                        Download File
                                    </Button>
                                </div>
                            )}
                            <div className="border-t pt-4 grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="font-medium">File Name:</span>
                                    <p className="text-gray-600">{selectedAttachment.file_name}</p>
                                </div>
                                <div>
                                    <span className="font-medium">File Size:</span>
                                    <p className="text-gray-600">{Math.round((selectedAttachment.file_size || 0)/1024)} KB</p>
                                </div>
                                <div>
                                    <span className="font-medium">File Type:</span>
                                    <p className="text-gray-600">{selectedAttachment.file_type || 'Unknown'}</p>
                                </div>
                                <div>
                                    <span className="font-medium">Uploaded:</span>
                                    <p className="text-gray-600">{formatDate(selectedAttachment.uploaded_at)}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
