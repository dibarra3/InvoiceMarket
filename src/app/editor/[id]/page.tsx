import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getDocument, getCompany, listInventory } from "@/lib/actions";
import { EditorView } from "@/components/EditorView";

export const dynamic = "force-dynamic";

export default async function EditorDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [session, document, company, inventory] = await Promise.all([
    requireSession(),
    getDocument(id),
    getCompany(),
    listInventory(),
  ]);

  if (!document) notFound();

  return (
    <EditorView
      document={document}
      company={company}
      inventory={inventory}
      role={session.role}
    />
  );
}
