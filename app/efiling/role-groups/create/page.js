"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function CreateRoleGroupPage() {
    const router = useRouter();
    const [form, setForm] = useState({ name: '', code: '', description: '', is_active: true });
    const [roles, setRoles] = useState([]);
    const [selectedRoleCodes, setSelectedRoleCodes] = useState([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const loadRoles = async () => {
            try {
                const res = await fetch('/api/efiling/roles?is_active=true');
                if (res.ok) {
                    const data = await res.json();
                    setRoles(data.roles || []);
                }
            } catch (e) { console.error('Failed to load roles', e); }
        };
        loadRoles();
    }, []);

    const toggleRole = (code) => {
        setSelectedRoleCodes(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
    };

    const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

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
            const res = await fetch('/api/efiling/role-groups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (res.ok) router.push('/efiling/role-groups');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="container mx-auto px-4 py-6">
            <Card>
                <CardHeader>
                    <CardTitle>Create Role Group</CardTitle>
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
                                            onChange={() => toggleRole(r.code)}
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


