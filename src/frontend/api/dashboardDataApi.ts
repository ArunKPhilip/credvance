import {
  getLenderDashboardDataFromFirestore,
  getRequestorDashboardDataFromFirestore,
  patchLenderDashboardDataInFirestore,
  patchRequestorDashboardDataInFirestore,
  resetLenderDashboardDataInFirestore,
  resetRequestorDashboardDataInFirestore,
  type LenderDashboardData,
  type RequestorDashboardData
} from "./firebaseService";

export async function getLenderDashboardData(profileId: string): Promise<LenderDashboardData> {
  return await getLenderDashboardDataFromFirestore(profileId);
}

export async function getRequestorDashboardData(profileId: string): Promise<RequestorDashboardData> {
  return await getRequestorDashboardDataFromFirestore(profileId);
}

export async function flushLenderDashboardData(profileId: string): Promise<LenderDashboardData> {
  return await resetLenderDashboardDataInFirestore(profileId);
}

export async function flushRequestorDashboardData(profileId: string): Promise<RequestorDashboardData> {
  return await resetRequestorDashboardDataInFirestore(profileId);
}

export async function patchLenderDashboardData(profileId: string, payload: Partial<LenderDashboardData>): Promise<void> {
  await patchLenderDashboardDataInFirestore(profileId, payload);
}

export async function patchRequestorDashboardData(profileId: string, payload: Partial<RequestorDashboardData>): Promise<void> {
  await patchRequestorDashboardDataInFirestore(profileId, payload);
}

export default getLenderDashboardData;