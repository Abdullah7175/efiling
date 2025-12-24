"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
    Calendar, 
    Search, 
    Plus, 
    Eye, 
    CheckCircle, 
    Clock, 
    X,
    MapPin,
    Video,
    Users
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function MeetingsPage() {
    const router = useRouter();
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [meetings, setMeetings] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [typeFilter, setTypeFilter] = useState("all");
    const [activeTab, setActiveTab] = useState("all");
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const itemsPerPage = 20;

    useEffect(() => {
        fetchMeetings();
    }, [activeTab, statusFilter, typeFilter, currentPage]);

    const fetchMeetings = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: currentPage.toString(),
                limit: itemsPerPage.toString(),
            });

            if (activeTab === "attending") {
                params.append("attending_meetings", "true");
            } else if (activeTab === "my_meetings") {
                params.append("my_meetings", "true");
            }

            if (statusFilter !== "all") {
                params.append("status", statusFilter);
            }

            if (typeFilter !== "all") {
                params.append("meeting_type", typeFilter);
            }

            const res = await fetch(`/api/efiling/meetings?${params}`);
            if (res.ok) {
                const data = await res.json();
                setMeetings(data.meetings || []);
                setTotalPages(data.pagination?.totalPages || 1);
            } else {
                toast({
                    title: "Error",
                    description: "Failed to fetch meetings",
                    variant: "destructive",
                });
            }
        } catch (error) {
            console.error("Error fetching meetings:", error);
            toast({
                title: "Error",
                description: "Failed to fetch meetings",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
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

    const getTypeIcon = (type) => {
        switch (type) {
            case "VIRTUAL":
                return <Video className="w-4 h-4" />;
            case "IN_PERSON":
                return <MapPin className="w-4 h-4" />;
            case "HYBRID":
                return <><MapPin className="w-4 h-4" /><Video className="w-4 h-4" /></>;
            default:
                return <Calendar className="w-4 h-4" />;
        }
    };

    const filteredMeetings = meetings.filter((meeting) => {
        const matchesSearch = 
            meeting.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            meeting.meeting_number?.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesSearch;
    });

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">Meetings</h1>
                    <p className="text-gray-600 mt-1">View and manage all meetings</p>
                </div>
                <Button onClick={() => router.push("/efiling/meetings/new")}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Meeting
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full md:w-auto">
                            <TabsList>
                                <TabsTrigger value="all">All Meetings</TabsTrigger>
                                <TabsTrigger value="attending">Attending</TabsTrigger>
                                <TabsTrigger value="my_meetings">My Meetings</TabsTrigger>
                            </TabsList>
                        </Tabs>

                        <div className="flex gap-2 w-full md:w-auto">
                            <div className="relative flex-1 md:flex-initial">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                <Input
                                    placeholder="Search meetings..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10 w-full md:w-64"
                                />
                            </div>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="w-full md:w-40">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                                    <SelectItem value="ONGOING">Ongoing</SelectItem>
                                    <SelectItem value="COMPLETED">Completed</SelectItem>
                                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                                    <SelectItem value="POSTPONED">Postponed</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={typeFilter} onValueChange={setTypeFilter}>
                                <SelectTrigger className="w-full md:w-40">
                                    <SelectValue placeholder="Type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Types</SelectItem>
                                    <SelectItem value="IN_PERSON">In-Person</SelectItem>
                                    <SelectItem value="VIRTUAL">Virtual</SelectItem>
                                    <SelectItem value="HYBRID">Hybrid</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="text-center py-8">Loading...</div>
                    ) : filteredMeetings.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            No meetings found
                        </div>
                    ) : (
                        <>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Meeting Number</TableHead>
                                        <TableHead>Title</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Date & Time</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Attendees</TableHead>
                                        <TableHead>Response</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredMeetings.map((meeting) => (
                                        <TableRow key={meeting.id}>
                                            <TableCell className="font-mono text-sm">
                                                {meeting.meeting_number}
                                            </TableCell>
                                            <TableCell className="max-w-xs truncate">
                                                {meeting.title}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1">
                                                    {getTypeIcon(meeting.meeting_type)}
                                                    <span className="text-sm">{meeting.meeting_type}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="text-sm">
                                                    <div>{new Date(meeting.meeting_date).toLocaleDateString()}</div>
                                                    <div className="text-gray-500">
                                                        {meeting.start_time} - {meeting.end_time}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>{getStatusBadge(meeting.status)}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1">
                                                    <Users className="w-4 h-4" />
                                                    {meeting.total_attendees || 0}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {meeting.user_response ? (
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
                                                ) : (
                                                    <Badge className="bg-gray-500">Pending</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() =>
                                                        router.push(`/efiling/meetings/${meeting.id}`)
                                                    }
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>

                            {totalPages > 1 && (
                                <div className="flex justify-center gap-2 mt-4">
                                    <Button
                                        variant="outline"
                                        disabled={currentPage === 1}
                                        onClick={() => setCurrentPage(currentPage - 1)}
                                    >
                                        Previous
                                    </Button>
                                    <span className="flex items-center px-4">
                                        Page {currentPage} of {totalPages}
                                    </span>
                                    <Button
                                        variant="outline"
                                        disabled={currentPage === totalPages}
                                        onClick={() => setCurrentPage(currentPage + 1)}
                                    >
                                        Next
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

