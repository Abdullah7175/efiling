"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function EFileTestPage() {
    const { data: session } = useSession();
    const [testResults, setTestResults] = useState({});
    const [loading, setLoading] = useState(false);

    const runTests = async () => {
        setLoading(true);
        const results = {};

        try {
            // Test 1: Check session
            results.session = {
                status: 'success',
                data: {
                    user: session?.user?.name,
                    email: session?.user?.email,
                    role: session?.user?.role,
                    userType: session?.user?.userType
                }
            };

            // Test 2: Check departments API
            try {
                const deptRes = await fetch('/api/efiling/departments');
                const deptData = await deptRes.json();
                results.departments = {
                    status: deptRes.ok ? 'success' : 'error',
                    data: deptData,
                    count: Array.isArray(deptData) ? deptData.length : 0
                };
            } catch (error) {
                results.departments = {
                    status: 'error',
                    error: error.message
                };
            }

            // Test 3: Check categories API
            try {
                const catRes = await fetch('/api/efiling/categories');
                const catData = await catRes.json();
                results.categories = {
                    status: catRes.ok ? 'success' : 'error',
                    data: catData,
                    count: Array.isArray(catData) ? catData.length : 0
                };
            } catch (error) {
                results.categories = {
                    status: 'error',
                    error: error.message
                };
            }

            // Test 4: Check status API
            try {
                const statusRes = await fetch('/api/efiling/status');
                const statusData = await statusRes.json();
                results.status = {
                    status: statusRes.ok ? 'success' : 'error',
                    data: statusData,
                    count: Array.isArray(statusData) ? statusData.length : 0
                };
            } catch (error) {
                results.status = {
                    status: 'error',
                    error: error.message
                };
            }

            // Test 5: Check files API
            try {
                const filesRes = await fetch('/api/efiling/files');
                const filesData = await filesRes.json();
                results.files = {
                    status: filesRes.ok ? 'success' : 'error',
                    data: filesData,
                    count: Array.isArray(filesData) ? filesData.length : 0
                };
            } catch (error) {
                results.files = {
                    status: 'error',
                    error: error.message
                };
            }

            // Test 6: Check dashboard data processing (simulates the dashboard logic)
            try {
                const filesRes = await fetch('/api/efiling/files');
                const deptRes = await fetch('/api/efiling/departments');
                
                if (!filesRes.ok || !deptRes.ok) {
                    throw new Error('API requests failed');
                }
                
                const filesData = await filesRes.json();
                const deptData = await deptRes.json();
                
                // Simulate the dashboard processing logic
                const files = Array.isArray(filesData) ? filesData : [];
                const departments = Array.isArray(deptData) ? deptData : [];
                
                let pending = 0, inProgress = 0, completed = 0;
                
                files.forEach(file => {
                    if (file && typeof file === 'object') {
                        const status = (file.status_name || "").toLowerCase();
                        if (status === "pending") pending++;
                        else if (status === "in progress") inProgress++;
                        else if (status === "completed" || status === "approved") completed++;
                    }
                });
                
                results.dashboard = {
                    status: 'success',
                    data: {
                        totalFiles: files.length,
                        pendingFiles: pending,
                        inProgressFiles: inProgress,
                        completedFiles: completed,
                        totalDepartments: departments.length
                    },
                    processing: {
                        filesIsArray: Array.isArray(filesData),
                        departmentsIsArray: Array.isArray(deptData),
                        filesCount: files.length,
                        departmentsCount: departments.length
                    }
                };
            } catch (error) {
                results.dashboard = {
                    status: 'error',
                    error: error.message
                };
            }

        } catch (error) {
            results.general = {
                status: 'error',
                error: error.message
            };
        }

        setTestResults(results);
        setLoading(false);
    };

    useEffect(() => {
        if (session?.user) {
            runTests();
        }
    }, [session]);

    const getStatusColor = (status) => {
        switch (status) {
            case 'success': return 'text-green-600';
            case 'error': return 'text-red-600';
            default: return 'text-gray-600';
        }
    };

    return (
        <div className="container mx-auto px-4 py-6">
            <Card>
                <CardHeader>
                    <CardTitle>E-Filing System Test</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <Button onClick={runTests} disabled={loading}>
                            {loading ? 'Running Tests...' : 'Run Tests'}
                        </Button>

                        {Object.keys(testResults).length > 0 && (
                            <div className="space-y-4">
                                {Object.entries(testResults).map(([testName, result]) => (
                                    <Card key={testName}>
                                        <CardHeader>
                                            <CardTitle className="text-lg capitalize">
                                                {testName} Test
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className={`font-medium ${getStatusColor(result.status)}`}>
                                                Status: {result.status.toUpperCase()}
                                            </div>
                                            {result.error && (
                                                <div className="text-red-600 mt-2">
                                                    Error: {result.error}
                                                </div>
                                            )}
                                            {result.data && (
                                                <div className="mt-2">
                                                    <div className="text-sm text-gray-600">
                                                        Count: {result.count || 'N/A'}
                                                    </div>
                                                    <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto max-h-40">
                                                        {JSON.stringify(result.data, null, 2)}
                                                    </pre>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
} 