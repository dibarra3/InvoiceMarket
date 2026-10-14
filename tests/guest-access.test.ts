import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ensureGuestAccess,
  findGuestInvoiceByToken,
  findGuestTokenByCode,
  rotateGuestAccess,
} from "@/lib/guest-access";
import { DocumentStatus } from "@/generated/prisma/enums";
import { RUN, cleanup, makeCompany, makeDocument } from "./fixtures";

describe("guest invoice access", () => {
  const sharedNumber = `INV-${RUN}`;
  let companyA: Awaited<ReturnType<typeof makeCompany>>;
  let companyB: Awaited<ReturnType<typeof makeCompany>>;
  let docA: Awaited<ReturnType<typeof makeDocument>>;
  let docB: Awaited<ReturnType<typeof makeDocument>>;

  beforeAll(async () => {
    companyA = await makeCompany("Alpha");
    companyB = await makeCompany("Bravo");
    // Two companies legitimately share an invoice number.
    docA = await makeDocument(companyA.id, { docNumber: sharedNumber, clientName: "Alice A" });
    docB = await makeDocument(companyB.id, { docNumber: sharedNumber, clientName: "Bob B" });
  });

  afterAll(cleanup);

  it("resolves the right company's invoice when invoice numbers collide", async () => {
    const accessA = await ensureGuestAccess(companyA.id, docA.id);
    const accessB = await ensureGuestAccess(companyB.id, docB.id);

    expect(await findGuestTokenByCode(sharedNumber, accessA.code)).toBe(accessA.token);
    expect(await findGuestTokenByCode(sharedNumber, accessB.code)).toBe(accessB.token);
    expect((await findGuestInvoiceByToken(accessA.token))?.clientName).toBe("Alice A");
    expect((await findGuestInvoiceByToken(accessB.token))?.clientName).toBe("Bob B");
  });

  it("never reveals an invoice from its number alone or with the wrong code", async () => {
    const accessA = await ensureGuestAccess(companyA.id, docA.id);
    expect(await findGuestTokenByCode(sharedNumber, "")).toBeNull();
    expect(await findGuestTokenByCode(sharedNumber, "AAAA-AAAA-AAAA")).toBeNull();
    expect(await findGuestTokenByCode("INV-0000", accessA.code)).toBeNull();
    expect(await findGuestInvoiceByToken("not-a-real-token")).toBeNull();
    expect(await findGuestInvoiceByToken("A".repeat(43))).toBeNull();
  });

  it("accepts the access code in a forgiving format", async () => {
    const { code, token } = await ensureGuestAccess(companyA.id, docA.id);
    const sloppy = ` ${code.toLowerCase().replace(/-/g, " ").replace(/0/g, "o")} `;
    expect(await findGuestTokenByCode(sharedNumber.toLowerCase(), sloppy)).toBe(token);
  });

  it("does not expose drafts by link or by code", async () => {
    const draft = await makeDocument(companyA.id, { status: DocumentStatus.DRAFT });
    const { token, code } = await ensureGuestAccess(companyA.id, draft.id);
    expect(await findGuestInvoiceByToken(token)).toBeNull();
    expect(await findGuestTokenByCode(draft.docNumber, code)).toBeNull();
  });

  it("returns stable credentials until rotated, and rotation kills the old ones", async () => {
    const doc = await makeDocument(companyA.id);
    const first = await ensureGuestAccess(companyA.id, doc.id);
    expect(await ensureGuestAccess(companyA.id, doc.id)).toEqual(first);

    const rotated = await rotateGuestAccess(companyA.id, doc.id);
    expect(rotated.token).not.toBe(first.token);
    expect(await findGuestInvoiceByToken(first.token)).toBeNull();
    expect(await findGuestTokenByCode(doc.docNumber, first.code)).toBeNull();
    expect(await findGuestTokenByCode(doc.docNumber, rotated.code)).toBe(rotated.token);
  });

  it("only lets the owning company read or rotate a document's access details", async () => {
    await expect(ensureGuestAccess(companyB.id, docA.id)).rejects.toThrow(/not found/);
    await expect(rotateGuestAccess(companyB.id, docA.id)).rejects.toThrow(/not found/);
  });

  it("hides internal job notes from the guest view", async () => {
    const doc = await makeDocument(companyA.id, { notesText: "dog bites, use side gate" });
    const { token } = await ensureGuestAccess(companyA.id, doc.id);
    const invoice = await findGuestInvoiceByToken(token);
    expect(JSON.stringify(invoice)).not.toContain("dog bites");
  });
});
