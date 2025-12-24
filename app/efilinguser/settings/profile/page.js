"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { UserCheck, Save, ArrowLeft, Eye, EyeOff, Lock, Pen, Shield, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEfilingUser } from "@/context/EfilingUserContext";
import SignatureCanvas from "react-signature-canvas";
import { useRef } from "react";

export default function ProfileSettings() {
    const { data: session } = useSession();
    const router = useRouter();
    const { toast } = useToast();
    const { efilingUserId } = useEfilingUser();
    const [loading, setLoading] = useState(false);
    const [profile, setProfile] = useState({
        name: '',
        email: '',
        employee_id: '',
        designation: '',
        department: '',
        phone: '',
        address: ''
    });
    const [passwordData, setPasswordData] = useState({
        current_password: '',
        new_password: '',
        confirm_password: ''
    });
    const [showPasswords, setShowPasswords] = useState({
        current: false,
        new: false,
        confirm: false
    });
    
    // E-Signature management states
    const [userSignature, setUserSignature] = useState(null);
    const [showSignatureModal, setShowSignatureModal] = useState(false);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [otpCode, setOtpCode] = useState("");
    const [otpSent, setOtpSent] = useState(false);
    const [countdown, setCountdown] = useState(0);
    const [authLoading, setAuthLoading] = useState(false);
    
    // Google email registration states
    const [showEmailRegistration, setShowEmailRegistration] = useState(false);
    const [registrationEmail, setRegistrationEmail] = useState("");
    const [googleAuthCode, setGoogleAuthCode] = useState("");
    
    // Signature creation states
    const [signatureText, setSignatureText] = useState("");
    const [signatureFont, setSignatureFont] = useState("Arial");
    const [signatureColor, setSignatureColor] = useState("black");
    const [scannedSignatureFile, setScannedSignatureFile] = useState(null);
    const [activeSignatureTab, setActiveSignatureTab] = useState("draw");
    
    const sigCanvasRef = useRef(null);
    const [canvasReady, setCanvasReady] = useState(false);
    
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

    useEffect(() => {
        if (!session?.user?.id) return;
        fetchProfile();
        if (efilingUserId) {
            fetchUserSignature();
        }
    }, [session?.user?.id, efilingUserId]);
    
    // Countdown timer for OTP
    useEffect(() => {
        let timer;
        if (countdown > 0) {
            timer = setTimeout(() => setCountdown(countdown - 1), 1000);
        }
        return () => clearTimeout(timer);
    }, [countdown]);

    // Initialize canvas when signature modal opens and draw tab is active
    useEffect(() => {
        if (showSignatureModal && activeSignatureTab === "draw") {
            // Small delay to ensure modal is fully rendered
            const timer = setTimeout(() => {
                setCanvasReady(true);
                if (sigCanvasRef.current && signatureColor) {
                    sigCanvasRef.current.penColor = signatureColor;
                }
            }, 100);
            return () => {
                clearTimeout(timer);
                setCanvasReady(false);
            };
        } else {
            setCanvasReady(false);
        }
    }, [showSignatureModal, activeSignatureTab, signatureColor]);

    const fetchProfile = async () => {
        try {
            const response = await fetch(`/api/efiling/users/profile?userId=${session.user.id}`);
            if (response.ok) {
                const data = await response.json();
                setProfile({
                    name: data.name || '',
                    email: data.email || '',
                    employee_id: data.employee_id || '',
                    designation: data.designation || '',
                    department: data.department_name || '',
                    phone: data.contact_number || '',
                    address: data.address || ''
                });
            }
        } catch (error) {
            console.error('Error fetching profile:', error);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!efilingUserId) {
            toast({
                title: "Error",
                description: "E-filing user ID not found. Please refresh the page.",
                variant: "destructive",
            });
            return;
        }
        
        setLoading(true);

        try {
            const response = await fetch(`/api/efiling/users/${efilingUserId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: profile.name,
                    email: profile.email,
                    contact_number: profile.phone,
                    address: profile.address
                }),
            });

            if (response.ok) {
                toast({
                    title: "Success",
                    description: "Profile updated successfully",
                });
            } else {
                const error = await response.json();
                toast({
                    title: "Error",
                    description: error.error || "Failed to update profile",
                    variant: "destructive",
                });
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to update profile",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordUpdate = async (e) => {
        e.preventDefault();
        
        if (passwordData.new_password !== passwordData.confirm_password) {
            toast({
                title: "Error",
                description: "New passwords do not match",
                variant: "destructive",
            });
            return;
        }

        if (passwordData.new_password.length < 6) {
            toast({
                title: "Error",
                description: "New password must be at least 6 characters long",
                variant: "destructive",
            });
            return;
        }

        setLoading(true);

        try {
            const response = await fetch('/api/efiling/users/update-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    current_password: passwordData.current_password,
                    new_password: passwordData.new_password
                }),
            });

            if (response.ok) {
                toast({
                    title: "Success",
                    description: "Password updated successfully",
                });
                setPasswordData({
                    current_password: '',
                    new_password: '',
                    confirm_password: ''
                });
            } else {
                const error = await response.json();
                toast({
                    title: "Error",
                    description: error.error || "Failed to update password",
                    variant: "destructive",
                });
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to update password",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (field, value) => {
        setProfile(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handlePasswordChange = (field, value) => {
        setPasswordData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const togglePasswordVisibility = (field) => {
        setShowPasswords(prev => ({
            ...prev,
            [field]: !prev[field]
        }));
    };
    
    const fetchUserSignature = async () => {
        if (!efilingUserId) return;
        try {
            const response = await fetch(`/api/efiling/signatures/manage?userId=${efilingUserId}`);
            if (response.ok) {
                const data = await response.json();
                const active = data.signatures?.find(sig => sig.is_active);
                setUserSignature(active || null);
            }
        } catch (error) {
            console.error('Error fetching user signature:', error);
        }
    };
    
    const sendOTP = async () => {
        try {
            setAuthLoading(true);
            
            // Check if user has phone number
            if (!profile.phone) {
                toast({
                    title: "Phone Number Required",
                    description: "Please add your contact number in your profile first.",
                    variant: "destructive",
                });
                return;
            }

            const response = await fetch('/api/efiling/send-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    userId: session?.user?.id || efilingUserId
                })
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
            setAuthLoading(false);
        }
    };
    
    const verifyAuthentication = async () => {
        try {
            setAuthLoading(true);
            
            // Use WhatsApp OTP verification
            const response = await fetch('/api/efiling/verify-auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: session?.user?.id || efilingUserId,
                    code: otpCode
                })
            });

            if (response.ok) {
                setShowAuthModal(false);
                setOtpCode("");
                setShowSignatureModal(true);
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
            setAuthLoading(false);
        }
    };
    
    const registerGoogleEmail = async () => {
        try {
            setAuthLoading(true);
            
            const response = await fetch('/api/efiling/google-auth', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: registrationEmail,
                    userId: session?.user?.id
                })
            });

            if (response.ok) {
                setShowEmailRegistration(false);
                setRegistrationEmail("");
                
                toast({
                    title: "Email Registered",
                    description: "Your Google email has been registered successfully.",
                });
                
                setGoogleAuthCode(registrationEmail);
                await verifyAuthentication();
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to register email');
            }
        } catch (error) {
            toast({
                title: "Registration Failed",
                description: error.message || "Failed to register Google email. Please try again.",
                variant: "destructive",
            });
        } finally {
            setAuthLoading(false);
        }
    };
    
    const handleChangeSignature = () => {
        setShowAuthModal(true);
    };
    
    const handleDrawnSignature = async () => {
        if (!sigCanvasRef.current || !efilingUserId) return;
        
        try {
            const canvas = sigCanvasRef.current.getCanvas();
            const ctx = canvas.getContext('2d');
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const hasContent = imageData.data.some(channel => channel !== 0);

            if (!hasContent) {
                toast({
                    title: "No Signature",
                    description: "Please draw a signature first.",
                    variant: "destructive",
                });
                return;
            }

            // Apply color filter
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.putImageData(imageData, 0, 0);
            
            const colorMap = {
                'black': { r: 0, g: 0, b: 0 },
                'blue': { r: 0, g: 0, b: 255 },
                'red': { r: 255, g: 0, b: 0 }
            };
            const targetColor = colorMap[signatureColor] || colorMap['black'];
            
            const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            const data = imgData.data;
            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] > 0) {
                    data[i] = targetColor.r;
                    data[i + 1] = targetColor.g;
                    data[i + 2] = targetColor.b;
                }
            }
            tempCtx.putImageData(imgData, 0, 0);
            
            const dataURL = tempCanvas.toDataURL("image/png");
            
            const uploadResponse = await fetch('/api/efiling/signatures/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    signatureData: dataURL,
                    userId: efilingUserId,
                    userName: session?.user?.name,
                    signatureType: 'drawn',
                    signatureColor: signatureColor
                }),
            });

            if (uploadResponse.ok) {
                await fetchUserSignature();
                setShowSignatureModal(false);
                toast({
                    title: "Signature Updated",
                    description: "Your signature has been updated successfully.",
                });
            } else {
                throw new Error('Failed to upload signature');
            }
        } catch (error) {
            console.error('Error updating signature:', error);
            toast({
                title: "Error",
                description: "Failed to update signature. Please try again.",
                variant: "destructive",
            });
        }
    };
    
    const handleTypedSignature = async () => {
        if (!signatureText.trim() || !efilingUserId) return;
        
        try {
            const uploadResponse = await fetch('/api/efiling/signatures/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    signatureText: signatureText,
                    signatureFont: signatureFont,
                    signatureColor: signatureColor,
                    userId: efilingUserId,
                    userName: session?.user?.name,
                    signatureType: 'typed'
                }),
            });

            if (uploadResponse.ok) {
                await fetchUserSignature();
                setShowSignatureModal(false);
                toast({
                    title: "Signature Updated",
                    description: "Your signature has been updated successfully.",
                });
            } else {
                throw new Error('Failed to upload signature');
            }
        } catch (error) {
            console.error('Error updating signature:', error);
            toast({
                title: "Error",
                description: "Failed to update signature. Please try again.",
                variant: "destructive",
            });
        }
    };
    
    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                setScannedSignatureFile(e.target.result);
            };
            reader.readAsDataURL(file);
        } else {
            toast({
                title: "Invalid File",
                description: "Please upload an image file.",
                variant: "destructive",
            });
        }
    };
    
    const handleScannedSignature = async () => {
        if (!scannedSignatureFile || !efilingUserId) return;
        
        try {
            const uploadResponse = await fetch('/api/efiling/signatures/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    signatureData: scannedSignatureFile,
                    userId: efilingUserId,
                    userName: session?.user?.name,
                    signatureType: 'scanned',
                    signatureColor: signatureColor
                }),
            });

            if (uploadResponse.ok) {
                await fetchUserSignature();
                setShowSignatureModal(false);
                toast({
                    title: "Signature Updated",
                    description: "Your signature has been updated successfully.",
                });
            } else {
                throw new Error('Failed to upload signature');
            }
        } catch (error) {
            console.error('Error updating signature:', error);
            toast({
                title: "Error",
                description: "Failed to update signature. Please try again.",
                variant: "destructive",
            });
        }
    };

    return (
        <div className="container mx-auto px-4 py-6">
            <div className="flex items-center gap-4 mb-6">
                <Button
                    variant="ghost"
                    onClick={() => router.back()}
                    className="flex items-center"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                </Button>
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">My Profile Settings</h1>
                    <p className="text-gray-600">Update your personal e-filing profile information and password</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Profile Information */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center">
                            <UserCheck className="w-5 h-5 mr-2" />
                            My Personal Information
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <Label htmlFor="name">Full Name</Label>
                                    <Input
                                        id="name"
                                        value={profile.name}
                                        onChange={(e) => handleInputChange('name', e.target.value)}
                                        placeholder="Enter your full name"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="email">Email Address</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        value={profile.email}
                                        onChange={(e) => handleInputChange('email', e.target.value)}
                                        placeholder="Enter your email"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <Label htmlFor="employee_id">Employee ID</Label>
                                    <Input
                                        id="employee_id"
                                        value={profile.employee_id}
                                        disabled
                                        className="bg-gray-50"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="designation">Designation</Label>
                                    <Input
                                        id="designation"
                                        value={profile.designation}
                                        disabled
                                        className="bg-gray-50"
                                    />
                                </div>
                            </div>

                            <div>
                                <Label htmlFor="department">Department</Label>
                                <Input
                                    id="department"
                                    value={profile.department}
                                    disabled
                                    className="bg-gray-50"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <Label htmlFor="phone">Phone Number</Label>
                                    <Input
                                        id="phone"
                                        value={profile.phone}
                                        onChange={(e) => handleInputChange('phone', e.target.value)}
                                        placeholder="Enter phone number"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="address">Address</Label>
                                    <Input
                                        id="address"
                                        value={profile.address}
                                        onChange={(e) => handleInputChange('address', e.target.value)}
                                        placeholder="Enter your address"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <Button
                                    type="submit"
                                    className="bg-blue-600 hover:bg-blue-700"
                                    disabled={loading}
                                >
                                    {loading ? (
                                        <div className="flex items-center">
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                            Updating...
                                        </div>
                                    ) : (
                                        <div className="flex items-center">
                                            <Save className="w-4 h-4 mr-2" />
                                            Update Profile
                                        </div>
                                    )}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>

                {/* Password Update */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center">
                            <Lock className="w-5 h-5 mr-2" />
                            Update Password
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handlePasswordUpdate} className="space-y-4">
                            <div>
                                <Label htmlFor="current_password">Current Password</Label>
                                <div className="relative">
                                    <Input
                                        id="current_password"
                                        type={showPasswords.current ? "text" : "password"}
                                        value={passwordData.current_password}
                                        onChange={(e) => handlePasswordChange('current_password', e.target.value)}
                                        placeholder="Enter current password"
                                        required
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                        onClick={() => togglePasswordVisibility('current')}
                                    >
                                        {showPasswords.current ? (
                                            <EyeOff className="h-4 w-4" />
                                        ) : (
                                            <Eye className="h-4 w-4" />
                                        )}
                                    </Button>
                                </div>
                            </div>

                            <div>
                                <Label htmlFor="new_password">New Password</Label>
                                <div className="relative">
                                    <Input
                                        id="new_password"
                                        type={showPasswords.new ? "text" : "password"}
                                        value={passwordData.new_password}
                                        onChange={(e) => handlePasswordChange('new_password', e.target.value)}
                                        placeholder="Enter new password"
                                        required
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                        onClick={() => togglePasswordVisibility('new')}
                                    >
                                        {showPasswords.new ? (
                                            <EyeOff className="h-4 w-4" />
                                        ) : (
                                            <Eye className="h-4 w-4" />
                                        )}
                                    </Button>
                                </div>
                            </div>

                            <div>
                                <Label htmlFor="confirm_password">Confirm New Password</Label>
                                <div className="relative">
                                    <Input
                                        id="confirm_password"
                                        type={showPasswords.confirm ? "text" : "password"}
                                        value={passwordData.confirm_password}
                                        onChange={(e) => handlePasswordChange('confirm_password', e.target.value)}
                                        placeholder="Confirm new password"
                                        required
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                        onClick={() => togglePasswordVisibility('confirm')}
                                    >
                                        {showPasswords.confirm ? (
                                            <EyeOff className="h-4 w-4" />
                                        ) : (
                                            <Eye className="h-4 w-4" />
                                        )}
                                    </Button>
                                </div>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <Button
                                    type="submit"
                                    className="bg-green-600 hover:bg-green-700"
                                    disabled={loading}
                                >
                                    {loading ? (
                                        <div className="flex items-center">
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                            Updating...
                                        </div>
                                    ) : (
                                        <div className="flex items-center">
                                            <Lock className="w-4 h-4 mr-2" />
                                            Update Password
                                        </div>
                                    )}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
                
                {/* E-Signature Management */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="flex items-center">
                            <Shield className="w-5 h-5 mr-2" />
                            E-Signature Management
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {userSignature ? (
                            <div className="space-y-4">
                                <div className="border rounded-lg p-4 bg-gray-50">
                                    <Label className="text-sm font-medium mb-2 block">Your Current Signature</Label>
                                    <div className="flex items-center gap-4">
                                        <div className="border rounded bg-white p-2 flex items-center justify-center" style={{ minWidth: '200px', minHeight: '80px' }}>
                                            {userSignature.signature_type === 'typed' ? (
                                                <span 
                                                    className="text-2xl font-bold"
                                                    style={{ 
                                                        fontFamily: userSignature.signature_font || signatureFont,
                                                        color: userSignature.signature_color === 'black' ? '#000' : userSignature.signature_color === 'blue' ? '#2563eb' : '#dc2626'
                                                    }}
                                                >
                                                    {userSignature.signature_text}
                                                </span>
                                            ) : (
                                                <img
                                                    src={
                                                        userSignature.file_url 
                                                            ? (userSignature.file_url.startsWith('/api/') 
                                                                ? userSignature.file_url 
                                                                : userSignature.file_url.startsWith('/uploads/')
                                                                ? userSignature.file_url.replace('/uploads/', '/api/uploads/')
                                                                : `/api/uploads${userSignature.file_url}`)
                                                            : userSignature.signature_data
                                                    }
                                                    alt="Signature"
                                                    className="max-h-16 max-w-48 object-contain"
                                                    onError={(e) => {
                                                        // Fallback to signature_data if file_url fails
                                                        if (userSignature.signature_data && e.target.src !== userSignature.signature_data) {
                                                            e.target.src = userSignature.signature_data;
                                                        } else {
                                                            console.error('Failed to load signature image:', userSignature.file_url);
                                                        }
                                                    }}
                                                />
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm text-gray-600 mb-2">
                                                Type: {userSignature.signature_type} • Color: {userSignature.signature_color || 'black'}
                                            </p>
                                            <Button onClick={handleChangeSignature} variant="outline">
                                                <Pen className="w-4 h-4 mr-2" />
                                                Change Signature
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-8">
                                <p className="text-gray-600 mb-4">You don't have a signature yet.</p>
                                <Button onClick={handleChangeSignature}>
                                    <Pen className="w-4 h-4 mr-2" />
                                    Create E-Signature
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
            
            {/* Authentication Modal */}
            {showAuthModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
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
                                        OTP will be sent to your registered WhatsApp number: {profile.phone ? profile.phone.replace(/(\d{4})(\d{3})(\d{4})/, '$1***$3') : 'Not set'}
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
                                                disabled={authLoading || countdown > 0}
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
                                    disabled={authLoading || !otpCode}
                                >
                                    {authLoading ? "Verifying..." : "Verify"}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
            
            {/* Signature Creation Modal */}
            {showSignatureModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                            <CardTitle>Change E-Signature</CardTitle>
                            <Button variant="ghost" size="sm" onClick={() => {
                                setShowSignatureModal(false);
                                setActiveSignatureTab("draw");
                                setCanvasReady(false);
                                setSignatureText("");
                                setScannedSignatureFile(null);
                                if (sigCanvasRef.current) {
                                    sigCanvasRef.current.clear();
                                }
                            }}>
                                <X className="w-4 h-4" />
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex space-x-2 border-b">
                                <Button
                                    variant={activeSignatureTab === "draw" ? "default" : "ghost"}
                                    onClick={() => {
                                        setActiveSignatureTab("draw");
                                        setCanvasReady(false);
                                        setTimeout(() => setCanvasReady(true), 100);
                                    }}
                                    className="flex items-center gap-2"
                                >
                                    <Pen className="w-4 h-4" />
                                    Draw Signature
                                </Button>
                                <Button
                                    variant={activeSignatureTab === "type" ? "default" : "ghost"}
                                    onClick={() => {
                                        setActiveSignatureTab("type");
                                        setCanvasReady(false);
                                    }}
                                    className="flex items-center gap-2"
                                >
                                    <Pen className="w-4 h-4" />
                                    Type Signature
                                </Button>
                                <Button
                                    variant={activeSignatureTab === "scan" ? "default" : "ghost"}
                                    onClick={() => {
                                        setActiveSignatureTab("scan");
                                        setCanvasReady(false);
                                    }}
                                    className="flex items-center gap-2"
                                >
                                    <Shield className="w-4 h-4" />
                                    Upload Scanned
                                </Button>
                            </div>

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
                                        {canvasReady && (
                                            <SignatureCanvas
                                                ref={sigCanvasRef}
                                                penColor={signatureColor}
                                                canvasProps={{
                                                    width: 400,
                                                    height: 150,
                                                    className: "border rounded mx-auto mt-2 block"
                                                }}
                                            />
                                        )}
                                        {!canvasReady && (
                                            <div className="border rounded mx-auto mt-2 w-full" style={{ width: 400, height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <div className="text-gray-400">Loading canvas...</div>
                                            </div>
                                        )}
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
                                        <Button onClick={handleDrawnSignature} className="bg-blue-600 hover:bg-blue-700">
                                            Save Signature
                                        </Button>
                                    </div>
                                </div>
                            )}

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
                                            Save Signature
                                        </Button>
                                    </div>
                                </div>
                            )}

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
                                            Save Signature
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}
            
            {/* Email Registration Modal */}
            {showEmailRegistration && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
                    <Card className="w-full max-w-md">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Shield className="w-5 h-5" />
                                Register Your Google Email
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-sm text-gray-700">
                                Please register this email address ({registrationEmail}) to complete your Google authentication.
                            </p>
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setShowEmailRegistration(false)}>
                                    Cancel
                                </Button>
                                <Button onClick={registerGoogleEmail} disabled={authLoading}>
                                    {authLoading ? "Registering..." : "Register Email"}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
} 