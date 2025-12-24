"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useEfilingUser } from "@/context/EfilingUserContext";
import { Pen, MessageSquare, User, Calendar, X, Edit, Trash2, Shield, Settings, Eye, EyeOff, CheckCircle, AlertCircle } from "lucide-react";
import SignatureCanvas from "react-signature-canvas";
import { useSession } from "next-auth/react";

export default function DocumentSignatureSystem({ 
    fileId, 
    onSignatureAdded, 
    onCommentAdded,
    userRole,
    canEditDocument,
    hasUserSigned = false,
    viewOnly = false
}) {
    const { data: session } = useSession();
    const { toast } = useToast();
    const { efilingUserId } = useEfilingUser();
    const [signatures, setSignatures] = useState([]);
    const [comments, setComments] = useState([]);
    const [showSignatureModal, setShowSignatureModal] = useState(false);
    const [showCommentModal, setShowCommentModal] = useState(false);
    const [userSignatures, setUserSignatures] = useState([]);
    const [showSignatureManager, setShowSignatureManager] = useState(false);
    const [signaturePosition, setSignaturePosition] = useState({ x: 0, y: 0 });
    const [commentText, setCommentText] = useState("");
    const [editingCommentId, setEditingCommentId] = useState(null);
    const [editCommentText, setEditCommentText] = useState("");
    const [otpCode, setOtpCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [otpSent, setOtpSent] = useState(false);
    const [countdown, setCountdown] = useState(0);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [pendingAction, setPendingAction] = useState(null);
    const [pendingSignatureData, setPendingSignatureData] = useState(null);
    
    // New signature creation states
    const [signatureText, setSignatureText] = useState("");
    const [signatureFont, setSignatureFont] = useState("Arial");
    const [signatureColor, setSignatureColor] = useState("black");
    const [scannedSignatureFile, setScannedSignatureFile] = useState(null);
    const [activeSignatureTab, setActiveSignatureTab] = useState("draw");
    const [editingSignatureId, setEditingSignatureId] = useState(null);
    const [activeSignature, setActiveSignature] = useState(null);
    
    const sigCanvasRef = useRef(null);
    const documentRef = useRef(null);
    const fileInputRef = useRef(null);

    // Signature fonts
    const signatureFonts = [
        { value: "Arial", label: "Arial" },
        { value: "Times New Roman", label: "Times New Roman" },
        { value: "Courier New", label: "Courier New" },
        { value: "Georgia", label: "Georgia" },
        { value: "Verdana", label: "Verdana" },
        { value: "Palatino", label: "Palatino" },
        { value: "Garamond", label: "Garamond" },
        { value: "Bookman", label: "Bookman" }
    ];

    // Countdown timer for OTP
    useEffect(() => {
        let timer;
        if (countdown > 0) {
            timer = setTimeout(() => setCountdown(countdown - 1), 1000);
        }
        return () => clearTimeout(timer);
    }, [countdown]);

    // Load existing signatures and comments
    useEffect(() => {
        if (fileId) {
            loadSignatures();
            loadComments();
            loadUserSignatures();
        }
    }, [fileId, efilingUserId]);

    // Initialize canvas when signature modal opens
    useEffect(() => {
        if (showSignatureModal && activeSignatureTab === "draw") {
            // Small delay to ensure the canvas is rendered
            const timer = setTimeout(() => {
                if (sigCanvasRef.current) {
                    console.log('Canvas initialized successfully');
                }
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [showSignatureModal, activeSignatureTab]);

    const loadSignatures = async () => {
        try {
            const response = await fetch(`/api/efiling/files/${fileId}/signatures`);
            if (response.ok) {
                const data = await response.json();
                setSignatures(data);
            }
        } catch (error) {
            console.error('Error loading signatures:', error);
        }
    };

    const loadComments = async () => {
        try {
            const response = await fetch(`/api/efiling/files/${fileId}/comments`);
            if (response.ok) {
                const data = await response.json();
                setComments(data);
            }
        } catch (error) {
            console.error('Error loading comments:', error);
        }
    };

    const loadUserSignatures = async () => {
        if (!efilingUserId) return;
        try {
            const response = await fetch(`/api/efiling/signatures/manage?userId=${efilingUserId}`);
            if (response.ok) {
                const data = await response.json();
                setUserSignatures(data.signatures || []);
                // Find active signature
                const active = data.signatures?.find(sig => sig.is_active);
                setActiveSignature(active || null);
            }
        } catch (error) {
            console.error('Error loading user signatures:', error);
        }
    };

    // Send OTP
    const sendOTP = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/efiling/send-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ method: 'whatsapp' })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                setOtpSent(true);
                setCountdown(60);
                toast({
                    title: "OTP Sent",
                    description: data.message || "OTP has been sent to your registered WhatsApp number.",
                });
            } else {
                // If WhatsApp fails but OTP is provided for testing
                if (data.otpCode) {
                    toast({
                        title: "OTP Generated (Testing Mode)",
                        description: `WhatsApp delivery failed. Your OTP is: ${data.otpCode}`,
                        variant: "default",
                    });
                    setOtpSent(true);
                    setCountdown(60);
                } else {
                    throw new Error(data.error || 'Failed to send OTP');
                }
            }
        } catch (error) {
            toast({
                title: "Error",
                description: error.message || "Failed to send OTP. Please try again.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    // Verify authentication
    const verifyAuthentication = async () => {
        try {
            setLoading(true);
            
            // Use WhatsApp OTP verification
            const response = await fetch('/api/efiling/verify-auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: session?.user?.id,
                    code: otpCode
                })
            });

            if (response.ok) {
                setShowAuthModal(false);
                setOtpCode("");
                
                // Execute the pending action - Only for signatures, not comments
                if (pendingAction === 'addSignature' && pendingSignatureData) {
                    await addSignatureToDocument(pendingSignatureData);
                }
                
                toast({
                    title: "Authentication Successful",
                    description: "Your identity has been verified.",
                });
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Authentication failed');
            }
        } catch (error) {
            toast({
                title: "Authentication Failed",
                description: error.message || "Invalid code. Please try again.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    // Register Google email

    // Add signature to document
    const addSignatureToDocument = async (signatureData) => {
        try {
            const newSignature = {
                id: Date.now(),
                user_id: session?.user?.id,
                user_name: session?.user?.name,
                user_role: userRole,
                type: signatureData.type,
                content: signatureData.content,
                position: signatureData.position,
                font: signatureData.font || signatureFont,
                color: signatureData.color || signatureColor,
                timestamp: new Date().toISOString(),
                file_id: fileId
            };

            const response = await fetch(`/api/efiling/files/${fileId}/signatures`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newSignature)
            });

            if (response.ok) {
                setSignatures(prev => [...prev, newSignature]);
                onSignatureAdded && onSignatureAdded(newSignature);
                setShowSignatureModal(false); // Close signature modal after successful application
                setShowAuthModal(false); // Ensure auth modal is also closed
                toast({
                    title: "Signature Added",
                    description: "Your signature has been added to the document.",
                });
            } else {
                throw new Error('Failed to add signature');
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to add signature. Please try again.",
                variant: "destructive",
            });
        }
    };

    // Add comment to document
    const addCommentToDocument = async () => {
        try {
            const newComment = {
                id: Date.now(),
                user_id: session?.user?.id,
                user_name: session?.user?.name,
                user_role: userRole,
                text: commentText,
                timestamp: new Date().toISOString(),
                file_id: fileId
            };

            const response = await fetch(`/api/efiling/files/${fileId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newComment)
            });

            if (response.ok) {
                setComments(prev => [...prev, newComment]);
                onCommentAdded && onCommentAdded(newComment);
                setCommentText("");
                setShowCommentModal(false);
                toast({
                    title: "Comment Added",
                    description: "Your comment has been added to the document.",
                });
            } else {
                throw new Error('Failed to add comment');
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to add comment. Please try again.",
                variant: "destructive",
            });
        }
    };

    // Handle signature creation
    const handleCreateSignature = (signatureData) => {
        setPendingAction('addSignature');
        setPendingSignatureData(signatureData);
        setShowSignatureModal(false); // Close signature creation modal before showing auth modal
        setShowAuthModal(true);
    };

    // Handle using saved signature
    const handleUseSavedSignature = () => {
        if (!activeSignature) return;
        
        const signatureData = {
            type: activeSignature.signature_type === 'drawn' || activeSignature.signature_type === 'scanned' ? 'image' : 'text',
            content: activeSignature.file_url || activeSignature.signature_data || activeSignature.signature_text,
            position: { x: 100, y: 100 },
            font: activeSignature.signature_font || signatureFont,
            color: activeSignature.signature_color || signatureColor,
            signatureId: activeSignature.id
        };
        
        setPendingAction('addSignature');
        setPendingSignatureData(signatureData);
        setShowAuthModal(true);
    };

    // Handle drawn signature
    const handleDrawnSignature = async () => {
        if (!sigCanvasRef.current) {
            toast({
                title: "Canvas Error",
                description: "Drawing canvas is not available. Please try again.",
                variant: "destructive",
            });
            return;
        }

        try {
            if (!efilingUserId) {
                toast({
                    title: "Unable to save",
                    description: "Your e-filing profile is not available. Please refresh and try again.",
                    variant: "destructive",
                });
                return;
            }
            // Check if canvas has content by getting image data
            const sourceCanvas = sigCanvasRef.current.getCanvas();
            if (!sourceCanvas) {
                toast({
                    title: "Canvas Error",
                    description: "Canvas element not found. Please try again.",
                    variant: "destructive",
                });
                return;
            }

            const sourceCtx = sourceCanvas.getContext('2d');
            const sourceImageData = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
            const hasContent = sourceImageData.data.some(channel => channel !== 0);

            if (!hasContent) {
                toast({
                    title: "No Signature",
                    description: "Please draw a signature first.",
                    variant: "destructive",
                });
                return;
            }

            // Convert to PNG with selected color
            // Create a new canvas to apply color
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = sourceCanvas.width;
            tempCanvas.height = sourceCanvas.height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.putImageData(sourceImageData, 0, 0);
            
            // Apply color filter
            const colorMap = {
                'black': { r: 0, g: 0, b: 0 },
                'blue': { r: 0, g: 0, b: 255 },
                'red': { r: 255, g: 0, b: 0 }
            };
            const targetColor = colorMap[signatureColor] || colorMap['black'];
            
            const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            const data = imgData.data;
            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] > 0) { // If pixel is not transparent
                    data[i] = targetColor.r;     // R
                    data[i + 1] = targetColor.g; // G
                    data[i + 2] = targetColor.b; // B
                }
            }
            tempCtx.putImageData(imgData, 0, 0);
            
            const dataURL = tempCanvas.toDataURL("image/png");
            
            // Save to file storage first
            const uploadResponse = await fetch('/api/efiling/signatures/upload', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    signatureData: dataURL,
                    userId: efilingUserId,
                    userName: session?.user?.name,
                    signatureType: 'drawn',
                    signatureColor: signatureColor
                }),
            });

            if (!uploadResponse.ok) {
                throw new Error('Failed to upload signature file');
            }

            const uploadResult = await uploadResponse.json();

            // Reload user signatures to reflect changes
            loadUserSignatures();

            // Now create the signature record
            handleCreateSignature({
                type: 'image',
                content: uploadResult.fileUrl, // Use the file URL instead of base64
                position: { x: 100, y: 100 },
                filePath: uploadResult.fileUrl,
                signatureId: uploadResult.signatureId,
                color: signatureColor
            });

            toast({
                title: "Signature Saved",
                description: "Your signature has been saved successfully.",
            });

        } catch (error) {
            console.error('Error processing signature:', error);
            toast({
                title: "Error",
                description: "Failed to process signature. Please try again.",
                variant: "destructive",
            });
        }
    };

    // Handle typed signature
    const handleTypedSignature = async () => {
        if (!signatureText.trim()) {
            toast({
                title: "No Signature Text",
                description: "Please enter signature text.",
                variant: "destructive",
            });
            return;
        }
        
        if (!efilingUserId) {
            toast({
                title: "Unable to save",
                description: "Your e-filing profile is not available. Please refresh and try again.",
                variant: "destructive",
            });
            return;
        }
        
        // Save typed signature to database
        try {
            const uploadResponse = await fetch('/api/efiling/signatures/upload', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    signatureText: signatureText,
                    signatureFont: signatureFont,
                    signatureColor: signatureColor,
                    userId: efilingUserId,
                    userName: session?.user?.name,
                    signatureType: 'typed'
                }),
            });

            if (!uploadResponse.ok) {
                throw new Error('Failed to upload signature');
            }

            const uploadResult = await uploadResponse.json();
            loadUserSignatures();

            handleCreateSignature({
                type: 'text',
                content: signatureText,
                font: signatureFont,
                color: signatureColor,
                position: { x: 100, y: 100 },
                signatureId: uploadResult.signatureId
            });
        } catch (error) {
            console.error('Error saving typed signature:', error);
            toast({
                title: "Error",
                description: "Failed to save signature. Please try again.",
                variant: "destructive",
            });
        }
    };

    // Handle signature management (activate/deactivate)
    const manageSignature = async (action, signatureId) => {
        if (!efilingUserId) {
            toast({
                title: "Unable to update signature",
                description: "Your e-filing profile is not available. Please refresh and try again.",
                variant: "destructive",
            });
            return;
        }
        try {
            const response = await fetch('/api/efiling/signatures/manage', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action,
                    signatureId,
                    userId: efilingUserId
                }),
            });

            const result = await response.json();

            if (response.ok) {
                loadUserSignatures(); // Reload signatures
                toast({
                    title: "Success",
                    description: result.message,
                });
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Error managing signature:', error);
            toast({
                title: "Error",
                description: error.message || "Failed to manage signature.",
                variant: "destructive",
            });
        }
    };

    // Handle scanned signature
    const handleScannedSignature = () => {
        if (!scannedSignatureFile) {
            toast({
                title: "No Scanned Signature",
                description: "Please upload a scanned signature image.",
                variant: "destructive",
            });
            return;
        }
        handleCreateSignature({
            type: 'image',
            content: scannedSignatureFile,
            position: { x: 100, y: 100 }
        });
    };

    // Handle file upload for scanned signature
    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (file) {
            // Validate file size (5MB max for signature images)
            if (file.size > 5 * 1024 * 1024) {
                toast({
                    title: "Invalid File",
                    description: "File size exceeds limit. Maximum allowed: 5MB",
                    variant: "destructive",
                });
                event.target.value = ''; // Clear the input
                return;
            }
            
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    setScannedSignatureFile(e.target.result);
                };
                reader.readAsDataURL(file);
            } else {
                toast({
                    title: "Invalid File",
                    description: "Please upload an image file (PNG, JPG, etc.).",
                    variant: "destructive",
                });
            }
        }
    };

    // Handle comment creation
    const handleAddComment = async () => {
        if (!commentText.trim()) {
            toast({
                title: "No Comment",
                description: "Please enter a comment.",
                variant: "destructive",
            });
            return;
        }
        // Comments don't require authentication - only e-signatures do
        await addCommentToDocument();
    };

    // Edit comment
    const handleEditComment = async (commentId) => {
        try {
            const response = await fetch(`/api/efiling/files/${fileId}/comments/${commentId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: editCommentText })
            });

            if (response.ok) {
                setComments(prev => prev.map(comment => 
                    comment.id === commentId 
                        ? { ...comment, text: editCommentText, edited: true, edited_at: new Date().toISOString() }
                        : comment
                ));
                setEditingCommentId(null);
                setEditCommentText("");
                toast({
                    title: "Comment Updated",
                    description: "Your comment has been updated.",
                });
            } else {
                throw new Error('Failed to update comment');
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to update comment. Please try again.",
                variant: "destructive",
            });
        }
    };

    // Delete comment
    const handleDeleteComment = async (commentId) => {
        try {
            const response = await fetch(`/api/efiling/files/${fileId}/comments/${commentId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                setComments(prev => prev.filter(comment => comment.id !== commentId));
                toast({
                    title: "Comment Deleted",
                    description: "Your comment has been deleted.",
                });
            } else {
                throw new Error('Failed to delete comment');
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to delete comment. Please try again.",
                variant: "destructive",
            });
        }
    };

    // Check if user can edit comment
    const canEditComment = (comment) => {
        return (comment.user_id && efilingUserId && Number(comment.user_id) === Number(efilingUserId)) ||
            ['superadmin', 'CEO', 'Chief IT Officer'].includes(userRole);
    };

    return (
        <div className="space-y-6">
            {/* Signature and Comment Controls - Hide in viewOnly mode */}
            {!viewOnly && (
                <div className={`grid gap-3 ${hasUserSigned ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
                    {!hasUserSigned && canEditDocument && (
                        <Button
                            onClick={() => setShowSignatureModal(true)}
                            className="flex items-center justify-center gap-2 w-full"
                            data-signature-button
                        >
                            <Pen className="w-4 h-4" />
                            E-Signature
                        </Button>
                    )}
                    {canEditDocument && (
                        <Button
                            onClick={() => setShowCommentModal(true)}
                            variant="outline"
                            className="flex items-center justify-center gap-2 w-full"
                            data-comment-button
                        >
                            <MessageSquare className="w-4 h-4" />
                            Add Comment
                        </Button>
                    )}
                </div>
            )}

            {/* Signatures Display */}
            {signatures.length > 0 && (
                viewOnly ? (
                    <div className="space-y-3">
                        {signatures.map((signature) => {
                            // Helper function to get the correct image URL
                            const getSignatureImageUrl = (content) => {
                                if (!content) return null;
                                // If it's a base64 data URL, return as is
                                if (content.startsWith('data:image/')) {
                                    return content;
                                }
                                // If it's a file URL, convert to API route
                                if (content.startsWith('/api/uploads/')) {
                                    return content;
                                }
                                if (content.startsWith('/api/')) {
                                    return content;
                                }
                                if (content.startsWith('/uploads/')) {
                                    return content.replace('/uploads/', '/api/uploads/');
                                }
                                // If it starts with http/https, extract path and convert to API route
                                if (content.startsWith('http://') || content.startsWith('https://')) {
                                    try {
                                        const url = new URL(content);
                                        const path = url.pathname;
                                        if (path.startsWith('/uploads/')) {
                                            return path.replace('/uploads/', '/api/uploads/');
                                        }
                                        if (path.startsWith('/api/uploads/')) {
                                            return path;
                                        }
                                        // If path doesn't match expected patterns, try to construct
                                        return `/api/uploads${path}`;
                                    } catch (e) {
                                        console.error('Error parsing signature URL:', e);
                                        return content;
                                    }
                                }
                                // Otherwise, assume it's a relative path and try to convert
                                return `/api/uploads${content.startsWith('/') ? '' : '/'}${content}`;
                            };
                            
                            const imageUrl = signature.type === 'image' || (signature.type && signature.type.toLowerCase().includes('image'))
                                ? getSignatureImageUrl(signature.content)
                                : null;
                            
                            return (
                                <div key={signature.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-8 border rounded bg-white flex items-center justify-center">
                                            {signature.type === 'text' ? (
                                                <span 
                                                    className="text-sm font-bold"
                                                    style={{ 
                                                        fontFamily: signature.font || signatureFont,
                                                        color: signature.color === 'black' ? '#000' : signature.color === 'blue' ? '#2563eb' : signature.color === 'red' ? '#dc2626' : '#000'
                                                    }}
                                                >
                                                    {signature.content}
                                                </span>
                                                ) : imageUrl ? (
                                                    <img
                                                        src={imageUrl}
                                                        alt="Signature"
                                                        className="w-10 h-6 object-contain"
                                                        loading="lazy"
                                                        onError={(e) => {
                                                            // Prevent infinite retries that cause flickering
                                                            const img = e.target;
                                                            if (img.dataset.retryCount === '1') {
                                                                // Hide the broken image and show a placeholder
                                                                img.style.display = 'none';
                                                                const parent = img.parentElement;
                                                                if (parent && !parent.querySelector('.signature-error')) {
                                                                    const errorDiv = document.createElement('div');
                                                                    errorDiv.className = 'signature-error text-xs text-gray-400 text-center p-2';
                                                                    errorDiv.textContent = 'Image not found';
                                                                    parent.appendChild(errorDiv);
                                                                }
                                                                console.error('Failed to load signature image after retry:', imageUrl);
                                                                return;
                                                            }
                                                            img.dataset.retryCount = '1';
                                                            // Try original content if different (without /api/ prefix)
                                                            if (imageUrl !== signature.content && signature.content) {
                                                                // If imageUrl starts with /api/uploads/, try without /api/ prefix
                                                                if (imageUrl.startsWith('/api/uploads/')) {
                                                                    const withoutApi = imageUrl.replace('/api/uploads/', '/uploads/');
                                                                    setTimeout(() => {
                                                                        img.src = withoutApi;
                                                                    }, 100);
                                                                } else {
                                                                    setTimeout(() => {
                                                                        img.src = signature.content;
                                                                    }, 100);
                                                                }
                                                            } else {
                                                                img.style.display = 'none';
                                                                const parent = img.parentElement;
                                                                if (parent && !parent.querySelector('.signature-error')) {
                                                                    const errorDiv = document.createElement('div');
                                                                    errorDiv.className = 'signature-error text-xs text-gray-400 text-center p-2';
                                                                    errorDiv.textContent = 'Image not found';
                                                                    parent.appendChild(errorDiv);
                                                                }
                                                                console.error('Failed to load signature image:', imageUrl);
                                                            }
                                                        }}
                                                    />
                                                ) : (
                                                    <span className="text-xs text-gray-400">No image</span>
                                                )}
                                        </div>
                                        <div>
                                            <div className="font-medium">{signature.user_name}</div>
                                            <div className="text-sm text-gray-500">
                                                {signature.user_role} • {new Date(signature.timestamp).toLocaleString()}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-xs text-gray-400">
                                        Position: ({Math.round(signature.position.x)}, {Math.round(signature.position.y)})
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Shield className="w-5 h-5" />
                                Document Signatures ({signatures.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {signatures.map((signature) => {
                                    // Helper function to get the correct image URL
                                    // Use the same logic as profile page - convert /uploads/ to /api/uploads/
                                    const getSignatureImageUrl = (content) => {
                                        if (!content) return null;
                                        // If it's a base64 data URL, return as is
                                        if (content.startsWith('data:image/')) {
                                            return content;
                                        }
                                        // Use same logic as profile page
                                        if (content.startsWith('/api/')) {
                                            return content; // Already correct
                                        }
                                        if (content.startsWith('/uploads/')) {
                                            return content.replace('/uploads/', '/api/uploads/');
                                        }
                                        // If it starts with http/https, extract path and convert to /api/uploads/
                                        if (content.startsWith('http://') || content.startsWith('https://')) {
                                            try {
                                                const url = new URL(content);
                                                const path = url.pathname;
                                                if (path.startsWith('/api/uploads/')) {
                                                    return path; // Already correct
                                                }
                                                if (path.startsWith('/uploads/')) {
                                                    return path.replace('/uploads/', '/api/uploads/');
                                                }
                                                // Try to construct API path
                                                return `/api/uploads${path.startsWith('/') ? '' : '/'}${path}`;
                                            } catch (e) {
                                                console.error('Error parsing signature URL:', e);
                                                return content;
                                            }
                                        }
                                        // Otherwise, assume it's a relative path and prepend /api/uploads/
                                        return `/api/uploads${content.startsWith('/') ? '' : '/'}${content}`;
                                    };
                                    
                                    const imageUrl = signature.type === 'image' || (signature.type && signature.type.toLowerCase().includes('image'))
                                        ? getSignatureImageUrl(signature.content)
                                        : null;
                                    
                                    return (
                                        <div key={signature.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                            <div className="flex items-center gap-3">
                                                <div className="w-12 h-8 border rounded bg-white flex items-center justify-center">
                                                    {signature.type === 'text' ? (
                                                        <span 
                                                            className="text-sm font-bold"
                                                            style={{ 
                                                                fontFamily: signature.font || signatureFont,
                                                                color: signature.color === 'black' ? '#000' : signature.color === 'blue' ? '#2563eb' : signature.color === 'red' ? '#dc2626' : '#000'
                                                            }}
                                                        >
                                                            {signature.content}
                                                        </span>
                                                ) : imageUrl ? (
                                                    <img
                                                        src={imageUrl}
                                                        alt="Signature"
                                                        className="w-10 h-6 object-contain"
                                                        loading="lazy"
                                                        onError={(e) => {
                                                            // Prevent infinite retries that cause flickering
                                                            const img = e.target;
                                                            if (img.dataset.retryCount === '1') {
                                                                // Hide the broken image and show a placeholder
                                                                img.style.display = 'none';
                                                                const parent = img.parentElement;
                                                                if (parent && !parent.querySelector('.signature-error')) {
                                                                    const errorDiv = document.createElement('div');
                                                                    errorDiv.className = 'signature-error text-xs text-gray-400 text-center p-2';
                                                                    errorDiv.textContent = 'Image not found';
                                                                    parent.appendChild(errorDiv);
                                                                }
                                                                console.error('Failed to load signature image after retry:', imageUrl);
                                                                return;
                                                            }
                                                            img.dataset.retryCount = '1';
                                                            // Try original content if different (without /api/ prefix)
                                                            if (imageUrl !== signature.content && signature.content) {
                                                                // If imageUrl starts with /api/uploads/, try without /api/ prefix
                                                                if (imageUrl.startsWith('/api/uploads/')) {
                                                                    const withoutApi = imageUrl.replace('/api/uploads/', '/uploads/');
                                                                    setTimeout(() => {
                                                                        img.src = withoutApi;
                                                                    }, 100);
                                                                } else {
                                                                    setTimeout(() => {
                                                                        img.src = signature.content;
                                                                    }, 100);
                                                                }
                                                            } else {
                                                                img.style.display = 'none';
                                                                const parent = img.parentElement;
                                                                if (parent && !parent.querySelector('.signature-error')) {
                                                                    const errorDiv = document.createElement('div');
                                                                    errorDiv.className = 'signature-error text-xs text-gray-400 text-center p-2';
                                                                    errorDiv.textContent = 'Image not found';
                                                                    parent.appendChild(errorDiv);
                                                                }
                                                                console.error('Failed to load signature image:', imageUrl);
                                                            }
                                                        }}
                                                    />
                                                ) : (
                                                    <span className="text-xs text-gray-400">No image</span>
                                                )}
                                                </div>
                                                <div>
                                                    <div className="font-medium">{signature.user_name}</div>
                                                    <div className="text-sm text-gray-500">
                                                        {signature.user_role} • {new Date(signature.timestamp).toLocaleString()}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-xs text-gray-400">
                                                Position: ({Math.round(signature.position.x)}, {Math.round(signature.position.y)})
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                )
            )}

            {/* Comments Display */}
            {comments.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <MessageSquare className="w-5 h-4" />
                            Document Comments ({comments.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {comments.map((comment) => (
                                <div key={comment.id} className="border-l-4 border-blue-500 pl-4">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2">
                                                <User className="w-4 h-4 text-gray-500" />
                                                <span className="font-medium">{comment.user_name}</span>
                                                <span className="text-sm text-gray-500">•</span>
                                                <span className="text-sm text-gray-500">{comment.user_role}</span>
                                                <span className="text-sm text-gray-500">•</span>
                                                <Calendar className="w-4 h-4 text-gray-500" />
                                                <span className="text-sm text-gray-500">
                                                    {new Date(comment.timestamp).toLocaleString()}
                                                </span>
                                                {comment.edited && (
                                                    <span className="text-xs text-gray-400">(edited)</span>
                                                )}
                                            </div>
                                            {editingCommentId === comment.id ? (
                                                <div className="space-y-2">
                                                    <Input
                                                        value={editCommentText}
                                                        onChange={(e) => setEditCommentText(e.target.value)}
                                                        placeholder="Edit your comment..."
                                                    />
                                                    <div className="flex gap-2">
                                                        <Button 
                                                            size="sm" 
                                                            onClick={() => handleEditComment(comment.id)}
                                                        >
                                                            Save
                                                        </Button>
                                                        <Button 
                                                            size="sm" 
                                                            variant="outline"
                                                            onClick={() => {
                                                                setEditingCommentId(null);
                                                                setEditCommentText("");
                                                            }}
                                                        >
                                                            Cancel
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="text-gray-700">{comment.text}</div>
                                            )}
                                        </div>
                                        {canEditComment(comment) && (
                                            <div className="flex gap-1 ml-4">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => {
                                                        setEditingCommentId(comment.id);
                                                        setEditCommentText(comment.text);
                                                    }}
                                                >
                                                    <Edit className="w-3 h-3" />
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleDeleteComment(comment.id)}
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Signature Selection/Creation Modal */}
            {showSignatureModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                            <CardTitle>Add E-Signature</CardTitle>
                            <Button variant="ghost" size="sm" onClick={() => {
                                setShowSignatureModal(false);
                                setActiveSignatureTab("draw");
                            }}>
                                <X className="w-4 h-4" />
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Show saved signature if available */}
                            {activeSignature && (() => {
                                // Helper function to get the correct image URL for saved signatures
                                // Use the same logic as profile page - convert /uploads/ to /api/uploads/
                                const getSavedSignatureImageUrl = (content) => {
                                    if (!content) return null;
                                    // If it's a base64 data URL, return as is
                                    if (content.startsWith('data:image/')) {
                                        return content;
                                    }
                                    // Use same logic as profile page
                                    if (content.startsWith('/api/')) {
                                        return content; // Already correct
                                    }
                                    if (content.startsWith('/uploads/')) {
                                        return content.replace('/uploads/', '/api/uploads/');
                                    }
                                    // If it starts with http/https, extract path and convert to /api/uploads/
                                    if (content.startsWith('http://') || content.startsWith('https://')) {
                                        try {
                                            const url = new URL(content);
                                            const path = url.pathname;
                                            if (path.startsWith('/api/uploads/')) {
                                                return path; // Already correct
                                            }
                                            if (path.startsWith('/uploads/')) {
                                                return path.replace('/uploads/', '/api/uploads/');
                                            }
                                            // Try to construct API path
                                            return `/api/uploads${path.startsWith('/') ? '' : '/'}${path}`;
                                        } catch (e) {
                                            console.error('Error parsing saved signature URL:', e);
                                            return content;
                                        }
                                    }
                                    // Otherwise, assume it's a relative path and prepend /api/uploads/
                                    return `/api/uploads${content.startsWith('/') ? '' : '/'}${content}`;
                                };
                                
                                const signatureImageUrl = activeSignature.signature_type !== 'typed' 
                                    ? getSavedSignatureImageUrl(activeSignature.file_url || activeSignature.signature_data)
                                    : null;
                                
                                return (
                                <div className="border rounded-lg p-4 bg-gray-50">
                                    <Label className="text-sm font-medium mb-2 block">Your Saved Signature</Label>
                                    <div className="flex items-center gap-4">
                                        <div className="border rounded bg-white p-2 flex items-center justify-center" style={{ minWidth: '200px', minHeight: '80px' }}>
                                            {activeSignature.signature_type === 'typed' ? (
                                                <span 
                                                    className="text-2xl font-bold"
                                                    style={{ 
                                                        fontFamily: activeSignature.signature_font || signatureFont,
                                                        color: activeSignature.signature_color || signatureColor
                                                    }}
                                                >
                                                    {activeSignature.signature_text || signatureText}
                                                </span>
                                            ) : signatureImageUrl ? (
                                                <img
                                                    src={signatureImageUrl}
                                                    alt="Signature"
                                                    className="max-h-16 max-w-48 object-contain"
                                                    crossOrigin="anonymous"
                                                    onError={async (e) => {
                                                        const img = e.target;
                                                        const originalSrc = img.src;
                                                        
                                                        // Check what error we got
                                                        try {
                                                            const response = await fetch(originalSrc, { method: 'HEAD' });
                                                            console.error(`[Signature Image] Failed to load: ${originalSrc}, Status: ${response.status} ${response.statusText}`);
                                                            console.error(`[Signature Image] Response headers:`, Object.fromEntries(response.headers.entries()));
                                                        } catch (fetchError) {
                                                            console.error(`[Signature Image] Fetch error for ${originalSrc}:`, fetchError);
                                                        }
                                                        
                                                        // If already retried, show error
                                                        if (img.dataset.retryAttempted === 'true') {
                                                            img.style.display = 'none';
                                                            const parent = img.parentElement;
                                                            if (parent && !parent.querySelector('.signature-error')) {
                                                                const errorDiv = document.createElement('div');
                                                                errorDiv.className = 'signature-error text-xs text-gray-400 text-center';
                                                                errorDiv.textContent = 'Image not found';
                                                                parent.appendChild(errorDiv);
                                                            }
                                                            return;
                                                        }
                                                        
                                                        img.dataset.retryAttempted = 'true';
                                                        
                                                        // Try fallback - if it's /api/uploads/, try /uploads/ (in case nginx serves it directly)
                                                        if (originalSrc.includes('/api/uploads/')) {
                                                            const directUrl = originalSrc.replace('/api/uploads/', '/uploads/');
                                                            console.log('[Signature Image] Trying direct path fallback:', directUrl);
                                                            img.src = directUrl;
                                                        } else if (originalSrc.includes('/uploads/') && !originalSrc.includes('/api/')) {
                                                            const apiUrl = originalSrc.replace('/uploads/', '/api/uploads/');
                                                            console.log('[Signature Image] Trying API route fallback:', apiUrl);
                                                            img.src = apiUrl;
                                                        }
                                                    }}
                                                />
                                            ) : (
                                                <span className="text-xs text-gray-400">No image available</span>
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm text-gray-600 mb-2">
                                                Use your saved signature to sign this document. You'll only need to verify your identity.
                                            </p>
                                            <div className="flex gap-2">
                                                <Button 
                                                    onClick={handleUseSavedSignature}
                                                    className="bg-blue-600 hover:bg-blue-700"
                                                >
                                                    Use This Signature
                                                </Button>
                                                <Button 
                                                    variant="outline"
                                                    onClick={() => setActiveSignature(null)}
                                                >
                                                    Create New Signature
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                );
                            })()}
                            
                            {!activeSignature && (
                                <>
                            {/* Signature Type Tabs */}
                            <div className="flex space-x-2 border-b">
                                <Button
                                    variant={activeSignatureTab === "draw" ? "default" : "ghost"}
                                    onClick={() => setActiveSignatureTab("draw")}
                                    className="flex items-center gap-2"
                                >
                                    <Pen className="w-4 h-4" />
                                    Draw Signature
                                </Button>
                                <Button
                                    variant={activeSignatureTab === "type" ? "default" : "ghost"}
                                    onClick={() => setActiveSignatureTab("type")}
                                    className="flex items-center gap-2"
                                >
                                    <User className="w-4 h-4" />
                                    Type Signature
                                </Button>
                                <Button
                                    variant={activeSignatureTab === "scan" ? "default" : "ghost"}
                                    onClick={() => setActiveSignatureTab("scan")}
                                    className="flex items-center gap-2"
                                >
                                    <Shield className="w-4 h-4" />
                                    Upload Scanned
                                </Button>
                            </div>

                            {/* Draw Signature Tab */}
                            {activeSignatureTab === "draw" && (
                                <div className="space-y-4">
                                    <div>
                                        <Label>Signature Color</Label>
                                        <div className="flex gap-2 mt-2">
                                            {['black', 'blue', 'red'].map((color) => (
                                                <Button
                                                    key={color}
                                                    type="button"
                                                    variant={signatureColor === color ? "default" : "outline"}
                                                    onClick={() => {
                                                        setSignatureColor(color);
                                                        if (sigCanvasRef.current) {
                                                            sigCanvasRef.current.penColor = color;
                                                        }
                                                    }}
                                                    className="capitalize"
                                                    style={signatureColor === color ? {
                                                        backgroundColor: color === 'black' ? '#000' : color === 'blue' ? '#2563eb' : '#dc2626',
                                                        color: 'white'
                                                    } : {}}
                                                >
                                                    {color}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                                        <Label>Draw Your Signature</Label>
                                        <SignatureCanvas
                                            ref={sigCanvasRef}
                                            penColor={signatureColor}
                                            canvasProps={{
                                                width: 400,
                                                height: 150,
                                                className: "border rounded mx-auto mt-2"
                                            }}
                                        />
                                        <div className="flex gap-2 justify-center mt-2">
                                            <Button 
                                                variant="outline" 
                                                size="sm"
                                                onClick={() => sigCanvasRef.current?.clear()}
                                            >
                                                Clear
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="flex justify-end">
                                        <Button 
                                            onClick={handleDrawnSignature} 
                                            className="bg-blue-600 hover:bg-blue-700"
                                        >
                                            Save Drawn Signature
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* Type Signature Tab */}
                            {activeSignatureTab === "type" && (
                                <div className="space-y-4">
                                    <div>
                                        <Label htmlFor="signatureText">Signature Text</Label>
                                        <Input
                                            id="signatureText"
                                            value={signatureText}
                                            onChange={(e) => setSignatureText(e.target.value)}
                                            placeholder="Enter your signature text"
                                            className="mt-1"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="signatureFont">Signature Font</Label>
                                        <select
                                            id="signatureFont"
                                            value={signatureFont}
                                            onChange={(e) => setSignatureFont(e.target.value)}
                                            className="w-full p-2 border rounded-md mt-1"
                                        >
                                            {signatureFonts.map((font) => (
                                                <option key={font.value} value={font.value}>
                                                    {font.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <Label>Signature Color</Label>
                                        <div className="flex gap-2 mt-2">
                                            {['black', 'blue', 'red'].map((color) => (
                                                <Button
                                                    key={color}
                                                    type="button"
                                                    variant={signatureColor === color ? "default" : "outline"}
                                                    onClick={() => setSignatureColor(color)}
                                                    className="capitalize"
                                                    style={signatureColor === color ? {
                                                        backgroundColor: color === 'black' ? '#000' : color === 'blue' ? '#2563eb' : '#dc2626',
                                                        color: 'white'
                                                    } : {}}
                                                >
                                                    {color}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>
                                    {signatureText && (
                                        <div className="text-center p-4 border rounded-lg">
                                            <Label>Preview:</Label>
                                            <div
                                                className="text-3xl font-bold mt-2"
                                                style={{ 
                                                    fontFamily: signatureFont,
                                                    color: signatureColor === 'black' ? '#000' : signatureColor === 'blue' ? '#2563eb' : '#dc2626'
                                                }}
                                            >
                                                {signatureText}
                                            </div>
                                        </div>
                                    )}
                                    <div className="flex justify-end">
                                        <Button onClick={handleTypedSignature} disabled={!signatureText.trim()}>
                                            Save Typed Signature
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* Upload Scanned Signature Tab */}
                            {activeSignatureTab === "scan" && (
                                <div className="space-y-4">
                                    <div>
                                        <Label htmlFor="scannedSignature">Upload Scanned Signature</Label>
                                        <Input
                                            id="scannedSignature"
                                            type="file"
                                            accept="image/*"
                                            onChange={handleFileUpload}
                                            className="mt-1"
                                        />
                                    </div>
                                    {scannedSignatureFile && (
                                        <div className="text-center">
                                            <Label>Preview:</Label>
                                            <img
                                                src={scannedSignatureFile}
                                                alt="Scanned signature"
                                                className="mx-auto mt-2 border rounded max-w-xs"
                                            />
                                        </div>
                                    )}
                                    <div className="flex justify-end">
                                        <Button onClick={handleScannedSignature} disabled={!scannedSignatureFile}>
                                            Save Scanned Signature
                                        </Button>
                                    </div>
                                </div>
                            )}
                                </>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Comment Creation Modal */}
            {showCommentModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <Card className="w-full max-w-md">
                        <CardHeader>
                            <CardTitle>Add Comment</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <Label htmlFor="commentText">Comment</Label>
                                <Input
                                    id="commentText"
                                    value={commentText}
                                    onChange={(e) => setCommentText(e.target.value)}
                                    placeholder="Enter your comment..."
                                    className="mt-1"
                                />
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setShowCommentModal(false)}>
                                    Cancel
                                </Button>
                                <Button onClick={handleAddComment}>
                                    Add Comment
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Authentication Modal */}
            {showAuthModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
                    <Card className="w-full max-w-md">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Shield className="w-5 h-5" />
                                Verify Your Identity
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-4">
                                <div>
                                    <Label>WhatsApp OTP Verification</Label>
                                    <p className="text-sm text-muted-foreground mt-1 mb-4">
                                        OTP will be sent to your registered WhatsApp number.
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <Label htmlFor="otpCode">OTP Code</Label>
                                        {!otpSent && (
                                            <Button 
                                                variant="outline" 
                                                size="sm" 
                                                onClick={sendOTP}
                                                disabled={loading || countdown > 0}
                                            >
                                                {countdown > 0 ? `Resend in ${countdown}s` : "Send OTP"}
                                            </Button>
                                        )}
                                    </div>
                                    <Input
                                        id="otpCode"
                                        value={otpCode}
                                        onChange={(e) => setOtpCode(e.target.value)}
                                        placeholder="Enter 6-digit OTP"
                                        maxLength={6}
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-4">
                                <Button variant="outline" onClick={() => setShowAuthModal(false)}>
                                    Cancel
                                </Button>
                                <Button 
                                    onClick={verifyAuthentication}
                                    disabled={loading || !otpCode}
                                >
                                    {loading ? "Verifying..." : "Verify"}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Signature Manager Modal */}
            {showSignatureManager && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                            <CardTitle>Manage Your Signatures</CardTitle>
                            <Button variant="ghost" size="sm" onClick={() => setShowSignatureManager(false)}>
                                <X className="w-4 h-4" />
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="text-sm text-gray-600 mb-4">
                                You can have up to 3 signatures (one for each type). Only one signature can be active at a time.
                            </div>
                            
                            {userSignatures.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">
                                    No signatures created yet. Create your first signature using &quot;Add E-Signature&quot; button.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {userSignatures.map((sig) => (
                                        <div key={sig.id} className="border rounded-lg p-4">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex flex-col">
                                                        <div className="font-medium capitalize">
                                                            {sig.signature_type} Signature
                                                        </div>
                                                        <div className="text-sm text-gray-500">
                                                            Created: {new Date(sig.created_at).toLocaleDateString()}
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            {sig.is_active ? (
                                                                <div className="flex items-center gap-1 text-green-600">
                                                                    <CheckCircle className="w-4 h-4" />
                                                                    <span className="text-sm font-medium">Active</span>
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center gap-1 text-gray-500">
                                                                    <AlertCircle className="w-4 h-4" />
                                                                    <span className="text-sm">Inactive</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    {sig.is_active ? (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => manageSignature('deactivate', sig.id)}
                                                        >
                                                            <EyeOff className="w-4 h-4 mr-1" />
                                                            Deactivate
                                                        </Button>
                                                    ) : (
                                                        <Button
                                                            size="sm"
                                                            onClick={() => manageSignature('activate', sig.id)}
                                                        >
                                                            <Eye className="w-4 h-4 mr-1" />
                                                            Activate
                                                        </Button>
                                                    )}
                                                    <Button
                                                        size="sm"
                                                        variant="destructive"
                                                        onClick={() => manageSignature('delete', sig.id)}
                                                    >
                                                        <Trash2 className="w-4 h-4 mr-1" />
                                                        Delete
                                                    </Button>
                                                </div>
                                            </div>
                                            {sig.file_url && (
                                                <div className="mt-3 p-2 bg-gray-50 rounded border">
                                                    <img 
                                                        src={sig.file_url} 
                                                        alt={`${sig.signature_type} signature`}
                                                        className="max-h-16 max-w-32 object-contain"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

        </div>
    );
}

