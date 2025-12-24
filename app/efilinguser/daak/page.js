"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
    FileText, 
    Search, 
    Plus, 
    Eye, 
    CheckCircle, 
    Clock, 
    AlertCircle,
    Calendar,
    Users,
    Filter,
    X
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEfilingUser } from "@/context/EfilingUserContext";

export default function DaakPage() {
    const { data: session } = useSession();
    const router = useRouter();
    const { toast } = useToast();
    const { efilingUserId } = useEfilingUser();
    const [loading, setLoading] = useState(true);
    const [daak, setDaak] = useState([]);
    const [categories, setCategories] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [activeTab, setActiveTab] = useState("received");
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const itemsPerPage = 10;

    useEffect(() => {
        if (efilingUserId) {
            fetchCategories();
            fetchDaak();
        }
    }, [efilingUserId, activeTab, statusFilter, categoryFilter, currentPage]);

    const fetchCategories = async () => {
        try {
            const res = await fetch("/api/efiling/daak/categories");
            if (res.ok) {
                const data = await res.json();
                setCategories(data.categories || []);
            }
        } catch (error) {
            console.error("Error fetching categories:", error);
        }
    };

    const fetchDaak = async () => {
        if (!efilingUserId) return;
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: currentPage.toString(),
                limit: itemsPerPage.toString(),
            });

            if (activeTab === "received") {
                params.append("received_daak", "true");
            } else if (activeTab === "my_daak") {
                params.append("my_daak", "true");
            }

            if (statusFilter !== "all") {
                params.append("status", statusFilter);
            }

            if (categoryFilter !== "all") {
                params.append("category_id", categoryFilter);
            }

            const res = await fetch(`/api/efiling/daak?${params}`);
            if (res.ok) {
                const data = await res.json();
                setDaak(data.daak || []);
                setTotalPages(data.pagination?.totalPages || 1);
            } else {
                toast({
                    title: "Error",
                    description: "Failed to fetch daak",
                    variant: "destructive",
                });
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

    const getStatusBadge = (status) => {
        switch (status) {
            case "SENT":
                return <Badge className="bg-green-500">Sent</Badge>;
            case "DRAFT":
                return <Badge className="bg-yellow-500">Draft</Badge>;
            case "CANCELLED":
                return <Badge className="bg-red-500">Cancelled</Badge>;
            default:
                return <Badge>{status}</Badge>;
        }
    };

    const filteredDaak = daak.filter((item) => {
        const matchesSearch = 
            item.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.daak_number?.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesSearch;
    });

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">E-Posted (Daak)</h1>
                    <p className="text-gray-600 mt-1">View and manage your daak</p>
                </div>
                {activeTab === "my_daak" && (
                    <Button onClick={() => router.push("/efilinguser/daak/new")}>
                        <Plus className="w-4 h-4 mr-2" />
                        Create Daak
                    </Button>
                )}
            </div>

            <Card>
                <CardHeader>
                    <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full md:w-auto">
                            <TabsList>
                                <TabsTrigger value="received">Received</TabsTrigger>
                                <TabsTrigger value="my_daak">My Daak</TabsTrigger>
                                <TabsTrigger value="all">All</TabsTrigger>
                            </TabsList>
                        </Tabs>

                        <div className="flex gap-2 w-full md:w-auto">
                            <div className="relative flex-1 md:flex-initial">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                <Input
                                    placeholder="Search daak..."
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
                                    <SelectItem value="DRAFT">Draft</SelectItem>
                                    <SelectItem value="SENT">Sent</SelectItem>
                                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                                <SelectTrigger className="w-full md:w-40">
                                    <SelectValue placeholder="Category" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Categories</SelectItem>
                                    {categories.map((cat) => (
                                        <SelectItem key={cat.id} value={cat.id.toString()}>
                                            {cat.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="text-center py-8">Loading...</div>
                    ) : filteredDaak.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            No daak found
                        </div>
                    ) : (
                        <>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Daak Number</TableHead>
                                        <TableHead>Subject</TableHead>
                                        <TableHead>Category</TableHead>
                                        <TableHead>Priority</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Recipients</TableHead>
                                        <TableHead>Acknowledged</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredDaak.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-mono text-sm">
                                                {item.daak_number}
                                            </TableCell>
                                            <TableCell className="max-w-xs truncate">
                                                {item.subject}
                                            </TableCell>
                                            <TableCell>
                                                {item.category_name && (
                                                    <Badge
                                                        style={{
                                                            backgroundColor: item.category_color || "#6B7280",
                                                        }}
                                                    >
                                                        {item.category_name}
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={getPriorityColor(item.priority)}>
                                                    {item.priority}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>{getStatusBadge(item.status)}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1">
                                                    <Users className="w-4 h-4" />
                                                    {item.recipient_count || 0}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {item.is_acknowledged ? (
                                                    <CheckCircle className="w-5 h-5 text-green-500" />
                                                ) : (
                                                    <Clock className="w-5 h-5 text-yellow-500" />
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {new Date(item.created_at).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() =>
                                                        router.push(`/efilinguser/daak/${item.id}`)
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

