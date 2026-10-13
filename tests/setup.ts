import { vi } from "vitest";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.STRIPE_SECRET_KEY = "sk_test_vitest_dummy";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_vitest_dummy";
process.env.NEXT_PUBLIC_APP_URL = "https://groundwork.test";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
