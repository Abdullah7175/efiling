"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Building2, Users, FileText, Clock, CheckCircle, AlertCircle, Download, Filter, TrendingUp, TrendingDown } from 'lucide-react';

export default function DepartmentPerformanceReport() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [departments, setDepartments] = useState([]);
    const [performanceData, setPerformanceData] = useState([]);
    const [filters, setFilters] = useState({
        dateRange: '30',
        includeInactive: false
    });

    useEffect(() => {
        loadData();
    }, [filters]);

    const loadData = async () => {
        try {
            setLoading(true);
            await Promise.all([
                loadDepartments(),
                loadPerformanceData()
            ]);
        } catch (error) {
            console.error('Error loading data:', error);
            toast({
                title: "Error",
                description: "Failed to load performance data",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    const loadDepartments = async () => {
        try {
            const response = await fetch('/api/efiling/departments?is_active=true');
            if (response.ok) {
                const data = await response.json();
                setDepartments(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            console.error('Error loading departments:', error);
        }
    };

    const loadPerformanceData = async () => {
        try {
            const queryParams = new URLSearchParams({
                dateRange: filters.dateRange,
                includeInactive: filters.includeInactive.toString()
            });
            
            const response = await fetch(`/api/efiling/reports/department-performance?${queryParams}`);
            if (response.ok) {
                const data = await response.json();
                setPerformanceData(data.performance || []);
            }
        } catch (error) {
            console.error('Error loading performance data:', error);
        }
    };

    const getEfficiencyScore = (dept) => {
        if (dept.totalFiles === 0) return 0;
        const completedRatio = dept.completedFiles / dept.totalFiles;
        const onTimeRatio = (dept.totalFiles - dept.overdueFiles) / dept.totalFiles;
        return Math.round((completedRatio * 0.6 + onTimeRatio * 0.4) * 100);
    };

    const getEfficiencyColor = (score) => {
        if (score >= 80) return 'text-green-600';
        if (score >= 60) return 'text-yellow-600';
        return 'text-red-600';
    };

    const getEfficiencyBadge = (score) => {
        if (score >= 80) return 'bg-green-100 text-green-800';
        if (score >= 60) return 'bg-yellow-100 text-yellow-800';
        return 'bg-red-100 text-red-800';
    };

    const getTrendIcon = (current, previous) => {
        if (current > previous) return <TrendingUp className="w-4 h-4 text-green-600" />;
        if (current < previous) return <TrendingDown className="w-4 h-4 text-red-600" />;
        return <span className="text-gray-400">—</span>;
    };

    const exportToCSV = () => {
        const headers = [
            'Department', 'Total Files', 'Completed Files', 'Pending Files', 
            'Overdue Files', 'Avg Processing Time (days)', 'Efficiency Score (%)',
            'Active Users', 'SLA Compliance (%)'
        ];
        
        const csvData = performanceData.map(dept => [
            dept.department_name,
            dept.totalFiles,
            dept.completedFiles,
            dept.pendingFiles,
            dept.overdueFiles,
            dept.avgProcessingTime.toFixed(1),
            getEfficiencyScore(dept),
            dept.activeUsers,
            dept.slaCompliance
        ]);

        const csvContent = [headers, ...csvData]
            .map(row => row.map(cell => `"${cell}"`).join(','))
            .join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `department_performance_report_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);

        toast({
            title: "Success",
            description: "Report exported to CSV successfully",
        });
    };

    const getOverallStats = () => {
        if (performanceData.length === 0) return {};
        
        const totalFiles = performanceData.reduce((sum, dept) => sum + dept.totalFiles, 0);
        const totalCompleted = performanceData.reduce((sum, dept) => sum + dept.completedFiles, 0);
        const totalOverdue = performanceData.reduce((sum, dept) => sum + dept.overdueFiles, 0);
        const totalUsers = performanceData.reduce((sum, dept) => sum + dept.activeUsers, 0);
        const avgEfficiency = performanceData.reduce((sum, dept) => sum + getEfficiencyScore(dept), 0) / performanceData.length;

        return {
            totalFiles,
            totalCompleted,
            totalOverdue,
            totalUsers,
            avgEfficiency: Math.round(avgEfficiency),
            completionRate: totalFiles > 0 ? Math.round((totalCompleted / totalFiles) * 100) : 0
        };
    };

    const overallStats = getOverallStats();

    return (
        <div className="container mx-auto px-4 py-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Department Performance Report</h1>
                    <p className="text-gray-600">Monitor department efficiency and workflow performance</p>
                </div>
                <Button onClick={exportToCSV} className="flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    Export CSV
                </Button>
            </div>

            {/* Filters */}
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Filter className="w-5 h-5" />
                        Report Filters
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm font-medium">Date Range</label>
                            <Select value={filters.dateRange} onValueChange={(value) => setFilters(prev => ({ ...prev, dateRange: value }))}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select date range" />
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
                            <label className="text-sm font-medium">Include Inactive Departments</label>
                            <Select value={filters.includeInactive.toString()} onValueChange={(value) => setFilters(prev => ({ ...prev, includeInactive: value === 'true' }))}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select option" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="false">Active Only</SelectItem>
                                    <SelectItem value="true">Include Inactive</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Overall Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Total Files</p>
                                <p className="text-2xl font-bold text-gray-900">{overallStats.totalFiles}</p>
                            </div>
                            <FileText className="w-8 h-8 text-gray-400" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Completion Rate</p>
                                <p className="text-2xl font-bold text-green-600">{overallStats.completionRate}%</p>
                            </div>
                            <CheckCircle className="w-8 h-8 text-green-400" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Overdue Files</p>
                                <p className="text-2xl font-bold text-red-600">{overallStats.totalOverdue}</p>
                            </div>
                            <AlertCircle className="w-8 h-8 text-red-400" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Active Users</p>
                                <p className="text-2xl font-bold text-blue-600">{overallStats.totalUsers}</p>
                            </div>
                            <Users className="w-8 h-8 text-blue-400" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Avg Efficiency</p>
                                <p className="text-2xl font-bold text-purple-600">{overallStats.avgEfficiency}%</p>
                            </div>
                            <TrendingUp className="w-8 h-8 text-purple-400" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Department Performance Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Department Performance Details</CardTitle>
                    <CardDescription>
                        Detailed performance metrics for each department
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="text-center py-8">
                            <div className="text-lg">Loading performance data...</div>
                        </div>
                    ) : performanceData.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <Building2 className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                            <p className="text-lg">No performance data found</p>
                            <p className="text-sm">Try adjusting your filters or check back later</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Department</TableHead>
                                        <TableHead>Total Files</TableHead>
                                        <TableHead>Completed</TableHead>
                                        <TableHead>Pending</TableHead>
                                        <TableHead>Overdue</TableHead>
                                        <TableHead>Avg Time (days)</TableHead>
                                        <TableHead>Efficiency</TableHead>
                                        <TableHead>Active Users</TableHead>
                                        <TableHead>SLA Compliance</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {performanceData.map((dept) => {
                                        const efficiencyScore = getEfficiencyScore(dept);
                                        return (
                                            <TableRow key={dept.department_id}>
                                                <TableCell className="font-medium">
                                                    <div className="flex items-center gap-2">
                                                        <Building2 className="w-4 h-4 text-gray-500" />
                                                        {dept.department_name}
                                                    </div>
                                                </TableCell>
                                                <TableCell>{dept.totalFiles}</TableCell>
                                                <TableCell className="text-green-600 font-medium">
                                                    {dept.completedFiles}
                                                </TableCell>
                                                <TableCell className="text-yellow-600">
                                                    {dept.pendingFiles}
                                                </TableCell>
                                                <TableCell className="text-red-600">
                                                    {dept.overdueFiles}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <Clock className="w-4 h-4 text-gray-500" />
                                                        {dept.avgProcessingTime.toFixed(1)}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <Badge className={getEfficiencyBadge(efficiencyScore)}>
                                                            {efficiencyScore}%
                                                        </Badge>
                                                        <Progress value={efficiencyScore} className="w-16" />
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <Users className="w-4 h-4 text-gray-500" />
                                                        {dept.activeUsers}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`font-medium ${dept.slaCompliance >= 80 ? 'text-green-600' : dept.slaCompliance >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                            {dept.slaCompliance}%
                                                        </span>
                                                        {dept.previousSlaCompliance && (
                                                            getTrendIcon(dept.slaCompliance, dept.previousSlaCompliance)
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Performance Insights */}
            {performanceData.length > 0 && (
                <Card className="mt-6">
                    <CardHeader>
                        <CardTitle>Performance Insights</CardTitle>
                        <CardDescription>
                            Key observations and recommendations based on the data
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <h4 className="font-medium text-gray-900 mb-3">Top Performers</h4>
                                <div className="space-y-2">
                                    {performanceData
                                        .sort((a, b) => getEfficiencyScore(b) - getEfficiencyScore(a))
                                        .slice(0, 3)
                                        .map((dept, index) => (
                                            <div key={dept.department_id} className="flex items-center justify-between p-2 bg-green-50 rounded-lg">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                                                        {index + 1}
                                                    </span>
                                                    <span className="font-medium">{dept.department_name}</span>
                                                </div>
                                                <Badge className="bg-green-100 text-green-800">
                                                    {getEfficiencyScore(dept)}%
                                                </Badge>
                                            </div>
                                        ))}
                                </div>
                            </div>
                            <div>
                                <h4 className="font-medium text-gray-900 mb-3">Areas for Improvement</h4>
                                <div className="space-y-2">
                                    {performanceData
                                        .filter(dept => getEfficiencyScore(dept) < 60)
                                        .sort((a, b) => getEfficiencyScore(a) - getEfficiencyScore(b))
                                        .slice(0, 3)
                                        .map((dept, index) => (
                                            <div key={dept.department_id} className="flex items-center justify-between p-2 bg-red-50 rounded-lg">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-6 h-6 bg-red-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                                                        {index + 1}
                                                    </span>
                                                    <span className="font-medium">{dept.department_name}</span>
                                                </div>
                                                <Badge className="bg-red-100 text-red-800">
                                                    {getEfficiencyScore(dept)}%
                                                </Badge>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
