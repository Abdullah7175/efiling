"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Send, Shield, Mic, MicOff, Building2, User, Calendar } from "lucide-react";
import TipTapEditor from "../../../components/TipTapEditor";
import DocumentSignatureSystem from "../../../components/DocumentSignatureSystem";
import MarkToModal from "../../../components/MarkToModal";
import ESignatureModal from "../../../components/ESignatureModal";
import AttachmentManager from "../../../components/AttachmentManager";

// Add CSS for contentEditable placeholder
const contentEditableStyles = `
    [contenteditable]:empty:before {
        content: attr(data-placeholder);
        color: #9ca3af;
        pointer-events: none;
    }
    [contenteditable]:focus:empty:before {
        content: attr(data-placeholder);
        color: #9ca3af;
        pointer-events: none;
    }
`;

export default function DocumentEditor() {
    const { data: session } = useSession();
    const router = useRouter();
    const params = useParams();
    const { toast } = useToast();
    
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showMarkToModal, setShowMarkToModal] = useState(false);
    const [showESignatureModal, setShowESignatureModal] = useState(false);
    const [editorType, setEditorType] = useState('structured');
    const [selectedTemplate, setSelectedTemplate] = useState(1);
    const [userRole, setUserRole] = useState('');
    const [canEditDocument, setCanEditDocument] = useState(false);
    
    // Helper function to convert HTML to plain text
    const htmlToText = (html) => {
        if (!html) return '';
        // Create a temporary div element to parse HTML
        const temp = document.createElement('div');
        temp.innerHTML = html;
        return temp.textContent || temp.innerText || '';
    };
    
    const [documentContent, setDocumentContent] = useState({
        title: '',
        subject: '',
        date: new Date().toLocaleDateString(),
        matter: '',
        regards: '',
        footer: '',
        customRegards: ''
    });

    const [pages, setPages] = useState([
        {
            id: 1,
            pageNumber: 1,
            title: 'Main Document',
            content: {
                title: '',
                subject: '',
                date: new Date().toLocaleDateString(),
                matter: '',
                regards: '',
                footer: '',
                customRegards: ''
            },
            type: 'MAIN'
        }
    ]);
    const [currentPageId, setCurrentPageId] = useState(1);

    const [documentTemplates] = useState([
        { id: 1, name: 'Official Letter', type: 'letter' },
        { id: 2, name: 'Internal Memo', type: 'memo' },
        { id: 3, name: 'Project Proposal', type: 'proposal' },
        { id: 4, name: 'Work Order', type: 'workorder' },
        { id: 5, name: 'Custom Document', type: 'custom' }
    ]);

    useEffect(() => {
        if (params.id) {
            fetchFile();
        }
    }, [params.id]);

    // Check user permissions - Admin level (efiling) has all rights
    useEffect(() => {
        if (session?.user) {
            const role = session.user.role || 'user';
            setUserRole(role);
            // Admin users (role 1) in efiling have all rights
            const canEdit = role === 1;
            setCanEditDocument(canEdit);
        }
    }, [session, file]);

    useEffect(() => {
        if (!loading && file && session?.user?.id) {
            (async () => {
                try {
                    const mapRes = await fetch(`/api/efiling/users/profile?userId=${session.user.id}`);
                    if (mapRes.ok) {
                        const map = await mapRes.json();
                        const efilingUserId = map?.efiling_user_id;
                        const isAdmin = session.user.role === 1;
                        const isCreator = file.created_by === efilingUserId;
                        // Admin can always edit, creator can edit their own files
                        const allowed = isAdmin || isCreator;
                        setCanEditDocument(allowed);
                        if (!allowed) {
                            router.replace(`/efiling/files/${params.id}`);
                        }
                    }
                } catch (e) {
                    // If mapping fails, be safe and block edit
                    router.replace(`/efiling/files/${params.id}`);
                }
            })();
        }
    }, [loading, file, session?.user?.id]);

    const fetchFile = async () => {
        try {
            const response = await fetch(`/api/efiling/files/${params.id}`);
            if (response.ok) {
                const fileData = await response.json();
                setFile(fileData);
                
                // Fetch document content and pages
                const docResponse = await fetch(`/api/efiling/files/${params.id}/document`);
                if (docResponse.ok) {
                    const docData = await docResponse.json();
                    
                    // Load pages if they exist
                    if (docData.pages && docData.pages.length > 0) {
                        const loadedPages = docData.pages.map(page => ({
                            id: page.id,
                            pageNumber: page.pageNumber,
                            title: page.title,
                            content: page.content,
                            type: page.type
                        }));
                        setPages(loadedPages);
                        setCurrentPageId(loadedPages[0].id);
                        console.log('Loaded pages:', loadedPages);
                    } else if (docData.document_content) {
                        // Fallback to single page with document content
                    setDocumentContent(prev => ({
                        ...prev,
                            ...docData.document_content
                    }));
                    }
                }
                
                // Check if current user is the file creator
                if (session?.user?.id) {
                    const userMappingRes = await fetch(`/api/efiling/users/profile?userId=${session.user.id}`);
                    if (userMappingRes.ok) {
                        const userMapping = await userMappingRes.json();
                        const efilingUserId = userMapping.efiling_user_id;
                        
                        // Update canEditDocument based on whether user is the file creator
                        const isFileCreator = fileData.created_by === efilingUserId;
                        const isAdmin = session.user.role === 1;
                        setCanEditDocument(isAdmin || isFileCreator);
                        
                        console.log('Edit access check:', {
                            userId: session.user.id,
                            efilingUserId: efilingUserId,
                            fileCreatedBy: fileData.created_by,
                            isAdmin: isAdmin,
                            isFileCreator: isFileCreator,
                            canEdit: isAdmin || isFileCreator
                        });
                    }
                }
            } else {
                toast({
                    title: "Error",
                    description: "Failed to fetch file details",
                    variant: "destructive",
                });
            }
        } catch (error) {
            console.error('Error fetching file:', error);
            toast({
                title: "Error",
                description: "Failed to fetch file details",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const response = await fetch(`/api/efiling/files/${params.id}/document`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    content: getCurrentPage().content,
                    pages: pages,
                    template: selectedTemplate
                }),
            });

            if (response.ok) {
                const result = await response.json();
                toast({
                    title: "Success",
                    description: "Document saved successfully",
                });
                console.log('Document saved:', result);
            } else {
                const errorData = await response.json();
                console.error('Save error:', errorData);
                toast({
                    title: "Error",
                    description: errorData.error || "Failed to save document",
                    variant: "destructive",
                });
            }
        } catch (error) {
            console.error('Error saving document:', error);
            toast({
                title: "Error",
                description: "Failed to save document",
                variant: "destructive",
            });
        } finally {
            setSaving(false);
        }
    };

    const handleMarkTo = () => {
        setShowMarkToModal(true);
    };

    const addNewPage = () => {
        const newPageId = Math.max(...pages.map(p => p.id)) + 1;
        const newPageNumber = Math.max(...pages.map(p => p.pageNumber)) + 1;
        
        const newPage = {
            id: newPageId,
            pageNumber: newPageNumber,
            title: `Page ${newPageNumber}`,
            content: {
                title: '',
                subject: '',
                date: new Date().toLocaleDateString(),
                matter: '',
                regards: '',
                footer: '',
                customRegards: ''
            },
            type: 'ATTACHMENT'
        };
        
        setPages(prev => [...prev, newPage]);
        setCurrentPageId(newPageId);
        
        toast({
            title: "New Page Added",
            description: `Page ${newPageNumber} has been added to the document`,
        });
    };

    const deletePage = (pageId) => {
        if (pages.length <= 1) {
            toast({
                title: "Cannot Delete",
                description: "At least one page must remain in the document",
                variant: "destructive",
            });
            return;
        }
        
        const pageToDelete = pages.find(p => p.id === pageId);
        setPages(prev => prev.filter(p => p.id !== pageId));
        
        // If we're deleting the current page, switch to the first remaining page
        if (currentPageId === pageId) {
            const remainingPages = pages.filter(p => p.id !== pageId);
            setCurrentPageId(remainingPages[0].id);
        }
        
        toast({
            title: "Page Deleted",
            description: `${pageToDelete.title} has been removed from the document`,
        });
    };

    const updatePageTitle = (pageId, newTitle) => {
        setPages(prev => prev.map(p => 
            p.id === pageId ? { ...p, title: newTitle } : p
        ));
    };

    const getCurrentPage = () => {
        return pages.find(p => p.id === currentPageId) || pages[0];
    };

    const updateCurrentPageContent = (content) => {
        setPages(prev => prev.map(p => 
            p.id === currentPageId ? { ...p, content: { ...p.content, ...content } } : p
        ));
    };

    const selectTemplate = (templateId) => {
        setSelectedTemplate(templateId);
        
        const currentPage = getCurrentPage();
        
        // Apply template-specific content to current page
        let templateContent = {};
        
        switch (templateId) {
            case 1: // Official Letter
                templateContent = {
                    title: 'Official Letter',
                    subject: '',
                    date: new Date().toLocaleDateString(),
                    matter: '',
                    regards: 'Yours faithfully,',
                    footer: 'KWSC - Official Communication',
                    customRegards: ''
                };
                break;
            case 2: // Internal Memo
                templateContent = {
                    title: 'Internal Memo',
                    subject: '',
                    date: new Date().toLocaleDateString(),
                    matter: '',
                    regards: 'Best regards,',
                    footer: 'KWSC Internal Communication',
                    customRegards: ''
                };
                break;
            case 3: // Project Proposal
                templateContent = {
                    title: 'Project Proposal',
                    subject: '',
                    date: new Date().toLocaleDateString(),
                    matter: '',
                    regards: 'Sincerely,',
                    footer: 'KWSC Project Management',
                    customRegards: ''
                };
                break;
            case 4: // Work Order
                templateContent = {
                    title: 'Work Order',
                    subject: '',
                    date: new Date().toLocaleDateString(),
                    matter: '',
                    regards: 'Authorized by,',
                    footer: 'KWSC Engineering Department',
                    customRegards: ''
                };
                break;
            case 5: // Custom Document
                templateContent = {
                    title: '',
                    subject: '',
                    date: new Date().toLocaleDateString(),
                    matter: '',
                    regards: 'Custom Regards',
                    footer: '',
                    customRegards: ''
                };
                break;
            default:
                return;
        }
        
        // Update current page content
        updateCurrentPageContent(templateContent);
        
        toast({
            title: "Template Applied",
            description: "Document template has been applied to current page",
        });
    };

    const applyFormatting = (command, value) => {
        // Get the currently focused element
        const activeElement = document.activeElement;
        if (!activeElement) {
            toast({
                title: "No Field Selected",
                description: "Please click on a document field (header, title, subject, etc.) to apply formatting.",
                variant: "destructive",
            });
            return;
        }

        // Check if the active element is one of our document fields
        const isDocumentField = activeElement.id && (
            activeElement.id === 'header' || 
            activeElement.id === 'title' || 
            activeElement.id === 'subject' || 
            activeElement.id === 'date' || 
            activeElement.id === 'footer' ||
            activeElement.id === 'customHeader' ||
            activeElement.id === 'customRegards' ||
            activeElement.id === 'logo' // Added logo to document fields
        );

        // If it's a document field, apply formatting
        if (isDocumentField) {
            const selection = window.getSelection();
            if (!selection.rangeCount) {
                toast({
                    title: "No Text Selected",
                    description: "Please select some text to apply formatting.",
                    variant: "destructive",
                });
                return;
            }

            const range = selection.getRangeAt(0);
            const selectedText = selection.toString();

            if (selectedText) {
                let formattedText = selectedText;
                
                switch (command) {
                    case 'bold':
                        formattedText = `<strong>${selectedText}</strong>`;
                        break;
                    case 'italic':
                        formattedText = `<em>${selectedText}</em>`;
                        break;
                    case 'underline':
                        formattedText = `<u>${selectedText}</u>`;
                        break;
                    case 'strikethrough':
                        formattedText = `<s>${selectedText}</s>`;
                        break;
                    case 'font':
                        formattedText = `<span style="font-family: ${value}">${selectedText}</span>`;
                        break;
                    case 'size':
                        formattedText = `<span style="font-size: ${value}">${selectedText}</span>`;
                        break;
                    case 'color':
                        // For color, we'll use a simple color picker
                        const color = prompt('Enter color (e.g., red, #ff0000):', 'blue');
                        if (color) {
                            formattedText = `<span style="color: ${color}">${selectedText}</span>`;
                        } else {
                            return; // User cancelled
                        }
                        break;
                    case 'highlight':
                        // For highlight, we'll use a simple color picker
                        const highlightColor = prompt('Enter highlight color (e.g., yellow, #ffff00):', 'yellow');
                        if (highlightColor) {
                            formattedText = `<span style="background-color: ${highlightColor}">${selectedText}</span>`;
                        } else {
                            return; // User cancelled
                        }
                        break;
                    case 'align':
                        // For alignment, we need to wrap the entire field content
                        const fieldContent = activeElement.innerHTML;
                        const alignedContent = `<div style="text-align: ${value}">${fieldContent}</div>`;
                        activeElement.innerHTML = alignedContent;
                        return; // Exit early for alignment
                    case 'capitalize':
                        formattedText = selectedText.replace(/\b\w/g, l => l.toUpperCase());
                        break;
                    case 'uppercase':
                        formattedText = selectedText.toUpperCase();
                        break;
                    case 'lowercase':
                        formattedText = selectedText.toLowerCase();
                        break;
                    case 'bullet':
                        formattedText = `• ${selectedText}`;
                        break;
                    case 'number':
                        formattedText = `1. ${selectedText}`;
                        break;
                    case 'indent':
                        formattedText = `&nbsp;&nbsp;&nbsp;&nbsp;${selectedText}`;
                        break;
                    case 'outdent':
                        formattedText = selectedText.replace(/^&nbsp;&nbsp;&nbsp;&nbsp;/, '');
                        break;
                    case 'clear':
                        // Remove all HTML tags
                        formattedText = selectedText.replace(/<[^>]*>/g, '');
                        break;
                    case 'image':
                        // Handle image upload for main matter only
                        if (activeElement.id === 'matter') {
                            // This will be handled by TipTap editor
                            return;
                        } else {
                            // For other fields, show message
                            toast({
                                title: "Image Not Supported",
                                description: "Images can only be added to the main matter field.",
                                variant: "destructive",
                            });
                            return;
                        }
                    case 'table':
                        // Handle table insertion for main matter only
                        if (activeElement.id === 'matter') {
                            // This will be handled by TipTap editor
                            return;
                        } else {
                            toast({
                                title: "Table Not Supported",
                                description: "Tables can only be added to the main matter field.",
                                variant: "destructive",
                            });
                            return;
                        }
                    case 'link':
                        // Handle link insertion for main matter only
                        if (activeElement.id === 'matter') {
                            // This will be handled by TipTap editor
                            return;
                        } else {
                            toast({
                                title: "Link Not Supported",
                                description: "Links can only be added to the main matter field.",
                                variant: "destructive",
                            });
                            return;
                        }
                    case 'unlink':
                        // Handle link removal for main matter only
                        if (activeElement.id === 'matter') {
                            // This will be handled by TipTap editor
                            return;
                        } else {
                            toast({
                                title: "Link Removal Not Supported",
                                description: "Link removal can only be done in the main matter field.",
                                variant: "destructive",
                            });
                            return;
                        }
                    case 'undo':
                    case 'redo':
                        // Handle undo/redo for main matter only
                        if (activeElement.id === 'matter') {
                            // This will be handled by TipTap editor
                            return;
                        } else {
                            toast({
                                title: "Undo/Redo Not Supported",
                                description: "Undo/Redo can only be used in the main matter field.",
                                variant: "destructive",
                            });
                            return;
                        }
                    default:
                        return;
                }

                // Replace the selected text with formatted text
                range.deleteContents();
                const div = document.createElement('div');
                div.innerHTML = formattedText;
                range.insertNode(div.firstChild || div);

                // Update the document content state
                const fieldName = activeElement.id;
                const newValue = activeElement.innerHTML;
                
                setDocumentContent(prev => ({
                    ...prev,
                    [fieldName]: newValue
                }));

                // Clear selection
                selection.removeAllRanges();
            } else {
                // No text selected, show a message
                toast({
                    title: "No Text Selected",
                    description: "Please select some text to apply formatting.",
                    variant: "destructive",
                });
            }
        } else {
            // If it's not a document field, show a message
            toast({
                title: "No Field Selected",
                description: "Please click on a document field (header, title, subject, etc.) to apply formatting.",
                variant: "destructive",
            });
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-lg">Loading document editor...</div>
            </div>
        );
    }

    if (!file) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-lg text-red-600">File not found</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Add CSS styles for contentEditable placeholder */}
            <style jsx>{contentEditableStyles}</style>
            
            {/* Toolbar */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-50">
                <div className="flex items-center justify-between p-4">
                    <div className="flex items-center space-x-4">
                        <Button
                            variant="ghost"
                            onClick={() => router.back()}
                            className="flex items-center"
                        >
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back
                        </Button>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">Document Editor (Admin)</h1>
                            <p className="text-sm text-gray-600">File: {file.file_number}</p>
                            
                            {/* Editor Type Toggle */}
                            <div className="flex items-center space-x-2 mt-2">
                                <Button
                                    variant={editorType === 'structured' ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setEditorType('structured')}
                                    className="text-xs"
                                >
                                    📋 Structured Editor
                                </Button>
                                {/* <Button
                                    variant={editorType === 'blank' ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setEditorType('blank')}
                                    className="text-xs"
                                >
                                    📄 Blank A4 Page
                                </Button> */}
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                        <Button
                            onClick={handleSave}
                            disabled={saving}
                            className="bg-blue-600 hover:bg-blue-700"
                        >
                            {saving ? (
                                <div className="flex items-center">
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                    Saving...
                                </div>
                            ) : (
                                <div className="flex items-center">
                                    <Save className="w-4 h-4 mr-2" />
                                    Save
                                </div>
                            )}
                        </Button>
                        
                        <Button
                            onClick={handleMarkTo}
                            variant="outline"
                            className="border-green-600 text-green-600 hover:bg-green-50"
                        >
                            <Send className="w-4 h-4 mr-2" />
                            Mark To
                        </Button>
                        
                        <Button
                            onClick={() => {
                                // Open the signature modal from DocumentSignatureSystem
                                const signatureButton = document.querySelector('[data-signature-button]');
                                if (signatureButton) {
                                    signatureButton.click();
                                }
                            }}
                            variant="outline"
                            className="border-purple-600 text-purple-600 hover:bg-purple-50"
                        >
                            <Shield className="w-4 h-4 mr-2" />
                            E-Sign
                        </Button>
                    </div>
                </div>

                {/* Page Tabs */}
                <div className="border-t border-gray-200 p-2">
                    <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 flex-wrap">
                            <Label className="text-sm font-medium">Pages:</Label>
                            {pages.map((page) => (
                                <div key={page.id} className="flex items-center space-x-1">
                                    <Button
                                        variant={currentPageId === page.id ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setCurrentPageId(page.id)}
                                        className="flex items-center space-x-1"
                                    >
                                        <span>{page.title}</span>
                                    </Button>
                                    {pages.length > 1 && (
                                        <button
                                            onClick={() => deletePage(page.id)}
                                            className="ml-1 text-red-500 hover:text-red-700 text-sm font-bold w-5 h-5 flex items-center justify-center rounded-full hover:bg-red-100"
                                            disabled={!canEditDocument}
                                            title="Delete page"
                                        >
                                            ×
                                        </button>
                                    )}
                                </div>
                            ))}
                            {canEditDocument && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={addNewPage}
                                    className="text-green-600 border-green-600 hover:bg-green-50"
                                >
                                    + Add Page
                                </Button>
                            )}
                        </div>
                        
                        <div className="flex items-center space-x-2">
                        <Label className="text-sm font-medium">Templates:</Label>
                        <Button
                            variant={selectedTemplate === 1 ? "default" : "outline"}
                            size="sm"
                            onClick={() => selectTemplate(1)}
                            title="Official Letter Template"
                        >
                            📋 Letter
                        </Button>
                        <Button
                            variant={selectedTemplate === 2 ? "default" : "outline"}
                            size="sm"
                            onClick={() => selectTemplate(2)}
                            title="Internal Memo Template"
                        >
                            📝 Memo
                        </Button>
                        <Button
                            variant={selectedTemplate === 3 ? "default" : "outline"}
                            size="sm"
                            onClick={() => selectTemplate(3)}
                            title="Project Proposal Template"
                        >
                            📋 Proposal
                        </Button>
                        <Button
                            variant={selectedTemplate === 4 ? "default" : "outline"}
                            size="sm"
                            onClick={() => selectTemplate(4)}
                            title="Work Order Template"
                        >
                            📋 Work Order
                        </Button>
                        <Button
                            variant={selectedTemplate === 5 ? "default" : "outline"}
                            size="sm"
                            onClick={() => selectTemplate(5)}
                            title="Custom Document Template"
                        >
                            📋 Custom
                        </Button>
                        </div>
                    </div>
                </div>

                {/* Formatting Toolbar */}
                
            </div>

            {/* Main Content */}
            <div className="container mx-auto px-4 py-6">
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Main Editor Area */}
                    <div className="lg:col-span-3">
                        {editorType === 'structured' ? (
                            // Structured Editor
                            <Card className="min-h-[800px]">
                                <CardHeader>
                                    <CardTitle className="flex items-center justify-between">
                                        <span>Document Content - {getCurrentPage().title}</span>
                                        <div className="flex items-center space-x-2">
                                            <Input
                                                value={getCurrentPage().title}
                                                onChange={(e) => updatePageTitle(currentPageId, e.target.value)}
                                                className="w-48"
                                                disabled={!canEditDocument}
                                            />
                                        <Select value={selectedTemplate.toString()} onValueChange={(value) => selectTemplate(parseInt(value))}>
                                            <SelectTrigger className="w-48">
                                                <SelectValue placeholder="Select Template" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {documentTemplates.map((template) => (
                                                    <SelectItem key={template.id} value={template.id.toString()}>
                                                        {template.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        </div>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="space-y-4">
                                        {/* Fixed KWSC Header */}
                                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                                            <div className="flex items-center justify-center space-x-4">
                                                <img 
                                                    src="/logo.png" 
                                                    alt="KWSC Logo" 
                                                    className="h-16 w-auto"
                                                />
                                                <div className="text-center">
                                                    <h1 className="text-2xl font-bold text-blue-900">
                                                        Karachi Water & Sewerage Corporation
                                                    </h1>
                                                    <p className="text-sm text-blue-700 mt-1">
                                                        Government of Sindh
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                        <div>
                                            <Label htmlFor="title">Title</Label>
                                            <input
                                                id="title"
                                                type="text"
                                                value={htmlToText(getCurrentPage().content.title)}
                                                onChange={(e) => updateCurrentPageContent({ title: e.target.value })}
                                                className="w-full p-2 border border-gray-300 rounded-md min-h-[40px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="Enter document title"
                                                disabled={!canEditDocument}
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="subject">Subject</Label>
                                            <input
                                                id="subject"
                                                type="text"
                                                value={htmlToText(getCurrentPage().content.subject)}
                                                onChange={(e) => updateCurrentPageContent({ subject: e.target.value })}
                                                className="w-full p-2 border border-gray-300 rounded-md min-h-[40px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="Enter document subject"
                                                disabled={!canEditDocument}
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="date">Date</Label>
                                            <input
                                                id="date"
                                                type="text"
                                                value={htmlToText(getCurrentPage().content.date)}
                                                onChange={(e) => updateCurrentPageContent({ date: e.target.value })}
                                                className="w-full p-2 border border-gray-300 rounded-md min-h-[40px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="Enter date"
                                                disabled={!canEditDocument}
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="matter">Main Matter</Label>
                                            <TipTapEditor
                                                value={(getCurrentPage().content.matter) || ''}
                                                onChange={(value) => updateCurrentPageContent({ matter: value })}
                                                placeholder="Enter main content..."
                                                className="min-h-[200px]"
                                                readOnly={!canEditDocument}
                                            />
                                            {!canEditDocument && (
                                                <p className="text-sm text-gray-500 mt-1">
                                                    Only the document creator or authorized administrators can edit this content.
                                                </p>
                                            )}
                                        </div>
                                        <div>
                                            <Label htmlFor="regards">Regards</Label>
                                            <Select 
                                                value={(getCurrentPage().content.regards) || ''} 
                                                onValueChange={(value) => updateCurrentPageContent({ regards: value })}
                                                disabled={!canEditDocument}
                                            >
                                                <SelectTrigger id="regards">
                                                    <SelectValue placeholder="Select regards" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="Yours faithfully">Yours faithfully</SelectItem>
                                                    <SelectItem value="Yours sincerely">Yours sincerely</SelectItem>
                                                    <SelectItem value="Best regards">Best regards</SelectItem>
                                                    <SelectItem value="Custom">Custom</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            {getCurrentPage().content.regards === 'Custom' && (
                                                <input
                                                    id="customRegards"
                                                    type="text"
                                                    value={htmlToText(getCurrentPage().content.customRegards)}
                                                    onChange={(e) => updateCurrentPageContent({ customRegards: e.target.value })}
                                                    className="w-full p-2 border border-gray-300 rounded-md min-h-[40px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent mt-2"
                                                    placeholder="Enter custom regards"
                                                    disabled={!canEditDocument}
                                                />
                                            )}
                                        </div>
                                        <div>
                                            <Label htmlFor="footer">Footer</Label>
                                            <input
                                                id="footer"
                                                type="text"
                                                value={htmlToText(getCurrentPage().content.footer)}
                                                onChange={(e) => updateCurrentPageContent({ footer: e.target.value })}
                                                className="w-full p-2 border border-gray-300 rounded-md min-h-[40px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="Enter footer text"
                                                disabled={!canEditDocument}
                                            />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ) : (
                            // Blank A4 Page Editor
                            <Card className="min-h-[800px]">
                                <CardHeader>
                                    <CardTitle className="flex items-center justify-between">
                                        <span>Blank A4 Page Editor</span>
                                        <Select value={selectedTemplate.toString()} onValueChange={(value) => selectTemplate(parseInt(value))}>
                                            <SelectTrigger className="w-48">
                                                <SelectValue placeholder="Select Template" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {documentTemplates.map((template) => (
                                                    <SelectItem key={template.id} value={template.id.toString()}>
                                                        {template.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {/* A4 Page Container */}
                                    <div className="bg-white border border-gray-300 shadow-lg mx-auto" style={{ width: '210mm', minHeight: '297mm', padding: '20mm' }}>
                                        {/* Fixed KWSC Header */}
                                        <div className="text-center mb-8 border-b border-gray-300 pb-4">
                                            <div className="flex items-center justify-center space-x-4 mb-4">
                                                <img 
                                                    src="/logo.png" 
                                                    alt="KWSC Logo" 
                                                    className="h-12 w-auto"
                                                />
                                                <div className="text-center">
                                                    <h1 className="text-xl font-bold text-blue-900">
                                                        Karachi Water & Sewerage Corporation
                                                    </h1>
                                                    <p className="text-sm text-blue-700">
                                                        Government of Sindh
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Title */}
                                        <div className="text-center mb-6">
                                            <div className="text-2xl font-bold text-gray-900 mb-2">
                                                {documentContent.title || 'Document Title'}
                                            </div>
                                        </div>

                                        {/* Subject */}
                                        <div className="mb-6">
                                            <div className="text-lg font-medium text-gray-800 mb-2">
                                                Subject: {documentContent.subject || 'Document Subject'}
                                            </div>
                                        </div>

                                        {/* Date */}
                                        <div className="mb-6 text-right">
                                            <div className="text-sm text-gray-600">
                                                Date: {documentContent.date || new Date().toLocaleDateString()}
                                            </div>
                                        </div>

                                        {/* Main Content */}
                                        <div className="mb-8">
                                            <TipTapEditor
                                                value={documentContent.matter}
                                                onChange={(value) => setDocumentContent(prev => ({ ...prev, matter: value }))}
                                                placeholder="Start typing your document content here..."
                                                className="min-h-[400px]"
                                            />
                                        </div>

                                        {/* Regards */}
                                        <div className="mb-4">
                                            <div className="text-lg font-medium text-gray-800">
                                                {documentContent.regards || 'Yours faithfully,'}
                                            </div>
                                        </div>

                                        {/* Footer */}
                                        <div className="text-center mt-8">
                                            <div className="text-sm text-gray-600">
                                                {documentContent.footer || 'Document Footer'}
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    {/* Sidebar */}
                    <div className="lg:col-span-1">
                        <div className="space-y-6">
                            {/* File Information */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-lg">File Information</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="flex items-center space-x-2">
                                        <Building2 className="w-4 h-4 text-gray-500" />
                                        <span className="text-sm text-gray-600">Department: {file.department_name || 'N/A'}</span>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <User className="w-4 h-4 text-gray-500" />
                                        <span className="text-sm text-gray-600">Assigned to: {file.assigned_to_name || 'Unassigned'}</span>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <Calendar className="w-4 h-4 text-gray-500" />
                                        <span className="text-sm text-gray-600">Created: {new Date(file.created_at).toLocaleDateString()}</span>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Help */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-lg">Help & Tips</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2 text-sm text-gray-600">
                                    <p>• Use the template buttons to apply predefined document structures</p>
                                    <p>• The TipTap editor provides professional formatting tools</p>
                                    <p>• Use &quot;Mark To&quot; to send for approval</p>
                                    <p>• Save your work regularly</p>
                                </CardContent>
                            </Card>

                            {/* Attachment Manager */}
                            <AttachmentManager
                                fileId={params.id}
                                canEdit={canEditDocument}
                                viewOnly={!canEditDocument}
                            />

                            {/* Document Signature System */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-lg">Document Signature System</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <DocumentSignatureSystem
                                        fileId={params.id}
                                        userRole={userRole}
                                        canEditDocument={canEditDocument}
                                        onSignatureAdded={(signature) => {
                                            // Handle signature added
                                            console.log('Signature added:', signature);
                                        }}
                                        onCommentAdded={(comment) => {
                                            // Handle comment added
                                            console.log('Comment added:', comment);
                                        }}
                                    />
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modals */}
            {showMarkToModal && (
                <MarkToModal
                    showMarkToModal={showMarkToModal}
                    fileId={params.id}
                    onClose={() => setShowMarkToModal(false)}
                />
            )}

            {showESignatureModal && (
                <ESignatureModal
                    fileId={params.id}
                    onClose={() => setShowESignatureModal(false)}
                />
            )}
        </div>
    );
}