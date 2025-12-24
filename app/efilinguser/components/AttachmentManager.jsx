"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useSession } from "next-auth/react";
import { useEfilingUser } from "@/context/EfilingUserContext";
import { 
    Paperclip, 
    Upload, 
    X, 
    FileText, 
    Image, 
    Download, 
    Trash2,
    Plus,
    File
} from "lucide-react";

export default function AttachmentManager({ fileId, canEdit = true }) {
    const { toast } = useToast();
    const { data: session } = useSession();
    const { efilingUserId } = useEfilingUser();
    const [attachments, setAttachments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [attachmentName, setAttachmentName] = useState("");
    const [selectedFiles, setSelectedFiles] = useState([]);

    // Allowed file types
    const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/jpg',
        'image/png'
    ];

    const allowedExtensions = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];

    useEffect(() => {
        if (fileId) {
            loadAttachments();
        }
    }, [fileId]);

    const loadAttachments = async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/efiling/files/${fileId}/attachments`);
            if (response.ok) {
                const data = await response.json();
                setAttachments(data);
            }
        } catch (error) {
            console.error('Error loading attachments:', error);
            toast({
                title: "Error",
                description: "Failed to load attachments",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const validateFile = (file) => {
        // Check file type
        if (!allowedTypes.includes(file.type)) {
            return `File type ${file.type} is not allowed. Only PDF, DOC, DOCX, JPG, JPEG, and PNG files are allowed.`;
        }

        // Check file size (5MB limit)
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (file.size > maxSize) {
            return `File size exceeds limit. Maximum allowed: 5MB`;
        }

        return null;
    };

    const handleFileSelect = (event) => {
        const files = Array.from(event.target.files);
        const validFiles = [];
        const errors = [];

        files.forEach(file => {
            const error = validateFile(file);
            if (error) {
                errors.push(`${file.name}: ${error}`);
            } else {
                validFiles.push(file);
            }
        });

        if (errors.length > 0) {
            toast({
                title: "Invalid Files",
                description: errors.join('\n'),
                variant: "destructive",
            });
        }

        setSelectedFiles(validFiles);
    };

    const handleUpload = async () => {
        if (!attachmentName.trim()) {
            toast({
                title: "Error",
                description: "Please enter a name for the attachment",
                variant: "destructive",
            });
            return;
        }

        if (selectedFiles.length === 0) {
            toast({
                title: "Error",
                description: "Please select at least one file to upload",
                variant: "destructive",
            });
            return;
        }

        if (!efilingUserId) {
            toast({
                title: "Cannot upload",
                description: "Your e-filing profile is not available. Please refresh and try again.",
                variant: "destructive",
            });
            return;
        }

        setUploading(true);
        try {
            const uploadPromises = selectedFiles.map(async (file) => {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('fileId', fileId);
                formData.append('attachmentName', attachmentName);

                const response = await fetch('/api/efiling/files/upload-attachment', {
                    method: 'POST',
                    headers: {
                        'x-user-id': efilingUserId || session?.user?.id || 'system'
                    },
                    body: formData,
                });

                if (!response.ok) {
                    throw new Error(`Failed to upload ${file.name}`);
                }

                return response.json();
            });

            await Promise.all(uploadPromises);

            toast({
                title: "Success",
                description: `${selectedFiles.length} file(s) uploaded successfully`,
            });

            // Reset form
            setAttachmentName("");
            setSelectedFiles([]);
            setShowUploadModal(false);
            
            // Reload attachments
            loadAttachments();

        } catch (error) {
            console.error('Error uploading files:', error);
            toast({
                title: "Upload Failed",
                description: error.message || "Failed to upload files",
                variant: "destructive",
            });
        } finally {
            setUploading(false);
        }
    };

    const handleDeleteAttachment = async (attachmentId, fileName) => {
        if (!confirm(`Are you sure you want to delete \"${fileName}\"?`)) {
            return;
        }

        if (!efilingUserId) {
            toast({
                title: "Cannot delete",
                description: "Your e-filing profile is not available. Please refresh and try again.",
                variant: "destructive",
            });
            return;
        }

        try {
            const response = await fetch(`/api/efiling/files/delete-attachment/${attachmentId}`, {
                method: 'DELETE',
                headers: {
                    'x-user-id': efilingUserId || session?.user?.id || 'system'
                }
            });

            if (response.ok) {
                toast({
                    title: "Success",
                    description: "Attachment deleted successfully",
                });
                loadAttachments();
            } else {
                throw new Error('Failed to delete attachment');
            }
        } catch (error) {
            console.error('Error deleting attachment:', error);
            toast({
                title: "Error",
                description: "Failed to delete attachment",
                variant: "destructive",
            });
        }
    };

    const getFileIcon = (fileType) => {
        if (fileType.includes('pdf')) {
            return <FileText className="w-5 h-5 text-red-500" />;
        } else if (fileType.includes('word') || fileType.includes('document')) {
            return <FileText className="w-5 h-5 text-blue-500" />;
        } else if (fileType.includes('image')) {
            return <Image className="w-5 h-5 text-green-500" />;
        } else {
            return <File className="w-5 h-5 text-gray-500" />;
        }
    };

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Paperclip className="w-5 h-5" />
                        Attachments ({attachments.length})
                    </div>
                    {canEdit && (
                        <Button
                            onClick={() => setShowUploadModal(true)}
                            size="sm"
                            className="flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" />
                            Add Files
                        </Button>
                    )}
                </CardTitle>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                    </div>
                ) : attachments.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                        <Paperclip className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                        <p>No attachments yet</p>
                        {canEdit && (
                            <p className="text-sm">Click &quot;Add Files&quot; to upload documents</p>
                        )}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {attachments.map((attachment) => (
                            <div
                                key={attachment.id}
                                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border"
                            >
                                <div className="flex items-center gap-3">
                                    {getFileIcon(attachment.file_type)}
                                    <div>
                                        <div className="font-medium text-sm">
                                            {attachment.file_name}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {formatFileSize(attachment.file_size)} • 
                                            {new Date(attachment.uploaded_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            // In production, this would download the actual file
                                            toast({
                                                title: "Download",
                                                description: `Downloading ${attachment.file_name}`,
                                            });
                                        }}
                                    >
                                        <Download className="w-4 h-4" />
                                    </Button>
                                    {canEdit && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDeleteAttachment(attachment.id, attachment.file_name)}
                                            className="text-red-600 hover:text-red-700"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>

            {/* Upload Modal */}
            {showUploadModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <Card className="w-full max-w-md">
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Upload className="w-5 h-5" />
                                    Upload Attachments
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowUploadModal(false)}
                                >
                                    <X className="w-4 h-4" />
                                </Button>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <Label htmlFor="attachmentName">Attachment Name</Label>
                                <Input
                                    id="attachmentName"
                                    value={attachmentName}
                                    onChange={(e) => setAttachmentName(e.target.value)}
                                    placeholder="Enter a name for these attachments"
                                    className="mt-1"
                                />
                                <p className="text-sm text-gray-500 mt-1">
                                    This name will be used to identify the group of files
                                </p>
                            </div>

                            <div>
                                <Label htmlFor="files">Select Files</Label>
                                <Input
                                    id="files"
                                    type="file"
                                    multiple
                                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                    onChange={handleFileSelect}
                                    className="mt-1"
                                />
                                <p className="text-sm text-gray-500 mt-1">
                                    Allowed types: PDF, DOC, DOCX, JPG, JPEG, PNG (Max 10MB each)
                                </p>
                            </div>

                            {selectedFiles.length > 0 && (
                                <div>
                                    <Label>Selected Files ({selectedFiles.length})</Label>
                                    <div className="mt-2 space-y-2 max-h-32 overflow-y-auto">
                                        {selectedFiles.map((file, index) => (
                                            <div
                                                key={index}
                                                className="flex items-center justify-between p-2 bg-gray-50 rounded border"
                                            >
                                                <div className="flex items-center gap-2">
                                                    {getFileIcon(file.type)}
                                                    <span className="text-sm">{file.name}</span>
                                                </div>
                                                <span className="text-xs text-gray-500">
                                                    {formatFileSize(file.size)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-end gap-2 pt-4">
                                <Button
                                    variant="outline"
                                    onClick={() => setShowUploadModal(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleUpload}
                                    disabled={uploading || !attachmentName.trim() || selectedFiles.length === 0}
                                >
                                    {uploading ? (
                                        <div className="flex items-center">
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                            Uploading...
                                        </div>
                                    ) : (
                                        <div className="flex items-center">
                                            <Upload className="w-4 h-4 mr-2" />
                                            Upload {selectedFiles.length} File(s)
                                        </div>
                                    )}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </Card>
    );
}
