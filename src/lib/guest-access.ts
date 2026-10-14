import { prisma } from "./prisma";
import { CODE_LENGTH, formatCode, generateCode, generateToken, isPlausibleToken, normalizeCode } from "./access-codes";
import { CLIENT_VISIBLE_STATUSES, publicDocumentInclude, toPublicInvoice, type PublicInvoice } from "./public-invoice";

export type GuestAccess = { token: string; code: string };

/** Returns the document's guest link token and access code, generating them on first use.
 * Scoped to `companyId` so an owner can only ever see their own documents' credentials. */
export async function ensureGuestAccess(companyId: string, documentId: string): Promise<GuestAccess> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, companyId },
    select: { guestToken: true, guestAccessCode: true },
  });
  if (!doc) throw new Error("Document not found");
  if (doc.guestToken && doc.guestAccessCode) {
    return { token: doc.guestToken, code: formatCode(doc.guestAccessCode) };
  }

  // Compare-and-set on `guestToken: null` so two concurrent callers can't each hand out a
  // different code; whoever loses just re-reads the winner's values.
  await prisma.document.updateMany({
    where: { id: documentId, companyId, guestToken: null },
    data: { guestToken: generateToken(), guestAccessCode: generateCode() },
  });
  const updated = await prisma.document.findFirstOrThrow({
    where: { id: documentId, companyId },
    select: { guestToken: true, guestAccessCode: true },
  });
  return { token: updated.guestToken!, code: formatCode(updated.guestAccessCode!) };
}

/** Issues a fresh token + code, immediately invalidating any previously shared link/code. */
export async function rotateGuestAccess(companyId: string, documentId: string): Promise<GuestAccess> {
  const token = generateToken();
  const code = generateCode();
  const { count } = await prisma.document.updateMany({
    where: { id: documentId, companyId },
    data: { guestToken: token, guestAccessCode: code },
  });
  if (count === 0) throw new Error("Document not found");
  return { token, code: formatCode(code) };
}

/** Resolves an unguessable invoice link. Drafts are never exposed. */
export async function findGuestInvoiceByToken(token: string): Promise<PublicInvoice | null> {
  if (!isPlausibleToken(token)) return null;
  const doc = await prisma.document.findFirst({
    where: { guestToken: token, status: { in: CLIENT_VISIBLE_STATUSES } },
    include: publicDocumentInclude,
  });
  return doc ? toPublicInvoice(doc) : null;
}

/** Invoice number + access code lookup for /pay. The code (globally unique) identifies the
 * document; the invoice number must also match, so neither works alone and two companies
 * sharing an invoice number can't collide. Returns the link token to redirect to. */
export async function findGuestTokenByCode(docNumber: string, code: string): Promise<string | null> {
  const normalizedCode = normalizeCode(code);
  const normalizedNumber = docNumber.trim().toUpperCase();
  if (normalizedCode.length !== CODE_LENGTH || !normalizedNumber) return null;

  const doc = await prisma.document.findUnique({
    where: { guestAccessCode: normalizedCode },
    select: { docNumber: true, guestToken: true, status: true },
  });
  if (!doc?.guestToken) return null;
  if (!CLIENT_VISIBLE_STATUSES.includes(doc.status)) return null;
  if (doc.docNumber.trim().toUpperCase() !== normalizedNumber) return null;
  return doc.guestToken;
}
