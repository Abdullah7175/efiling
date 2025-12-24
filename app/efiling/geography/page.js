"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Navigation2, Users } from "lucide-react";

const links = [
    {
        href: "/efiling/zones",
        title: "Zones",
        description: "Define KW&SC zones to anchor top-level routing and SLA scope.",
        icon: <MapPin className="w-6 h-6 text-blue-600" />,
    },
    {
        href: "/efiling/divisions",
        title: "Divisions",
        description: "Manage division-level units linked to Bulk, Sewerage, Transmission, and WTM departments.",
        icon: <Navigation2 className="w-6 h-6 text-indigo-600" />,
    },
    {
        href: "/efiling/departments/locations",
        title: "Department Locations",
        description: "Map departments to zones, divisions, districts, and towns for filtering.",
        icon: <Navigation2 className="w-6 h-6 text-green-600" />,
    },
    {
        href: "/efiling/roles/locations",
        title: "Role Locations",
        description: "Restrict operational roles to the correct geography for file routing.",
        icon: <Users className="w-6 h-6 text-purple-600" />,
    },
    {
        href: "/efiling/role-groups/locations",
        title: "Role Group Locations",
        description: "Configure role group visibility for dashboards and pickers.",
        icon: <Users className="w-6 h-6 text-orange-600" />,
    },
];

export default function GeographyLandingPage() {
    return (
        <div className="container mx-auto px-4 py-6 space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-gray-900">Geography Management</h1>
                <p className="text-gray-600 max-w-3xl mt-2">
                    Maintain the zone, division, district, and town assignments that power geographic routing,
                    SLA selection, and filtered views across the e-filing module.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {links.map((item) => (
                    <Card key={item.href} className="h-full">
                        <CardHeader className="flex flex-row items-start gap-3">
                            {item.icon}
                            <div>
                                <CardTitle className="text-xl">{item.title}</CardTitle>
                                <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Button asChild>
                                <Link href={item.href}>Open {item.title}</Link>
                            </Button>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}

