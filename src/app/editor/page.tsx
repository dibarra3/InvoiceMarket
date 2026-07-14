import { redirect } from "next/navigation";
import { createDocument } from "@/lib/actions";
import { DocumentType } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

/** Visiting /editor always starts a fresh blank invoice, mirroring the reference app's
 * default landing state and its "+ New Invoice" action. */
export default async function EditorEntryPage() {
  const id = await createDocument(DocumentType.INVOICE);
  redirect(`/editor/${id}`);
}
