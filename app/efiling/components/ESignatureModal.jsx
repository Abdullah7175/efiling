"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useSession } from "next-auth/react";
import { X, Pen, Type, Upload, Shield, Smartphone, Key } from "lucide-react";
import SignatureCanvas from "react-signature-canvas";

export default function ESignatureModal({ 
    isOpen, 
    onClose, 
    fileId, 
    onSignatureComplete 
}) {
    const { data: session } = useSession();
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState("draw");
    const [otpCode, setOtpCode] = useState("");
    const [signatureText, setSignatureText] = useState("");
    const [selectedFont, setSelectedFont] = useState("Dancing Script");
    const [signatureImage, setSignatureImage] = useState(null);
    const [scannedDocument, setScannedDocument] = useState(null);
    const [loading, setLoading] = useState(false);
    const [otpSent, setOtpSent] = useState(false);
    const [countdown, setCountdown] = useState(0);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [pendingAction, setPendingAction] = useState(null);
    
    const sigCanvasRef = useRef(null);
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

    // Countdown timer for OTP
    useEffect(() => {
        let timer;
        if (countdown > 0) {
            timer = setTimeout(() => setCountdown(countdown - 1), 1000);
        }
        return () => clearTimeout(timer);
    }, [countdown]);

    // Load Google Fonts
    useEffect(() => {
        if (selectedFont) {
            const link = document.createElement('link');
            link.href = `https://fonts.googleapis.com/css2?family=${selectedFont.replace(' ', '+')}:wght@400;700&display=swap`;
            link.rel = 'stylesheet';
            document.head.appendChild(link);
        }
    }, [selectedFont]);

    // Clear signature canvas
    const clearSignature = () => {
        if (sigCanvasRef.current) {
            sigCanvasRef.current.clear();
        }
    };

    // Save drawn signature
    const saveDrawnSignature = () => {
        if (sigCanvasRef.current && !sigCanvasRef.current.isEmpty()) {
            const dataURL = sigCanvasRef.current.getTrimmedCanvas().toDataURL("image/png");
            setSignatureImage(dataURL);
            toast({
                title: "Signature Saved",
                description: "Your drawn signature has been saved successfully.",
            });
        } else {
            toast({
                title: "No Signature",
                description: "Please draw a signature first.",
                variant: "destructive",
            });
        }
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

    // Send OTP
    const sendOTP = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/efiling/send-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
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
                throw new Error('Failed to send OTP');
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to send OTP. Please try again.",
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
                
                // Execute the pending action
                if (pendingAction === 'saveSignature') {
                    await saveSignatureToDatabase();
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


    // Save signature to database
    const saveSignatureToDatabase = async () => {
        try {
            setLoading(true);
            
            let signatureData = {
                name: signatureText || "Drawn Signature",
                type: activeTab,
                file_id: fileId
            };

            if (activeTab === 'draw' && signatureImage) {
                signatureData.image_data = signatureImage;
            } else if (activeTab === 'type' && signatureText) {
                signatureData.text = signatureText;
                signatureData.font = selectedFont;
            } else if (activeTab === 'scan' && signatureImage) {
                signatureData.image_data = signatureImage;
            }

            const response = await fetch('/api/efiling/signatures/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(signatureData)
            });

            if (response.ok) {
                toast({
                    title: "Signature Saved",
                    description: "Your signature has been saved successfully.",
                });
                
                if (onSignatureComplete) {
                    onSignatureComplete(signatureData);
                }
                
                onClose();
            } else {
                throw new Error('Failed to save signature');
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to save signature. Please try again.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    // Handle signature save with authentication
    const handleSaveSignature = () => {
        if (!signatureImage && activeTab !== 'type') {
            toast({
                title: "No Signature",
                description: "Please create a signature first.",
                variant: "destructive",
            });
            return;
        }

        if (activeTab === 'type' && !signatureText.trim()) {
            toast({
                title: "No Signature Text",
                description: "Please enter signature text.",
                variant: "destructive",
            });
            return;
        }

        // Show authentication modal
        setPendingAction('saveSignature');
        setShowAuthModal(true);
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Main E-Signature Modal */}
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                        <CardTitle className="flex items-center gap-2">
                            <Shield className="w-5 h-5" />
                            Create E-Signature
                        </CardTitle>
                        <Button variant="ghost" size="sm" onClick={onClose}>
                            <X className="w-4 h-4" />
                        </Button>
                    </CardHeader>
                    
                    <CardContent className="space-y-6">
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                            <TabsList className="grid w-full grid-cols-3">
                                <TabsTrigger value="draw" className="flex items-center gap-2">
                                    <Pen className="w-4 h-4" />
                                    Draw Signature
                                </TabsTrigger>
                                <TabsTrigger value="type" className="flex items-center gap-2">
                                    <Type className="w-4 h-4" />
                                    Type Signature
                                </TabsTrigger>
                                <TabsTrigger value="scan" className="flex items-center gap-2">
                                    <Upload className="w-4 h-4" />
                                    Upload Signature
                                </TabsTrigger>
                            </TabsList>

                            {/* Draw Signature Tab */}
                            <TabsContent value="draw" className="space-y-4">
                                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                                    <SignatureCanvas
                                        ref={sigCanvasRef}
                                        penColor="black"
                                        canvasProps={{
                                            width: 500,
                                            height: 200,
                                            className: "border rounded mx-auto"
                                        }}
                                    />
                                </div>
                                <div className="flex gap-2 justify-center">
                                    <Button variant="outline" onClick={clearSignature}>
                                        Clear
                                    </Button>
                                    <Button onClick={saveDrawnSignature}>
                                        Save Signature
                                    </Button>
                                </div>
                                {signatureImage && (
                                    <div className="text-center">
                                        <Label>Preview:</Label>
                                        <img
                                            src={signatureImage}
                                            alt="Drawn signature"
                                            className="mx-auto mt-2 border rounded max-w-xs"
                                        />
                                    </div>
                                )}
                            </TabsContent>

                            {/* Type Signature Tab */}
                            <TabsContent value="type" className="space-y-4">
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
                                        <Select value={selectedFont} onValueChange={setSelectedFont}>
                                            <SelectTrigger className="mt-1">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {signatureFonts.map((font) => (
                                                    <SelectItem key={font.value} value={font.value}>
                                                        {font.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {signatureText && (
                                        <div className="text-center p-4 border rounded-lg">
                                            <Label>Preview:</Label>
                                            <div 
                                                className="text-4xl font-bold mt-2"
                                                style={{ fontFamily: selectedFont }}
                                            >
                                                {signatureText}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </TabsContent>

                            {/* Upload Signature Tab */}
                            <TabsContent value="scan" className="space-y-4">
                                <div className="space-y-4">
                                    <div>
                                        <Label htmlFor="signatureFile">Upload Signature Image</Label>
                                        <Input
                                            id="signatureFile"
                                            type="file"
                                            accept="image/*"
                                            onChange={handleFileUpload}
                                            ref={fileInputRef}
                                            className="mt-1"
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
                            </TabsContent>
                        </Tabs>

                        {/* Action Buttons */}
                        <div className="flex justify-end gap-2 pt-4 border-t">
                            <Button variant="outline" onClick={onClose}>
                                Cancel
                            </Button>
                            <Button 
                                onClick={handleSaveSignature}
                                disabled={loading || (!signatureImage && activeTab !== 'type') || (activeTab === 'type' && !signatureText.trim())}
                            >
                                {loading ? "Saving..." : "Save Signature"}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

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

        </>
    );
}
