"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
    CheckCircle, 
    Clock, 
    Users, 
    Calendar, 
    FileText,
    ArrowLeft,
    Check,
    Send
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function DaakDetailPage() {
    const router = useRouter();
    const params = useParams();
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [acknowledging, setAcknowledging] = useState(false);
    const [sending, setSending] = useState(false);
    const [daak, setDaak] = useState(null);
    const [acknowledgmentText, setAcknowledgmentText] = useState("");

    useEffect(() => {
        if (params?.id) {
            fetchDaak();
        }
    }, [params?.id]);

    const fetchDaak = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/efiling/daak/${params.id}`);
            if (res.ok) {
                const data = await res.json();
                setDaak(data.daak);
            } else {
                toast({
                    title: "Error",
                    description: "Failed to fetch daak",
                    variant: "destructive",
                });
                router.push("/efiling/daak");
            }
        } catch (error) {
            console.error("Error fetching daak:", error);
            toast({
                title: "Error",
                description: "Failed to fetch daak",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleSend = async () => {
        if (!daak || daak.status === "SENT") return;

        setSending(true);
        try {
            const res = await fetch(`/api/efiling/daak/${params.id}/send`, {
                method: "POST",
            });

            if (res.ok) {
                toast({
                    title: "Success",
                    description: "Daak sent successfully",
                });
                fetchDaak();
            } else {
                const error = await res.json();
                toast({
                    title: "Error",
                    description: error.error || "Failed to send daak",
                    variant: "destructive",
                });
            }
        } catch (error) {
            console.error("Error sending daak:", error);
            toast({
                title: "Error",
                description: "Failed to send daak",
                variant: "destructive",
            });
        } finally {
            setSending(false);
        }
    };

    const getPriorityColor = (priority) => {
        switch (priority) {
            case "URGENT":
                return "bg-red-500";
            case "HIGH":
                return "bg-orange-500";
            case "NORMAL":
                return "bg-blue-500";
            case "LOW":
                return "bg-gray-500";
            default:
                return "bg-gray-500";
        }
    };

    if (loading) {
        return (
            <div className="container mx-auto p-6">
                <div className="text-center py-8">Loading...</div>
            </div>
        );
    }

    if (!daak) {
        return (
            <div className="container mx-auto p-6">
                <div className="text-center py-8">Daak not found</div>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" onClick={() => router.back()}>
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold">{daak.subject}</h1>
                        <p className="text-gray-600 mt-1">Daak Number: {daak.daak_number}</p>
                    </div>
                </div>
                {daak.status === "DRAFT" && (
                    <Button onClick={handleSend} disabled={sending}>
                        <Send className="w-4 h-4 mr-2" />
                        {sending ? "Sending..." : "Send Daak"}
                    </Button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-medium">Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Badge className={daak.status === "SENT" ? "bg-green-500" : "bg-yellow-500"}>
                            {daak.status}
                        </Badge>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-medium">Priority</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Badge className={getPriorityColor(daak.priority)}>
                            {daak.priority}
                        </Badge>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-medium">Category</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {daak.category_name && (
                            <Badge
                                style={{
                                    backgroundColor: daak.category_color || "#6B7280",
                                }}
                            >
                                {daak.category_name}
                            </Badge>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Content</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="prose max-w-none whitespace-pre-wrap">
                        {daak.content}
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            Recipients
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold">{daak.recipient_count || 0}</p>
                        <p className="text-sm text-gray-500">
                            {daak.acknowledged_count || 0} acknowledged
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            Date Information
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm">
                            <strong>Created:</strong>{" "}
                            {new Date(daak.created_at).toLocaleString()}
                        </p>
                        {daak.sent_at && (
                            <p className="text-sm">
                                <strong>Sent:</strong>{" "}
                                {new Date(daak.sent_at).toLocaleString()}
                            </p>
                        )}
                        {daak.expires_at && (
                            <p className="text-sm">
                                <strong>Expires:</strong>{" "}
                                {new Date(daak.expires_at).toLocaleString()}
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>

            {daak.recipients && daak.recipients.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Recipients List</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Designation</TableHead>
                                    <TableHead>Department</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Acknowledged</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {daak.recipients.map((recipient) => (
                                    <TableRow key={recipient.id}>
                                        <TableCell>{recipient.designation || "N/A"}</TableCell>
                                        <TableCell>{recipient.designation || "N/A"}</TableCell>
                                        <TableCell>{recipient.department_name || "N/A"}</TableCell>
                                        <TableCell>
                                            <Badge
                                                className={
                                                    recipient.status === "ACKNOWLEDGED"
                                                        ? "bg-green-500"
                                                        : recipient.status === "SENT"
                                                        ? "bg-blue-500"
                                                        : "bg-yellow-500"
                                                }
                                            >
                                                {recipient.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {recipient.acknowledged_at ? (
                                                <CheckCircle className="w-5 h-5 text-green-500" />
                                            ) : (
                                                <Clock className="w-5 h-5 text-yellow-500" />
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {daak.attachments && daak.attachments.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <FileText className="w-4 h-4" />
                            Attachments
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {daak.attachments.map((attachment) => (
                                <div
                                    key={attachment.id}
                                    className="flex items-center justify-between p-2 border rounded"
                                >
                                    <span>{attachment.file_name}</span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            window.open(attachment.file_path, "_blank")
                                        }
                                    >
                                        Download
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

