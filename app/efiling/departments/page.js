"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DepartmentsIndexRedirect() {
	const router = useRouter();
	useEffect(() => {
		router.replace("/efiling/departments/manage");
	}, [router]);
	return null;
}
