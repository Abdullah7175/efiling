"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Filter } from 'lucide-react';
import { Pagination } from '@/components/ui/pagination';

export default function RoleGroupsPage() {
    const [loading, setLoading] = useState(true);
    const [roleGroups, setRoleGroups] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const router = useRouter();
    
    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(5);

    const load = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/efiling/role-groups');
            const data = await res.json();
            setRoleGroups(data.roleGroups || []);
        } catch (e) {
            console.error('Failed to load role groups', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    useEffect(() => {
        setCurrentPage(1); // Reset to first page when search changes
    }, [searchTerm]);

    const handleDelete = async (id) => {
        if (!confirm('Delete this role group?')) return;
        try {
            const res = await fetch(`/api/efiling/role-groups?id=${id}`, { method: 'DELETE' });
            if (res.ok) load();
        } catch (e) { console.error(e); }
    };

    const filteredRoleGroups = roleGroups.filter(group =>
        group.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        group.code?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Calculate pagination
    const totalPages = Math.ceil(filteredRoleGroups.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedRoleGroups = filteredRoleGroups.slice(startIndex, endIndex);

    const handlePageChange = (page) => {
        setCurrentPage(page);
    };

    const handleItemsPerPageChange = (newItemsPerPage) => {
        setItemsPerPage(newItemsPerPage);
        setCurrentPage(1);
    };

    return (
        <div className="container mx-auto px-4 py-6 space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Role Groups</h1>
                <Link href="/efiling/role-groups/create">
                    <Button>Create Role Group</Button>
                </Link>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center">
                        <Filter className="w-5 h-5 mr-2" />
                        Search Role Groups
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <Input
                            placeholder="Search by name or code..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>All Role Groups ({filteredRoleGroups.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div>Loading...</div>
                    ) : filteredRoleGroups.length === 0 ? (
                        <div>No role groups found.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left">
                                        <th className="py-2 pr-4">Name</th>
                                        <th className="py-2 pr-4">Code</th>
                                        <th className="py-2 pr-4">Patterns</th>
                                        <th className="py-2 pr-4">Active</th>
                                        <th className="py-2 pr-4">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedRoleGroups.map(g => (
                                        <tr key={g.id} className="border-t">
                                            <td className="py-2 pr-4">{g.name}</td>
                                            <td className="py-2 pr-4">{g.code}</td>
                                            <td className="py-2 pr-4">{Array.isArray(g.role_codes) ? g.role_codes.join(', ') : (()=>{ try { return (JSON.parse(g.role_codes||'[]')).join(', ');} catch { return ''; }})()}</td>
                                            <td className="py-2 pr-4">{g.is_active ? 'Yes' : 'No'}</td>
                                            <td className="py-2 pr-4 space-x-2">
                                                <Button variant="outline" size="sm" onClick={() => router.push(`/efiling/role-groups/${g.id}/edit`)}>Edit</Button>
                                                <Button variant="destructive" size="sm" onClick={() => handleDelete(g.id)}>Delete</Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    
                    {/* Pagination */}
                    {filteredRoleGroups.length > 0 && (
                        <div className="mt-4">
                            <Pagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                totalItems={filteredRoleGroups.length}
                                itemsPerPage={itemsPerPage}
                                onPageChange={handlePageChange}
                                onItemsPerPageChange={handleItemsPerPageChange}
                            />
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}


