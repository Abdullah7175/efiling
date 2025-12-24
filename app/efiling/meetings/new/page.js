"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { X, Plus, Save, Calendar as CalendarIcon, MapPin, Video, Clock, Users, Edit2, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function CreateMeetingPage() {
    const router = useRouter();
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [departments, setDepartments] = useState([]);
    const [roles, setRoles] = useState([]);
    const [roleGroups, setRoleGroups] = useState([]);
    const [teams, setTeams] = useState([]);
    const [users, setUsers] = useState([]);

    const [formData, setFormData] = useState({
        title: "",
        description: "",
        agenda: "",
        meeting_type: "IN_PERSON",
        meeting_date: "",
        start_time: "",
        end_time: "",
        venue_address: "",
        meeting_link: "",
        department_id: "",
    });

    const [attendees, setAttendees] = useState([]);
    const [externalAttendees, setExternalAttendees] = useState([]);
    const [showAttendeeModal, setShowAttendeeModal] = useState(false);
    const [showExternalModal, setShowExternalModal] = useState(false);
    const [attendeeType, setAttendeeType] = useState("USER");
    const [attendeeOptions, setAttendeeOptions] = useState([]);
    const [selectedAttendeeId, setSelectedAttendeeId] = useState("");

    const [externalForm, setExternalForm] = useState({
        email: "",
        name: "",
        designation: "",
        organization: "",
    });

    const [selectedTimeSlot, setSelectedTimeSlot] = useState(null);
    const [duration, setDuration] = useState(30); // minutes

    // Generate time slots (30 min intervals from 8 AM to 8 PM)
    const generateTimeSlots = (dur) => {
        const slots = [];
        for (let hour = 8; hour < 20; hour++) {
            for (let minute = 0; minute < 60; minute += 30) {
                const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
                const totalMinutes = minute + dur;
                const endHour = hour + Math.floor(totalMinutes / 60);
                const endMinute = totalMinutes % 60;
                const endTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
                slots.push({ start: time, end: endTime });
            }
        }
        return slots;
    };

    const timeSlots = generateTimeSlots(duration);

    useEffect(() => {
        fetchDepartments();
        fetchRoles();
        fetchRoleGroups();
        fetchTeams();
        fetchUsers();
    }, []);

    useEffect(() => {
        if (attendeeType === "USER") {
            setAttendeeOptions(users.map(u => ({ id: u.id, name: u.designation || u.employee_id || `User ${u.id}`, designation: u.designation })));
        } else if (attendeeType === "ROLE") {
            setAttendeeOptions(roles.map(r => ({ id: r.id, name: r.name, title: r.name })));
        } else if (attendeeType === "ROLE_GROUP") {
            setAttendeeOptions(roleGroups.map(rg => ({ id: rg.id, name: rg.name, title: rg.name })));
        } else if (attendeeType === "TEAM") {
            setAttendeeOptions(teams);
        }
    }, [attendeeType, users, roles, roleGroups, teams]);

    useEffect(() => {
        if (selectedTimeSlot) {
            setFormData((prev) => ({
                ...prev,
                start_time: selectedTimeSlot.start,
                end_time: selectedTimeSlot.end,
            }));
        }
    }, [selectedTimeSlot, duration]);

    const fetchDepartments = async () => {
        try {
            const res = await fetch("/api/efiling/departments");
            if (res.ok) {
                const data = await res.json();
                setDepartments(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            console.error("Error fetching departments:", error);
        }
    };

    const fetchRoles = async () => {
        try {
            const res = await fetch("/api/efiling/roles");
            if (res.ok) {
                const data = await res.json();
                setRoles(data.roles || []);
            }
        } catch (error) {
            console.error("Error fetching roles:", error);
        }
    };

    const fetchRoleGroups = async () => {
        try {
            const res = await fetch("/api/efiling/role-groups");
            if (res.ok) {
                const data = await res.json();
                setRoleGroups(data.roleGroups || []);
            }
        } catch (error) {
            console.error("Error fetching role groups:", error);
        }
    };

    const fetchTeams = async () => {
        try {
            const res = await fetch("/api/efiling/users?is_active=true");
            if (res.ok) {
                const data = await res.json();
                const users = Array.isArray(data) ? data : [];
                setTeams(users.map(u => ({ id: u.id, name: u.designation || u.employee_id || `User ${u.id}`, title: u.designation })));
            }
        } catch (error) {
            console.error("Error fetching teams:", error);
        }
    };

    const fetchUsers = async () => {
        try {
            const res = await fetch("/api/efiling/users?is_active=true");
            if (res.ok) {
                const data = await res.json();
                setUsers(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            console.error("Error fetching users:", error);
        }
    };

    const addAttendee = () => {
        if (selectedAttendeeId) {
            const option = attendeeOptions.find((opt) => opt.id.toString() === selectedAttendeeId);
            if (option) {
                const exists = attendees.some(
                    (a) => a.type === attendeeType && a.id === option.id
                );
                if (!exists) {
                    setAttendees([
                        ...attendees,
                        {
                            type: attendeeType,
                            id: option.id,
                            name: option.name || option.designation || option.title || "Unknown",
                        },
                    ]);
                }
            }
        }
        setSelectedAttendeeId("");
        setShowAttendeeModal(false);
    };

    const addExternalAttendee = () => {
        if (externalForm.email && externalForm.name) {
            const exists = externalAttendees.some((e) => e.email === externalForm.email);
            if (!exists) {
                setExternalAttendees([...externalAttendees, { ...externalForm }]);
                setExternalForm({ email: "", name: "", designation: "", organization: "" });
                setShowExternalModal(false);
            } else {
                toast({
                    title: "Error",
                    description: "This email is already added",
                    variant: "destructive",
                });
            }
        }
    };

    const removeAttendee = (index) => {
        setAttendees(attendees.filter((_, i) => i !== index));
    };

    const removeExternalAttendee = (index) => {
        setExternalAttendees(externalAttendees.filter((_, i) => i !== index));
    };

    const handleSubmit = async () => {
        if (!formData.title || !formData.meeting_date || !formData.start_time || !formData.end_time) {
            toast({
                title: "Error",
                description: "Title, date, start time, and end time are required",
                variant: "destructive",
            });
            return;
        }

        if (formData.meeting_type === "IN_PERSON" && !formData.venue_address) {
            toast({
                title: "Error",
                description: "Venue address is required for in-person meetings",
                variant: "destructive",
            });
            return;
        }

        if (formData.meeting_type === "VIRTUAL" && !formData.meeting_link) {
            toast({
                title: "Error",
                description: "Meeting link is required for virtual meetings",
                variant: "destructive",
            });
            return;
        }

        setLoading(true);
        try {
            const payload = {
                ...formData,
                department_id: formData.department_id || null,
                attendees: attendees,
                external_attendees: externalAttendees,
            };

            const res = await fetch("/api/efiling/meetings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                toast({
                    title: "Success",
                    description: "Meeting created successfully",
                });
                router.push("/efiling/meetings");
            } else {
                const error = await res.json();
                toast({
                    title: "Error",
                    description: error.error || "Failed to create meeting",
                    variant: "destructive",
                });
            }
        } catch (error) {
            console.error("Error creating meeting:", error);
            toast({
                title: "Error",
                description: "Failed to create meeting",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const formatTime = (time) => {
        if (!time) return "";
        const [hours, minutes] = time.split(':');
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 || 12;
        return `${displayHour}:${minutes} ${ampm}`;
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="container mx-auto p-6 max-w-7xl">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-3xl font-bold text-gray-900">Schedule Meeting</h1>
                    <p className="text-gray-600 mt-1">Create a new meeting and invite attendees</p>
                </div>

                {/* Main Content - Two Column Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Panel - Meeting Details */}
                    <div className="lg:col-span-1 space-y-4">
                        <Card className="border-0 shadow-lg">
                            <CardHeader className="pb-4">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-xl font-semibold">Meeting Details</CardTitle>
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                        <Edit2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {/* Title */}
                                <div>
                                    <Label className="text-sm font-medium text-gray-700">Meeting Title</Label>
                                    <Input
                                        value={formData.title}
                                        onChange={(e) =>
                                            setFormData({ ...formData, title: e.target.value })
                                        }
                                        placeholder="Enter meeting title"
                                        className="mt-1"
                                    />
                                </div>

                                {/* Duration */}
                                <div>
                                    <Label className="text-sm font-medium text-gray-700">Duration</Label>
                                    <Select
                                        value={duration.toString()}
                                        onValueChange={(value) => {
                                            const newDuration = parseInt(value);
                                            setDuration(newDuration);
                                            if (selectedTimeSlot) {
                                                const [hours, minutes] = selectedTimeSlot.start.split(':');
                                                const startHour = parseInt(hours);
                                                const startMinute = parseInt(minutes);
                                                const totalMinutes = startMinute + newDuration;
                                                const endHour = startHour + Math.floor(totalMinutes / 60);
                                                const endMinute = totalMinutes % 60;
                                                const endTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
                                                setSelectedTimeSlot({ ...selectedTimeSlot, end: endTime });
                                            }
                                        }}
                                    >
                                        <SelectTrigger className="mt-1">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="15">15 min</SelectItem>
                                            <SelectItem value="30">30 min</SelectItem>
                                            <SelectItem value="45">45 min</SelectItem>
                                            <SelectItem value="60">1 hour</SelectItem>
                                            <SelectItem value="90">1.5 hours</SelectItem>
                                            <SelectItem value="120">2 hours</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Meeting Type */}
                                <div>
                                    <Label className="text-sm font-medium text-gray-700">Conference Type</Label>
                                    <Select
                                        value={formData.meeting_type}
                                        onValueChange={(value) =>
                                            setFormData({ ...formData, meeting_type: value })
                                        }
                                    >
                                        <SelectTrigger className="mt-1">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="IN_PERSON">
                                                <div className="flex items-center">
                                                    <MapPin className="w-4 h-4 mr-2" />
                                                    In-Person
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="VIRTUAL">
                                                <div className="flex items-center">
                                                    <Video className="w-4 h-4 mr-2" />
                                                    Virtual (Zoom/Meet)
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="HYBRID">
                                                <div className="flex items-center">
                                                    <Video className="w-4 h-4 mr-2" />
                                                    Hybrid
                                                </div>
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Venue or Link */}
                                {(formData.meeting_type === "IN_PERSON" || formData.meeting_type === "HYBRID") && (
                                    <div>
                                        <Label className="text-sm font-medium text-gray-700">Venue Address</Label>
                                        <Input
                                            value={formData.venue_address}
                                            onChange={(e) =>
                                                setFormData({ ...formData, venue_address: e.target.value })
                                            }
                                            placeholder="Enter venue address"
                                            className="mt-1"
                                        />
                                    </div>
                                )}
                                {(formData.meeting_type === "VIRTUAL" || formData.meeting_type === "HYBRID") && (
                                    <div>
                                        <Label className="text-sm font-medium text-gray-700">Meeting Link</Label>
                                        <Input
                                            value={formData.meeting_link}
                                            onChange={(e) =>
                                                setFormData({ ...formData, meeting_link: e.target.value })
                                            }
                                            placeholder="https://meet.google.com/..."
                                            className="mt-1"
                                        />
                                    </div>
                                )}

                                {/* Department */}
                                <div>
                                    <Label className="text-sm font-medium text-gray-700">Department</Label>
                                    <Select
                                        value={formData.department_id || undefined}
                                        onValueChange={(value) =>
                                            setFormData({ ...formData, department_id: value === "none" ? "" : value })
                                        }
                                    >
                                        <SelectTrigger className="mt-1">
                                            <SelectValue placeholder="Select department" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">None</SelectItem>
                                            {departments.map((dept) => (
                                                <SelectItem key={dept.id} value={dept.id.toString()}>
                                                    {dept.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Description */}
                                <div>
                                    <Label className="text-sm font-medium text-gray-700">Description</Label>
                                    <Textarea
                                        value={formData.description}
                                        onChange={(e) =>
                                            setFormData({ ...formData, description: e.target.value })
                                        }
                                        placeholder="Meeting description..."
                                        rows={3}
                                        className="mt-1"
                                    />
                                </div>

                                {/* Agenda */}
                                <div>
                                    <Label className="text-sm font-medium text-gray-700">Agenda</Label>
                                    <Textarea
                                        value={formData.agenda}
                                        onChange={(e) =>
                                            setFormData({ ...formData, agenda: e.target.value })
                                        }
                                        placeholder="Meeting agenda items..."
                                        rows={3}
                                        className="mt-1"
                                    />
                                </div>

                                {/* Hosts Section */}
                                <div className="pt-2 border-t">
                                    <Label className="text-sm font-medium text-gray-700 mb-2 block">Hosts</Label>
                                    <div className="flex items-center gap-2 text-sm text-gray-600">
                                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                            <Users className="w-4 h-4 text-primary" />
                                        </div>
                                        <span>You (Organizer)</span>
                                    </div>
                                </div>

                                {/* Contacts Section */}
                                <div className="pt-2 border-t">
                                    <div className="flex items-center justify-between mb-2">
                                        <Label className="text-sm font-medium text-gray-700">Contacts</Label>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setShowAttendeeModal(true)}
                                            className="h-7 text-xs"
                                        >
                                            <Plus className="w-3 h-3 mr-1" />
                                            Add guests
                                        </Button>
                                    </div>
                                    {attendees.length === 0 && externalAttendees.length === 0 ? (
                                        <p className="text-xs text-gray-500">No attendees added</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {attendees.map((attendee, index) => (
                                                <div key={index} className="flex items-center justify-between text-sm bg-gray-50 p-2 rounded">
                                                    <span className="text-gray-700">{attendee.name}</span>
                                                    <button
                                                        onClick={() => removeAttendee(index)}
                                                        className="text-gray-400 hover:text-red-500"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ))}
                                            {externalAttendees.map((attendee, index) => (
                                                <div key={index} className="flex items-center justify-between text-sm bg-gray-50 p-2 rounded">
                                                    <span className="text-gray-700">{attendee.name}</span>
                                                    <button
                                                        onClick={() => removeExternalAttendee(index)}
                                                        className="text-gray-400 hover:text-red-500"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* External Attendees Button */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setShowExternalModal(true)}
                                    className="w-full"
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    Add External Attendee
                                </Button>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Right Panel - Calendar & Time Selection */}
                    <div className="lg:col-span-2 space-y-4">
                        <Card className="border-0 shadow-lg">
                            <CardHeader className="pb-4">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-xl font-semibold">Select a time to book</CardTitle>
                                    <div className="text-sm text-gray-500">
                                        Time zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {/* Calendar */}
                                <div className="mb-6">
                                    <Calendar
                                        value={formData.meeting_date}
                                        onChange={(date) => {
                                            setFormData({ ...formData, meeting_date: date });
                                            setSelectedTimeSlot(null);
                                        }}
                                        minDate={new Date().toISOString().split('T')[0]}
                                    />
                                </div>

                                {/* Time Slots */}
                                {formData.meeting_date ? (
                                    <div>
                                        <Label className="text-sm font-medium text-gray-700 mb-3 block">
                                            Available Times
                                        </Label>
                                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-96 overflow-y-auto">
                                            {timeSlots.map((slot, index) => {
                                                const isSelected = selectedTimeSlot?.start === slot.start;
                                                return (
                                                    <button
                                                        key={index}
                                                        onClick={() => setSelectedTimeSlot(slot)}
                                                        className={cn(
                                                            "px-3 py-2 text-sm rounded-md border transition-colors",
                                                            "hover:bg-primary hover:text-primary-foreground hover:border-primary",
                                                            isSelected
                                                                ? "bg-primary text-primary-foreground border-primary"
                                                                : "bg-white border-gray-200 text-gray-700"
                                                        )}
                                                    >
                                                        {formatTime(slot.start)}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {selectedTimeSlot && (
                                            <div className="mt-4 p-3 bg-primary/10 rounded-md">
                                                <p className="text-sm font-medium text-gray-700">
                                                    Selected: {formatTime(selectedTimeSlot.start)} - {formatTime(selectedTimeSlot.end)}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="text-center py-12 text-gray-500">
                                        <CalendarIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                        <p>Select a date to view available times</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Action Buttons */}
                        <div className="flex justify-end gap-3">
                            <Button
                                variant="outline"
                                onClick={() => router.back()}
                                disabled={loading}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSubmit}
                                disabled={loading || !formData.meeting_date || !selectedTimeSlot}
                                className="min-w-[140px]"
                            >
                                {loading ? (
                                    "Creating..."
                                ) : (
                                    <>
                                        <Save className="w-4 h-4 mr-2" />
                                        Book Meeting
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Modals */}
                {showAttendeeModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                        <Card className="bg-white p-6 rounded-lg w-full max-w-md shadow-xl">
                            <CardContent className="space-y-4">
                                <h3 className="text-lg font-semibold">Add Attendee</h3>
                                <div>
                                    <Label>Attendee Type</Label>
                                    <Select
                                        value={attendeeType}
                                        onValueChange={setAttendeeType}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="USER">User</SelectItem>
                                            <SelectItem value="ROLE">Role</SelectItem>
                                            <SelectItem value="ROLE_GROUP">Role Group</SelectItem>
                                            <SelectItem value="TEAM">Team</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label>Select {attendeeType.replace("_", " ")}</Label>
                                    <Select
                                        value={selectedAttendeeId}
                                        onValueChange={setSelectedAttendeeId}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder={`Select ${attendeeType}`} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {attendeeOptions.length > 0 ? (
                                                attendeeOptions.map((opt) => (
                                                    <SelectItem
                                                        key={opt.id}
                                                        value={opt.id.toString()}
                                                    >
                                                        {opt.name || opt.designation || opt.title || `ID: ${opt.id}`}
                                                    </SelectItem>
                                                ))
                                            ) : (
                                                <SelectItem value="no-options" disabled>
                                                    No options available
                                                </SelectItem>
                                            )}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex gap-2 justify-end">
                                    <Button
                                        variant="outline"
                                        onClick={() => setShowAttendeeModal(false)}
                                    >
                                        Cancel
                                    </Button>
                                    <Button onClick={addAttendee}>Add</Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {showExternalModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                        <Card className="bg-white p-6 rounded-lg w-full max-w-md shadow-xl">
                            <CardContent className="space-y-4">
                                <h3 className="text-lg font-semibold">Add External Attendee</h3>
                                <div>
                                    <Label>Email *</Label>
                                    <Input
                                        type="email"
                                        value={externalForm.email}
                                        onChange={(e) =>
                                            setExternalForm({ ...externalForm, email: e.target.value })
                                        }
                                        placeholder="email@example.com"
                                    />
                                </div>
                                <div>
                                    <Label>Name *</Label>
                                    <Input
                                        value={externalForm.name}
                                        onChange={(e) =>
                                            setExternalForm({ ...externalForm, name: e.target.value })
                                        }
                                        placeholder="Full name"
                                    />
                                </div>
                                <div>
                                    <Label>Designation</Label>
                                    <Input
                                        value={externalForm.designation}
                                        onChange={(e) =>
                                            setExternalForm({ ...externalForm, designation: e.target.value })
                                        }
                                        placeholder="Designation"
                                    />
                                </div>
                                <div>
                                    <Label>Organization</Label>
                                    <Input
                                        value={externalForm.organization}
                                        onChange={(e) =>
                                            setExternalForm({ ...externalForm, organization: e.target.value })
                                        }
                                        placeholder="Organization"
                                    />
                                </div>
                                <div className="flex gap-2 justify-end">
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            setShowExternalModal(false);
                                            setExternalForm({ email: "", name: "", designation: "", organization: "" });
                                        }}
                                    >
                                        Cancel
                                    </Button>
                                    <Button onClick={addExternalAttendee}>Add</Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>
        </div>
    );
}
