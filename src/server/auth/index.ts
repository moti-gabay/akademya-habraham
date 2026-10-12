import { SAMPLE_USER_ID } from "../mock/data";

// Always the sample user (mock data or a seeded database). Milestone 2 replaces this with verifyRequest(): Clerk claims → { userId, role, locale }.
export async function getCurrentUserId(): Promise<string> {
  return SAMPLE_USER_ID;
}
