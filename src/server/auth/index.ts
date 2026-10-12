import { MOCK_USER_ID } from "../mock/data";

// Milestone 2 replaces this with verifyRequest(): Clerk claims → { userId, role, locale }.
export async function getCurrentUserId(): Promise<string> {
  return MOCK_USER_ID;
}
