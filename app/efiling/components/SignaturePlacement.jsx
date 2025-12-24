"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Pen, Type, Upload, X, Move } from "lucide-react";

export default function SignaturePlacement({ 
    onSignaturePlaced, 
    existingSignatures = [],
    onRemoveSignature 
}) {
    const { toast } = useToast();
    const [signatures, setSignatures] = useState(existingSignatures);
    const [draggedSignature, setDraggedSignature] = useState(null);
    const [showPlacementModal, setShowPlacementModal] = useState(false);
    const [selectedSignature, setSelectedSignature] = useState(null);
    const [signaturePosition, setSignaturePosition] = useState({ x: 0, y: 0 });
    const [signatureText, setSignatureText] = useState("");
    const [signatureFont, setSignatureFont] = useState("Dancing Script");
    const [signatureImage, setSignatureImage] = useState(null);
    const [activeTab, setActiveTab] = useState("draw");
    
    const canvasRef = useRef(null);
    const fileInputRef = useRef(null);

    // Signature fonts
    const signatureFonts = [
        { value: "Dancing Script", label: "Dancing Script" },
        { value: "Great Vibes", label: "Great Vibes" },
        { value: "Pacifico", label: "Pacifico" },
        { value: "Satisfy", label: "Satisfy" },
        { value: "Kaushan Script", label: "Kaushan Script" },
        { value: "Allura", label: "Allura" },
        { value: "Alex Brush", label: "Alex Brush" },
        { value: "Tangerine", label: "Tangerine" }
    ];

    // Handle mouse move for signature placement
    const handleMouseMove = (e) => {
        if (draggedSignature) {
            const rect = e.currentTarget.getBoundingClientRect();
            setSignaturePosition({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            });
        }
    };

    // Handle mouse click to place signature
    const handleClick = (e) => {
        if (selectedSignature) {
            const rect = e.currentTarget.getBoundingClientRect();
            const position = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };

            const newSignature = {
                id: Date.now(),
                type: selectedSignature.type,
                content: selectedSignature.content,
                position,
                font: selectedSignature.font || signatureFont,
                timestamp: new Date().toISOString()
            };

            setSignatures(prev => [...prev, newSignature]);
            onSignaturePlaced && onSignaturePlaced(newSignature);
            
            toast({
                title: "Signature Placed",
                description: "Signature has been placed in the document.",
            });

            setSelectedSignature(null);
            setShowPlacementModal(false);
        }
    };

    // Remove signature
    const removeSignature = (signatureId) => {
        setSignatures(prev => prev.filter(sig => sig.id !== signatureId));
        onRemoveSignature && onRemoveSignature(signatureId);
        
        toast({
            title: "Signature Removed",
            description: "Signature has been removed from the document.",
        });
    };

    // Start dragging signature
    const startDragging = (signature) => {
        setDraggedSignature(signature);
    };

    // Stop dragging
    const stopDragging = () => {
        setDraggedSignature(null);
    };

    // Create typed signature
    const createTypedSignature = () => {
        if (!signatureText.trim()) {
            toast({
                title: "No Text",
                description: "Please enter signature text.",
                variant: "destructive",
            });
            return;
        }

        setSelectedSignature({
            type: 'text',
            content: signatureText,
            font: signatureFont
        });
        setShowPlacementModal(false);
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
                    setSignatureImage(e.target.result);
                    setSelectedSignature({
                        type: 'image',
                        content: e.target.result
                    });
                    setShowPlacementModal(false);
                    
                    toast({
                        title: "Image Uploaded",
                        description: "Scanned signature image uploaded successfully.",
                    });
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

    return (
        <div className="space-y-4">
            {/* Signature Creation Modal */}
            {showPlacementModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                            <CardTitle>Create Signature for Placement</CardTitle>
                            <Button variant="ghost" size="sm" onClick={() => setShowPlacementModal(false)}>
                                <X className="w-4 h-4" />
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex space-x-2">
                                <Button
                                    variant={activeTab === "type" ? "default" : "outline"}
                                    onClick={() => setActiveTab("type")}
                                    className="flex items-center gap-2"
                                >
                                    <Type className="w-4 h-4" />
                                    Type
                                </Button>
                                <Button
                                    variant={activeTab === "scan" ? "default" : "outline"}
                                    onClick={() => setActiveTab("scan")}
                                    className="flex items-center gap-2"
                                >
                                    <Upload className="w-4 h-4" />
                                    Upload
                                </Button>
                            </div>

                            {activeTab === "type" && (
                                <div className="space-y-4">
                                    <div>
                                        <Label htmlFor="signatureText">Signature Text</Label>
                                        <Input
                                            id="signatureText"
                                            value={signatureText}
                                            onChange={(e) => setSignatureText(e.target.value)}
                                            placeholder="Enter your signature text"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="signatureFont">Signature Font</Label>
                                        <select
                                            id="signatureFont"
                                            value={signatureFont}
                                            onChange={(e) => setSignatureFont(e.target.value)}
                                            className="w-full p-2 border rounded-md"
                                        >
                                            {signatureFonts.map((font) => (
                                                <option key={font.value} value={font.value}>
                                                    {font.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    {signatureText && (
                                        <div className="text-center p-4 border rounded-lg">
                                            <Label>Preview:</Label>
                                            <div 
                                                className="text-3xl font-bold mt-2"
                                                style={{ fontFamily: signatureFont }}
                                            >
                                                {signatureText}
                                            </div>
                                        </div>
                                    )}
                                    <Button onClick={createTypedSignature} className="w-full">
                                        Use This Signature
                                    </Button>
                                </div>
                            )}

                            {activeTab === "scan" && (
                                <div className="space-y-4">
                                    <div>
                                        <Label htmlFor="signatureFile">Upload Signature Image</Label>
                                        <Input
                                            id="signatureFile"
                                            type="file"
                                            accept="image/*"
                                            onChange={handleFileUpload}
                                            ref={fileInputRef}
                                        />
                                    </div>
                                    {signatureImage && (
                                        <div className="text-center">
                                            <Label>Preview:</Label>
                                            <img
                                                src={signatureImage}
                                                alt="Uploaded signature"
                                                className="mx-auto mt-2 border rounded max-w-xs"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Signature Placement Controls */}
            <div className="flex items-center gap-2">
                <Button
                    onClick={() => setShowPlacementModal(true)}
                    className="flex items-center gap-2"
                >
                    <Pen className="w-4 h-4" />
                    Add Signature
                </Button>
                <div className="text-sm text-gray-600">
                    Click &quot;Add Signature&quot; then click anywhere in the document to place it
                </div>
            </div>

            {/* Document Area for Signature Placement */}
            <div 
                className="relative border-2 border-dashed border-gray-300 rounded-lg p-8 min-h-[400px] bg-white cursor-crosshair"
                onMouseMove={handleMouseMove}
                onClick={handleClick}
            >
                <div className="text-center text-gray-500 mb-4">
                    Click anywhere in this area to place your signature
                </div>

                {/* Placeholder content */}
                <div className="space-y-4 text-gray-400">
                    <h2 className="text-xl font-bold">Document Title</h2>
                    <p>This is a sample document area where you can place signatures.</p>
                    <p>Click the &quot;Add Signature&quot; button above, then click anywhere here to place it.</p>
                </div>

                {/* Placed Signatures */}
                {signatures.map((signature) => (
                    <div
                        key={signature.id}
                        className="absolute cursor-move"
                        style={{
                            left: signature.position.x,
                            top: signature.position.y,
                            transform: 'translate(-50%, -50%)'
                        }}
                        draggable
                        onDragStart={() => startDragging(signature)}
                        onDragEnd={stopDragging}
                    >
                        <div className="relative group">
                            {signature.type === 'text' ? (
                                <div 
                                    className="text-lg font-bold text-blue-600 cursor-move select-none"
                                    style={{ fontFamily: signature.font }}
                                >
                                    {signature.content}
                                </div>
                            ) : (
                                <img
                                    src={signature.content}
                                    alt="Signature"
                                    className="h-12 w-auto cursor-move select-none"
                                />
                            )}
                            
                            {/* Remove button */}
                            <Button
                                variant="destructive"
                                size="sm"
                                className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => removeSignature(signature.id)}
                            >
                                <X className="w-3 h-3" />
                            </Button>
                            
                            {/* Move indicator */}
                            <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Move className="w-4 h-4 text-gray-400" />
                            </div>
                        </div>
                    </div>
                ))}

                {/* Drag preview */}
                {draggedSignature && (
                    <div
                        className="absolute pointer-events-none opacity-50"
                        style={{
                            left: signaturePosition.x,
                            top: signaturePosition.y,
                            transform: 'translate(-50%, -50%)'
                        }}
                    >
                        {draggedSignature.type === 'text' ? (
                            <div 
                                className="text-lg font-bold text-blue-600"
                                style={{ fontFamily: draggedSignature.font }}
                            >
                                {draggedSignature.content}
                            </div>
                        ) : (
                            <img
                                src={draggedSignature.content}
                                alt="Signature"
                                className="h-12 w-auto"
                            />
                        )}
                    </div>
                )}
            </div>

            {/* Signature List */}
            {signatures.length > 0 && (
                <div className="space-y-2">
                    <Label>Placed Signatures:</Label>
                    <div className="space-y-2">
                        {signatures.map((signature) => (
                            <div
                                key={signature.id}
                                className="flex items-center justify-between p-2 bg-gray-50 rounded border"
                            >
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-gray-600">
                                        {signature.type === 'text' ? 'Text' : 'Image'} Signature
                                    </span>
                                    <span className="text-xs text-gray-400">
                                        at ({Math.round(signature.position.x)}, {Math.round(signature.position.y)})
                                    </span>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => removeSignature(signature.id)}
                                >
                                    Remove
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
