import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { DocumentStatus, DocumentType, Role } from "../src/generated/prisma/enums";

const prisma = new PrismaClient();

const DEMO_EMAIL = "demo@groundwork.test";
const DEMO_PASSWORD = "groundwork-demo";
const CREW_EMAIL = "crew@groundwork.test";
const CREW_PASSWORD = "groundwork-crew";

const INVENTORY = [
  {
    key: "sod_bermuda",
    label: "Bermuda Sod",
    unit: "pallet",
    rate: 150,
    matchTerm: String.raw`pallets?\s+of\s+bermuda\s*sod`,
  },
  {
    key: "sod_augustine",
    label: "St. Augustine Sod",
    unit: "pallet",
    rate: 175,
    matchTerm: String.raw`pallets?\s+of\s+st\.?\s*augustine\s*sod`,
  },
  {
    key: "labor",
    label: "Labor",
    unit: "hour",
    rate: 75,
    matchTerm: String.raw`(?:hours?|hrs?)\s*(?:of\s+)?labor`,
  },
  {
    key: "mulch",
    label: "Mulch",
    unit: "yard",
    rate: 45,
    matchTerm: String.raw`yards?\s+of\s+mulch`,
  },
  {
    key: "topsoil",
    label: "Topsoil",
    unit: "yard",
    rate: 40,
    matchTerm: String.raw`yards?\s+of\s+topsoil`,
  },
  {
    key: "paver",
    label: "Paver Installation",
    unit: "sq ft",
    rate: 12,
    matchTerm: String.raw`sq\.?\s*ft\.?\s+of\s+pavers?`,
  },
  {
    key: "irrigation",
    label: "Irrigation Head",
    unit: "each",
    rate: 25,
    matchTerm: String.raw`irrigation\s*heads?`,
  },
  {
    key: "mowing",
    label: "Mowing Service",
    unit: "visit",
    rate: 60,
    matchTerm: String.raw`mowing\s*(?:visits?|services?)`,
  },
];

async function main() {
  console.log("Seeding demo company + user…");
  const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  let companyId: string;

  if (user) {
    companyId = user.companyId;
  } else {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
    const company = await prisma.company.create({
      data: {
        name: "Cascade Grounds & Excavation",
        defaultTaxRate: 8.25,
        defaultFooter: "Thanks for the business — see you next season.",
        nextInvoiceSeq: 1042,
        nextEstimateSeq: 1039,
        users: { create: { email: DEMO_EMAIL, passwordHash } },
      },
    });
    companyId = company.id;
    console.log(`Demo owner login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);

    const crewPasswordHash = await bcrypt.hash(CREW_PASSWORD, 12);
    await prisma.user.create({
      data: { email: CREW_EMAIL, passwordHash: crewPasswordHash, role: Role.FIELD_CREW, companyId },
    });
    console.log(`Demo field crew login: ${CREW_EMAIL} / ${CREW_PASSWORD}`);
  }

  console.log("Seeding inventory price list…");
  for (const item of INVENTORY) {
    await prisma.inventoryItem.upsert({
      where: { companyId_key: { companyId, key: item.key } },
      update: item,
      create: { ...item, companyId },
    });
  }

  console.log("Seeding clients…");
  const clientsData = [
    { name: "Jones", address: "123 Main St", email: "jones@example.com" },
    { name: "Nguyen", address: "88 Ridgeline Dr", email: "nguyen@example.com" },
    { name: "Patterson", address: "4521 Oakwood Ct", email: "patterson@example.com" },
    { name: "Alvarez", address: "17 Birchwood Ln", email: "alvarez@example.com" },
  ];
  const clients: Record<string, string> = {};
  for (const c of clientsData) {
    const existing = await prisma.client.findFirst({ where: { companyId, name: c.name } });
    const client =
      existing ??
      (await prisma.client.create({
        data: { ...c, companyId },
      }));
    clients[c.name] = client.id;
  }

  console.log("Seeding sample documents…");
  const existingDocCount = await prisma.document.count({ where: { companyId } });
  if (existingDocCount === 0) {
    const footerNote = "Thanks for the business — see you next season.";

    await prisma.document.create({
      data: {
        companyId,
        type: DocumentType.INVOICE,
        docNumber: "INV-1041",
        status: DocumentStatus.PAID,
        date: new Date("2026-07-02"),
        dueDate: new Date("2026-07-17"),
        clientId: clients["Jones"],
        clientName: "Jones",
        clientAddress: "123 Main St",
        clientEmail: "jones@example.com",
        discountPercent: 10,
        discountLabel: "Military Discount",
        taxRate: 8.25,
        footerNote,
        paidAt: new Date("2026-07-05"),
        lineItems: {
          create: [
            { label: "Bermuda Sod", qty: 3, unit: "pallet", rate: 150, sortOrder: 0 },
            { label: "Labor", qty: 4, unit: "hour", rate: 75, sortOrder: 1 },
          ],
        },
      },
    });

    await prisma.document.create({
      data: {
        companyId,
        type: DocumentType.INVOICE,
        docNumber: "INV-1040",
        status: DocumentStatus.SENT,
        date: new Date("2026-06-28"),
        dueDate: new Date("2026-07-13"),
        clientId: clients["Nguyen"],
        clientName: "Nguyen",
        clientAddress: "88 Ridgeline Dr",
        clientEmail: "nguyen@example.com",
        taxRate: 8.25,
        footerNote,
        lineItems: {
          create: [
            { label: "Mulch", qty: 6, unit: "yard", rate: 45, sortOrder: 0 },
            { label: "Topsoil", qty: 2, unit: "yard", rate: 40, sortOrder: 1 },
            { label: "Labor", qty: 5, unit: "hour", rate: 75, sortOrder: 2 },
          ],
        },
      },
    });

    await prisma.document.create({
      data: {
        companyId,
        type: DocumentType.INVOICE,
        docNumber: "INV-1039",
        status: DocumentStatus.PAID,
        date: new Date("2026-06-21"),
        dueDate: new Date("2026-07-06"),
        clientId: clients["Patterson"],
        clientName: "Patterson",
        clientAddress: "4521 Oakwood Ct",
        clientEmail: "patterson@example.com",
        discountPercent: 15,
        discountLabel: "Repeat Customer Discount",
        taxRate: 8.25,
        footerNote,
        paidAt: new Date("2026-06-25"),
        lineItems: {
          create: [
            { label: "Paver Installation", qty: 200, unit: "sq ft", rate: 12, sortOrder: 0 },
            { label: "Irrigation Head", qty: 6, unit: "each", rate: 25, sortOrder: 1 },
          ],
        },
      },
    });

    await prisma.document.create({
      data: {
        companyId,
        type: DocumentType.ESTIMATE,
        docNumber: "EST-1038",
        status: DocumentStatus.DRAFT,
        date: new Date("2026-06-14"),
        dueDate: new Date("2026-06-29"),
        clientId: clients["Alvarez"],
        clientName: "Alvarez",
        clientAddress: "17 Birchwood Ln",
        clientEmail: "alvarez@example.com",
        taxRate: 8.25,
        footerNote,
        lineItems: {
          create: [
            { label: "Mowing Service", qty: 1, unit: "visit", rate: 60, sortOrder: 0 },
            { label: "Labor", qty: 4, unit: "hour", rate: 75, sortOrder: 1 },
          ],
        },
      },
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
