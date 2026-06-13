import type { ProfileDocumentRecord, DevLenderProfile, DevRequestorProfile } from "../types";

export type SuperAdminUser = {
	role: "lender" | "requestor" | "super_admin";
	displayName?: string;
	email?: string;
	profileId: string;
	onboardingCompleted: boolean;
	documentCount: number;
	updatedAt: string;
	lenderProfile?: DevLenderProfile;
	requestorProfile?: DevRequestorProfile;
};

export type SuperAdminOverview = {
	totals: {
		users: number;
		lenders: number;
		borrowers: number;
		documents: number;
		pendingOnboarding: number;
	};
	refreshedAt: string;
	users: SuperAdminUser[];
	documents: ProfileDocumentRecord[];
};

export async function getSuperAdminOverview(): Promise<SuperAdminOverview> {
	// Attempt to read from backend admin endpoint if available; otherwise return empty overview.
	try {
		const res = await fetch("http://localhost:4000/api/v1/admin/overview");
		if (res.ok) {
			return (await res.json()) as SuperAdminOverview;
		}
	} catch {
		// ignore
	}

	return {
		totals: { users: 0, lenders: 0, borrowers: 0, documents: 0, pendingOnboarding: 0 },
		refreshedAt: new Date().toISOString(),
		users: [],
		documents: []
	};
}

export default getSuperAdminOverview;
