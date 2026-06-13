import type { IntakeSubmissionPayload, IntakeSubmissionResponse } from "../types";

const BASE = "http://localhost:4000";

export async function submitIntakeSubmission(payload: IntakeSubmissionPayload): Promise<IntakeSubmissionResponse> {
	const res = await fetch(`${BASE}/api/v1/intake/contact`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload)
	});

	if (!res.ok) {
		throw new Error(`Submission failed: ${res.status}`);
	}

	return (await res.json()) as IntakeSubmissionResponse;
}

export default submitIntakeSubmission;
