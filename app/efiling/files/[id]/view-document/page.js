"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Download, Eye, FileText, User, Calendar, Building2, Shield, MessageSquare, Paperclip } from "lucide-react";
import AttachmentManager from "../../../components/AttachmentManager";
import DocumentSignatureSystem from "../../../components/DocumentSignatureSystem";
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

	useEffect(() => {
		if (params.id) fetchFileData();
	}, [params.id]);

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
			if (attRes.ok) setAttachments((await attRes.json()).attachments || []);
			const sigRes = await fetch(`/api/efiling/files/${params.id}/signatures`);
			if (sigRes.ok) setSignatures((await sigRes.json()).signatures || []);
			const comRes = await fetch(`/api/efiling/files/${params.id}/comments`);
			if (comRes.ok) setComments((await comRes.json()) || []);
			
			// Fetch work request details if work_request_id exists
			console.log('File data:', fileData);
			console.log('Work request ID:', fileData.work_request_id);
			console.log('Work request ID type:', typeof fileData.work_request_id);
			console.log('All file data keys:', Object.keys(fileData));
			console.log('File data work_request_id value:', fileData.work_request_id);
			console.log('Is work_request_id null?', fileData.work_request_id === null);
			console.log('Is work_request_id undefined?', fileData.work_request_id === undefined);
			
			if (fileData.work_request_id) {
				console.log('Fetching work request details for ID:', fileData.work_request_id);
				const workRes = await fetch(`/api/requests?id=${fileData.work_request_id}`);
				console.log('Work request response status:', workRes.status);
				if (workRes.ok) {
					const workData = await workRes.json();
					console.log('Work request data:', workData);
					setWorkRequest(workData);
					
					// Fetch before content for this work request
					console.log('Fetching before content for work request:', fileData.work_request_id);
					const contentRes = await fetch(`/api/before-content?workRequestId=${fileData.work_request_id}`);
					console.log('Before content response status:', contentRes.status);
					if (contentRes.ok) {
						const contentData = await contentRes.json();
						console.log('Before content data:', contentData);
						console.log('Before content data type:', typeof contentData);
						console.log('Before content is array:', Array.isArray(contentData));
						setBeforeContent(Array.isArray(contentData) ? contentData : []);
					} else {
						console.error('Failed to fetch before content:', contentRes.status, contentRes.statusText);
						const errorText = await contentRes.text();
						console.error('Before content error response:', errorText);
					}
				} else {
					console.error('Failed to fetch work request:', workRes.status, workRes.statusText);
					const errorText = await workRes.text();
					console.error('Work request error response:', errorText);
				}
			} else {
				console.log('No work_request_id found in file data');
			}
		} catch (e) {
			console.error(e);
			toast({ title: "Error", description: "Failed to fetch document data", variant: "destructive" });
		} finally {
			setLoading(false);
		}
	}

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
					user_name: session?.user?.name || 'Admin',
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
		<div className="min-h-screen bg-gray-50">
			<div className="bg-white border-b border-gray-200 sticky top-0 z-50">
				<div className="flex items-center justify-between p-4">
					<div className="flex items-center space-x-4">
						<Button variant="ghost" onClick={() => router.back()} className="flex items-center"><ArrowLeft className="w-4 h-4 mr-2"/>Back</Button>
						<div>
							<h1 className="text-xl font-bold text-gray-900">Document Viewer</h1>
							<p className="text-sm text-gray-600">File: {file.file_number}</p>
						</div>
					</div>
					<div className="flex items-center space-x-2">
						<Button variant="outline" onClick={() => window.print()}><Eye className="w-4 h-4 mr-2"/>Print</Button>
						<Button variant="outline" onClick={() => toast({ title: "Download", description: "Download functionality will be implemented" })}><Download className="w-4 h-4 mr-2"/>Download</Button>
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
							{/* Debug Section - Remove after testing */}
							<Card className="bg-yellow-50 border-yellow-200">
								<CardHeader><CardTitle className="text-lg text-yellow-800">Debug Info</CardTitle></CardHeader>
								<CardContent className="text-xs">
									<div>Work Request ID: {file?.work_request_id || 'None'}</div>
									<div>Work Request ID Type: {typeof file?.work_request_id}</div>
									<div>Work Request Data: {workRequest ? 'Loaded' : 'Not loaded'}</div>
									<div>Before Content Count: {beforeContent?.length || 0}</div>
									<div>File Number: {file?.file_number}</div>
									<div>File ID: {file?.id}</div>
									{workRequest && (
										<div className="mt-2 p-2 bg-white rounded border">
											<div className="font-semibold">Work Request Details:</div>
											<div>ID: {workRequest.id}</div>
											<div>Address: {workRequest.address}</div>
											<div>Type: {workRequest.complaint_type}</div>
											<div>Status: {workRequest.status_name}</div>
										</div>
									)}
									<div className="mt-2">
										<Button 
											size="sm" 
											variant="outline"
											onClick={async () => {
												if (file?.work_request_id) {
													console.log('Testing direct API call for work request:', file.work_request_id);
													try {
														const testRes = await fetch(`/api/requests?id=${file.work_request_id}`);
														console.log('Direct API test response status:', testRes.status);
														if (testRes.ok) {
															const testData = await testRes.json();
															console.log('Direct API test data:', testData);
														} else {
															const errorText = await testRes.text();
															console.log('Direct API test error:', errorText);
														}
													} catch (error) {
														console.error('Direct API test error:', error);
													}
												} else {
													console.log('No work_request_id to test');
												}
											}}
										>
											Test Work Request API
										</Button>
									</div>
								</CardContent>
							</Card>

							<Card>
								<CardHeader><CardTitle className="text-lg">File Information</CardTitle></CardHeader>
								<CardContent className="space-y-3">
									<div className="flex items-center space-x-2"><FileText className="w-4 h-4 text-gray-500"/><span className="text-sm text-gray-600">Number: {file.file_number}</span></div>
									<div className="flex items-center space-x-2"><Building2 className="w-4 h-4 text-gray-500"/><span className="text-sm text-gray-600">Department: {file.department_name || "N/A"}</span></div>
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

							{/* Work Request Section - Always visible for debugging */}
							<Card className={workRequest ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
								<CardHeader>
									<CardTitle className={`text-lg ${workRequest ? "text-green-800" : "text-red-800"}`}>
										Work Request Details {workRequest ? "✅" : "❌"}
									</CardTitle>
								</CardHeader>
								<CardContent className="space-y-3">
									{workRequest ? (
										<>
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
										</>
									) : (
										<div className="text-sm text-red-600">
											<div>❌ No work request data loaded</div>
											<div className="mt-2 text-xs">
												<div>File Work Request ID: {file?.work_request_id || 'None'}</div>
												<div>Work Request State: {workRequest === null ? 'null' : workRequest === undefined ? 'undefined' : 'empty'}</div>
											</div>
										</div>
									)}
								</CardContent>
							</Card>

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
									<AttachmentManager fileId={params.id} canEdit={true} viewOnly={false} />
								</CardContent>
							</Card>

							<Card>
								<CardHeader><CardTitle className="text-lg flex items-center"><Shield className="w-4 h-4 mr-2"/>Signatures ({signatures.length})</CardTitle></CardHeader>
								<CardContent>
									<DocumentSignatureSystem fileId={params.id} userRole={session?.user?.role} canEditDocument={false} viewOnly={true} />
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
		</div>
	);
}
