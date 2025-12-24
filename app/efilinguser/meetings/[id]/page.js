"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
    CheckCircle, 
    Clock, 
    Users, 
    Calendar, 
    FileText,
    ArrowLeft,
    MapPin,
    Video,
    Check,
    X
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEfilingUser } from "@/context/EfilingUserContext";

export default function MeetingDetailPage() {
    const router = useRouter();
    const params = useParams();
    const { toast } = useToast();
    const { efilingUserId } = useEfilingUser();
    const [loading, setLoading] = useState(true);
    const [responding, setResponding] = useState(false);
    const [meeting, setMeeting] = useState(null);
    const [responseStatus, setResponseStatus] = useState("PENDING");
    const [responseNotes, setResponseNotes] = useState("");

    useEffect(() => {
        if (params?.id) {
            fetchMeeting();
        }
    }, [params?.id]);

    const fetchMeeting = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/efiling/meetings/${params.id}`);
            if (res.ok) {
                const data = await res.json();
                setMeeting(data.meeting);
                if (data.meeting.user_response) {
                    setResponseStatus(data.meeting.user_response.response_status);
                    setResponseNotes(data.meeting.user_response.notes || "");
                }
            } else {
                toast({
                    title: "Error",
                    description: "Failed to fetch meeting",
                    variant: "destructive",
                });
                router.push("/efilinguser/meetings");
            }
        } catch (error) {
            console.error("Error fetching meeting:", error);
            toast({
                title: "Error",
                description: "Failed to fetch meeting",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleRespond = async () => {
        if (!efilingUserId || !responseStatus) return;

        setResponding(true);
        try {
            const res = await fetch(`/api/efiling/meetings/${params.id}/respond`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    response_status: responseStatus,
                    notes: responseNotes,
                }),
            });

            if (res.ok) {
                toast({
                    title: "Success",
                    description: `Meeting invitation ${responseStatus.toLowerCase()} successfully`,
                });
                fetchMeeting();
            } else {
                const error = await res.json();
                toast({
                    title: "Error",
                    description: error.error || "Failed to respond to meeting",
                    variant: "destructive",
                });
            }
        } catch (error) {
            console.error("Error responding to meeting:", error);
            toast({
                title: "Error",
                description: "Failed to respond to meeting",
                variant: "destructive",
            });
        } finally {
            setResponding(false);
        }
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case "SCHEDULED":
                return <Badge className="bg-blue-500">Scheduled</Badge>;
            case "ONGOING":
                return <Badge className="bg-green-500">Ongoing</Badge>;
            case "COMPLETED":
                return <Badge className="bg-gray-500">Completed</Badge>;
            case "CANCELLED":
                return <Badge className="bg-red-500">Cancelled</Badge>;
            case "POSTPONED":
                return <Badge className="bg-yellow-500">Postponed</Badge>;
            default:
                return <Badge>{status}</Badge>;
        }
    };

    if (loading) {
        return (
            <div className="container mx-auto p-6">
                <div className="text-center py-8">Loading...</div>
            </div>
        );
    }

    if (!meeting) {
        return (
            <div className="container mx-auto p-6">
                <div className="text-center py-8">Meeting not found</div>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" onClick={() => router.back()}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                </Button>
                <div>
                    <h1 className="text-3xl font-bold">{meeting.title}</h1>
                    <p className="text-gray-600 mt-1">Meeting Number: {meeting.meeting_number}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-medium">Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {getStatusBadge(meeting.status)}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-medium">Type</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            {meeting.meeting_type === "VIRTUAL" && <Video className="w-4 h-4" />}
                            {meeting.meeting_type === "IN_PERSON" && <MapPin className="w-4 h-4" />}
                            {meeting.meeting_type === "HYBRID" && (
                                <>
                                    <MapPin className="w-4 h-4" />
                                    <Video className="w-4 h-4" />
                                </>
                            )}
                            <span>{meeting.meeting_type}</span>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-medium">Date & Time</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm">
                            {new Date(meeting.meeting_date).toLocaleDateString()}
                        </p>
                        <p className="text-sm text-gray-500">
                            {meeting.start_time} - {meeting.end_time}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Description</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="prose max-w-none whitespace-pre-wrap">
                        {meeting.description || "No description provided"}
                    </div>
                </CardContent>
            </Card>

            {meeting.agenda && (
                <Card>
                    <CardHeader>
                        <CardTitle>Agenda</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="prose max-w-none whitespace-pre-wrap">
                            {meeting.agenda}
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {meeting.venue_address && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <MapPin className="w-4 h-4" />
                                Venue
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p>{meeting.venue_address}</p>
                        </CardContent>
                    </Card>
                )}
                {meeting.meeting_link && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <Video className="w-4 h-4" />
                                Meeting Link
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <a
                                href={meeting.meeting_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline"
                            >
                                {meeting.meeting_link}
                            </a>
                        </CardContent>
                    </Card>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            Attendees
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold">{meeting.total_attendees || 0}</p>
                        <p className="text-sm text-gray-500">
                            {meeting.accepted_count || 0} accepted
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            Duration
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm">
                            {meeting.duration_minutes ? `${meeting.duration_minutes} minutes` : "N/A"}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {meeting.is_attending && !meeting.user_response && meeting.status === "SCHEDULED" && (
                <Card>
                    <CardHeader>
                        <CardTitle>Respond to Invitation</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label>Response *</Label>
                            <Select
                                value={responseStatus}
                                onValueChange={setResponseStatus}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ACCEPTED">Accept</SelectItem>
                                    <SelectItem value="DECLINED">Decline</SelectItem>
                                    <SelectItem value="TENTATIVE">Tentative</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Notes (Optional)</Label>
                            <Textarea
                                value={responseNotes}
                                onChange={(e) => setResponseNotes(e.target.value)}
                                placeholder="Add any notes..."
                                rows={4}
                            />
                        </div>
                        <Button
                            onClick={handleRespond}
                            disabled={responding}
                            className="w-full"
                        >
                            <Check className="w-4 h-4 mr-2" />
                            {responding ? "Responding..." : "Submit Response"}
                        </Button>
                    </CardContent>
                </Card>
            )}

            {meeting.user_response && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-green-500" />
                            Your Response
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Badge
                            className={
                                meeting.user_response.response_status === "ACCEPTED"
                                    ? "bg-green-500"
                                    : meeting.user_response.response_status === "DECLINED"
                                    ? "bg-red-500"
                                    : "bg-yellow-500"
                            }
                        >
                            {meeting.user_response.response_status}
                        </Badge>
                        {meeting.user_response.notes && (
                            <p className="mt-2">{meeting.user_response.notes}</p>
                        )}
                        {meeting.user_response.responded_at && (
                            <p className="text-sm text-gray-500 mt-2">
                                Responded on: {new Date(meeting.user_response.responded_at).toLocaleString()}
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}

            {meeting.internal_attendees && meeting.internal_attendees.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Internal Attendees</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Designation</TableHead>
                                    <TableHead>Department</TableHead>
                                    <TableHead>Response</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {meeting.internal_attendees.map((attendee) => (
                                    <TableRow key={attendee.id}>
                                        <TableCell>{attendee.designation || "N/A"}</TableCell>
                                        <TableCell>{attendee.designation || "N/A"}</TableCell>
                                        <TableCell>{attendee.department_name || "N/A"}</TableCell>
                                        <TableCell>
                                            <Badge
                                                className={
                                                    attendee.response_status === "ACCEPTED"
                                                        ? "bg-green-500"
                                                        : attendee.response_status === "DECLINED"
                                                        ? "bg-red-500"
                                                        : "bg-yellow-500"
                                                }
                                            >
                                                {attendee.response_status}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {meeting.external_attendees && meeting.external_attendees.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>External Attendees</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Designation</TableHead>
                                    <TableHead>Organization</TableHead>
                                    <TableHead>Response</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {meeting.external_attendees.map((attendee) => (
                                    <TableRow key={attendee.id}>
                                        <TableCell>{attendee.name}</TableCell>
                                        <TableCell>{attendee.email}</TableCell>
                                        <TableCell>{attendee.designation || "N/A"}</TableCell>
                                        <TableCell>{attendee.organization || "N/A"}</TableCell>
                                        <TableCell>
                                            <Badge
                                                className={
                                                    attendee.response_status === "ACCEPTED"
                                                        ? "bg-green-500"
                                                        : attendee.response_status === "DECLINED"
                                                        ? "bg-red-500"
                                                        : "bg-yellow-500"
                                                }
                                            >
                                                {attendee.response_status}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

