"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function EditRoleGroupPage() {
    const params = useParams();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ name: '', code: '', description: '', is_active: true });
    const [roles, setRoles] = useState([]);
    const [selectedRoleCodes, setSelectedRoleCodes] = useState([]);

    const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const rolesRes = await fetch('/api/efiling/roles?is_active=true');
                if (rolesRes.ok) {
                    const r = await rolesRes.json();
                    setRoles(r.roles || []);
                }
                const res = await fetch(`/api/efiling/role-groups?id=${params.id}`);
                if (res.ok) {
                    const g = await res.json();
                    const patterns = Array.isArray(g.role_codes) ? g.role_codes : ( ()=>{ try { return JSON.parse(g.role_codes||'[]'); } catch { return []; } })();
                    setForm({
                        name: g.name || '',
                        code: g.code || '',
                        description: g.description || '',
                        is_active: !!g.is_active
                    });
                    setSelectedRoleCodes(patterns);
                }
            } finally {
                setLoading(false);
            }
        };
        if (params.id) load();
    }, [params.id]);

    const onSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const body = {
                name: form.name,
                code: form.code,
                description: form.description || null,
                role_codes: selectedRoleCodes,
                is_active: !!form.is_active
            };
            const res = await fetch(`/api/efiling/role-groups?id=${params.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (res.ok) router.push('/efiling/role-groups');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-6">Loading...</div>;

    return (
        <div className="container mx-auto px-4 py-6">
            <Card>
                <CardHeader>
                    <CardTitle>Edit Role Group</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={onSubmit} className="space-y-4">
                        <div>
                            <Label>Name</Label>
                            <Input value={form.name} onChange={(e) => handleChange('name', e.target.value)} required />
                        </div>
                        <div>
                            <Label>Code</Label>
                            <Input value={form.code} onChange={(e) => handleChange('code', e.target.value)} required />
                        </div>
                        <div>
                            <Label>Description</Label>
                            <Textarea value={form.description} onChange={(e) => handleChange('description', e.target.value)} rows={3} />
                        </div>
                        <div>
                            <Label>Select Roles (multi-select)</Label>
                            <div className="max-h-64 overflow-y-auto border rounded p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                                {roles.map((r) => (
                                    <label key={r.id} className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4"
                                            checked={selectedRoleCodes.includes(r.code)}
                                            onChange={() => setSelectedRoleCodes(prev => prev.includes(r.code) ? prev.filter(c => c !== r.code) : [...prev, r.code])}
                                        />
                                        <span>{r.name} ({r.code})</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div className="flex gap-2 justify-end">
                            <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
                            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}


