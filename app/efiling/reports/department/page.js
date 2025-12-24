"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
    Building2, 
    Users, 
    FileText, 
    Clock, 
    CheckCircle, 
    AlertCircle, 
    Download,
    Filter,
    TrendingUp,
    TrendingDown
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function DepartmentReport() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [reportData, setReportData] = useState(null);
    const [filters, setFilters] = useState({
        dateRange: '30',
        performance: 'all'
    });

    useEffect(() => {
        fetchReportData();
    }, [filters]);

    const fetchReportData = async () => {
        setLoading(true);
        try {
            const queryParams = new URLSearchParams({
                dateRange: filters.dateRange,
                performance: filters.performance
            });

            const response = await fetch(`/api/efiling/reports/department?${queryParams}`);
            if (response.ok) {
                const data = await response.json();
                setReportData(data);
            } else {
                throw new Error('Failed to fetch report data');
            }
        } catch (error) {
            console.error('Error fetching report data:', error);
            toast({
                title: "Error",
                description: "Failed to load report data",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const exportReport = async () => {
        try {
            const queryParams = new URLSearchParams({
                dateRange: filters.dateRange,
                performance: filters.performance,
                format: 'csv'
            });

            const response = await fetch(`/api/efiling/reports/department/export?${queryParams}`);
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'department-report.csv';
                a.click();
                window.URL.revokeObjectURL(url);
            }
        } catch (error) {
            console.error('Error exporting report:', error);
            toast({
                title: "Error",
                description: "Failed to export report",
                variant: "destructive",
            });
        }
    };

    const getPerformanceBadge = (performance) => {
        if (performance >= 90) return <Badge className="bg-green-100 text-green-800">Excellent</Badge>;
        if (performance >= 75) return <Badge className="bg-blue-100 text-blue-800">Good</Badge>;
        if (performance >= 60) return <Badge className="bg-yellow-100 text-yellow-800">Average</Badge>;
        return <Badge className="bg-red-100 text-red-800">Poor</Badge>;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-lg">Loading report...</div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Department Performance Report</h1>
                    <p className="text-gray-600">Comprehensive analysis of department efficiency and workflow performance</p>
                </div>
                <Button onClick={exportReport} className="flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    Export Report
                </Button>
            </div>

            {/* Filters */}
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle className="flex items-center">
                        <Filter className="w-5 h-5 mr-2" />
                        Report Filters
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Date Range
                            </label>
                            <Select 
                                value={filters.dateRange} 
                                onValueChange={(value) => setFilters(prev => ({ ...prev, dateRange: value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select Date Range" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="7">Last 7 days</SelectItem>
                                    <SelectItem value="30">Last 30 days</SelectItem>
                                    <SelectItem value="90">Last 90 days</SelectItem>
                                    <SelectItem value="365">Last year</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Performance Filter
                            </label>
                            <Select 
                                value={filters.performance} 
                                onValueChange={(value) => setFilters(prev => ({ ...prev, performance: value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select Performance" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Performance Levels</SelectItem>
                                    <SelectItem value="excellent">Excellent (90%+)</SelectItem>
                                    <SelectItem value="good">Good (75-89%)</SelectItem>
                                    <SelectItem value="average">Average (60-74%)</SelectItem>
                                    <SelectItem value="poor">Poor (&lt;60%)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Departments</CardTitle>
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{reportData?.summary?.totalDepartments || 0}</div>
                        <p className="text-xs text-muted-foreground">
                            Active departments
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{reportData?.summary?.totalUsers || 0}</div>
                        <p className="text-xs text-muted-foreground">
                            Active users across all departments
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Avg Performance</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{reportData?.summary?.averagePerformance || 0}%</div>
                        <p className="text-xs text-muted-foreground">
                            Overall department efficiency
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Files</CardTitle>
                        <FileText className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{reportData?.summary?.activeFiles || 0}</div>
                        <p className="text-xs text-muted-foreground">
                            Files currently in workflow
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Department Performance Table */}
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>Department Performance Details</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {reportData?.departments?.map((dept) => (
                            <div key={dept.id} className="border rounded-lg p-4">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center space-x-3">
                                        <Building2 className="w-6 h-6 text-blue-600" />
                                        <div>
                                            <h3 className="text-lg font-semibold">{dept.name}</h3>
                                            <p className="text-sm text-gray-500">{dept.code}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-3">
                                        {getPerformanceBadge(dept.performanceScore)}
                                        <span className="text-2xl font-bold text-blue-600">
                                            {dept.performanceScore}%
                                        </span>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                                        <div className="text-2xl font-bold text-blue-600">{dept.totalFiles}</div>
                                        <div className="text-sm text-gray-600">Total Files</div>
                                    </div>
                                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                                        <div className="text-2xl font-bold text-green-600">{dept.completedFiles}</div>
                                        <div className="text-sm text-gray-600">Completed</div>
                                    </div>
                                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                                        <div className="text-2xl font-bold text-yellow-600">{dept.pendingFiles}</div>
                                        <div className="text-sm text-gray-600">Pending</div>
                                    </div>
                                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                                        <div className="text-2xl font-bold text-red-600">{dept.overdueFiles}</div>
                                        <div className="text-sm text-gray-600">Overdue</div>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-600">Active Users:</span>
                                        <span className="font-medium">{dept.activeUsers}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-600">Avg Processing Time:</span>
                                        <span className="font-medium">{dept.avgProcessingTime} days</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-600">SLA Compliance:</span>
                                        <span className="font-medium">{dept.slaCompliance}%</span>
                                    </div>
                                </div>
                                
                                {dept.trend === 'up' && (
                                    <div className="flex items-center space-x-2 mt-3 text-green-600">
                                        <TrendingUp className="w-4 h-4" />
                                        <span className="text-sm font-medium">Performance trending up</span>
                                    </div>
                                )}
                                {dept.trend === 'down' && (
                                    <div className="flex items-center space-x-2 mt-3 text-red-600">
                                        <TrendingDown className="w-4 h-4" />
                                        <span className="text-sm font-medium">Performance trending down</span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Performance Metrics */}
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>Performance Metrics</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <h4 className="font-medium mb-3">Top Performing Departments</h4>
                            <div className="space-y-2">
                                {reportData?.topPerformers?.map((dept, index) => (
                                    <div key={dept.id} className="flex items-center justify-between p-2 bg-green-50 rounded">
                                        <div className="flex items-center space-x-2">
                                            <span className="text-sm font-medium text-green-800">#{index + 1}</span>
                                            <span className="text-sm font-medium">{dept.name}</span>
                                        </div>
                                        <span className="text-sm font-bold text-green-800">{dept.performanceScore}%</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        
                        <div>
                            <h4 className="font-medium mb-3">Departments Needing Attention</h4>
                            <div className="space-y-2">
                                {reportData?.needsAttention?.map((dept, index) => (
                                    <div key={dept.id} className="flex items-center justify-between p-2 bg-red-50 rounded">
                                        <div className="flex items-center space-x-2">
                                            <span className="text-sm font-medium text-red-800">#{index + 1}</span>
                                            <span className="text-sm font-medium">{dept.name}</span>
                                        </div>
                                        <span className="text-sm font-bold text-red-800">{dept.performanceScore}%</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
