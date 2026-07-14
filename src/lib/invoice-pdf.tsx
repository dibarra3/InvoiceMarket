import { Document as PdfDocument, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { money, formatDateDisplay, initials } from "./format";
import { computeTotals } from "./totals";
import type { DocumentRecord, CompanyRecord } from "./types";

const INK = "#1a1f18";
const MUTED = "#6b7060";
const FAINT = "#8a8f80";
const EMERALD = "#059669";
const RULE = "rgba(26,31,24,0.15)";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    color: INK,
    fontFamily: "Helvetica",
    backgroundColor: "#fbfaf6",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 2,
    borderBottomColor: RULE,
    paddingBottom: 18,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 6,
  },
  logoFallback: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: EMERALD,
    alignItems: "center",
    justifyContent: "center",
  },
  logoFallbackText: {
    color: "#ffffff",
    fontFamily: "Helvetica-Bold",
    fontSize: 14,
  },
  headerLeft: { flexDirection: "row", gap: 10, alignItems: "center" },
  companyName: { fontFamily: "Helvetica-Bold", fontSize: 14 },
  licensed: { fontSize: 8, color: MUTED, marginTop: 2 },
  docTypeLabel: { fontFamily: "Helvetica-Bold", fontSize: 18, color: "#047857", letterSpacing: 1.5 },
  docNumber: { fontSize: 9, color: MUTED, marginTop: 3, textAlign: "right" },
  billToDates: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 18 },
  sectionLabel: { fontSize: 8, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  billToName: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  billToAddr: { color: "#4a4f42", marginTop: 2 },
  datesBlock: { alignItems: "flex-end" },
  dateRow: { marginTop: 3, fontSize: 9 },
  table: { marginTop: 4 },
  tableHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 2,
    borderBottomColor: RULE,
    paddingBottom: 6,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(26,31,24,0.1)",
    paddingVertical: 7,
  },
  thLabel: { flex: 4, fontSize: 8, color: MUTED, textTransform: "uppercase" },
  thQty: { flex: 1, fontSize: 8, color: MUTED, textTransform: "uppercase", textAlign: "right" },
  thUnit: { flex: 1.2, fontSize: 8, color: MUTED, textTransform: "uppercase" },
  thRate: { flex: 1.4, fontSize: 8, color: MUTED, textTransform: "uppercase", textAlign: "right" },
  thAmount: { flex: 1.4, fontSize: 8, color: MUTED, textTransform: "uppercase", textAlign: "right" },
  tdLabel: { flex: 4 },
  tdQty: { flex: 1, textAlign: "right" },
  tdUnit: { flex: 1.2, color: MUTED },
  tdRate: { flex: 1.4, textAlign: "right" },
  tdAmount: { flex: 1.4, textAlign: "right", fontFamily: "Helvetica-Bold" },
  totalsWrap: { flexDirection: "row", justifyContent: "flex-end", paddingTop: 16 },
  totalsBox: { width: 220 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 5 },
  totalsMuted: { color: MUTED },
  discountRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 5, color: "#047857" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 2,
    borderTopColor: RULE,
    marginTop: 4,
    paddingTop: 8,
  },
  totalLabel: { fontFamily: "Helvetica-Bold" },
  totalPill: {
    backgroundColor: EMERALD,
    color: "#ffffff",
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  footerNote: {
    marginTop: 26,
    borderTopWidth: 1,
    borderTopColor: "rgba(26,31,24,0.2)",
    borderTopStyle: "dashed",
    paddingTop: 10,
    fontSize: 9,
    fontStyle: "italic",
    color: "#4a4f42",
  },
  footerTag: { marginTop: 16, textAlign: "center", fontSize: 8, color: FAINT },
  watermark: {
    position: "absolute",
    top: "40%",
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 90,
    fontFamily: "Helvetica-Bold",
    opacity: 0.08,
    transform: "rotate(-18deg)",
  },
});

function InvoicePdf({ doc, company }: { doc: DocumentRecord; company: CompanyRecord }) {
  const isEstimate = doc.type === "ESTIMATE";
  const totals = computeTotals(doc.lineItems, doc.discountPercent, doc.taxRate);
  const status = doc.status.toLowerCase();
  const showWatermark = status === "draft" || status === "paid";
  const watermarkText = status === "paid" ? "PAID" : "DRAFT";
  const watermarkColor = status === "paid" ? "#059669" : "#0f172a";
  const dateLabel = isEstimate ? "Estimate Date" : "Invoice Date";
  const dueDateLabel = isEstimate ? "Valid Until" : "Due Date";

  return (
    <PdfDocument>
      <Page size="LETTER" style={styles.page}>
        {showWatermark && (
          <Text style={{ ...styles.watermark, color: watermarkColor }}>{watermarkText}</Text>
        )}

        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {company.logoUrl ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image, not an HTML <img>
              <Image src={company.logoUrl} style={styles.logo} />
            ) : (
              <View style={styles.logoFallback}>
                <Text style={styles.logoFallbackText}>{initials(company.name)}</Text>
              </View>
            )}
            <View>
              <Text style={styles.companyName}>{company.name || "Your Company Name"}</Text>
              <Text style={styles.licensed}>Licensed &amp; Insured</Text>
            </View>
          </View>
          <View>
            <Text style={styles.docTypeLabel}>{isEstimate ? "ESTIMATE" : "INVOICE"}</Text>
            <Text style={styles.docNumber}>{doc.docNumber}</Text>
          </View>
        </View>

        <View style={styles.billToDates}>
          <View>
            <Text style={styles.sectionLabel}>Bill To</Text>
            <Text style={styles.billToName}>{doc.clientName || "No client yet"}</Text>
            <Text style={styles.billToAddr}>{doc.clientAddress || "—"}</Text>
          </View>
          <View style={styles.datesBlock}>
            <Text style={styles.dateRow}>
              <Text style={{ color: MUTED }}>{dateLabel}: </Text>
              {formatDateDisplay(doc.date)}
            </Text>
            <Text style={styles.dateRow}>
              <Text style={{ color: MUTED }}>{dueDateLabel}: </Text>
              {formatDateDisplay(doc.dueDate)}
            </Text>
            <Text style={styles.dateRow}>
              <Text style={{ color: MUTED }}>Status: </Text>
              {doc.status}
            </Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={styles.thLabel}>Description</Text>
            <Text style={styles.thQty}>Qty</Text>
            <Text style={styles.thUnit}>Unit</Text>
            <Text style={styles.thRate}>Rate</Text>
            <Text style={styles.thAmount}>Amount</Text>
          </View>
          {doc.lineItems.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={{ flex: 1, textAlign: "center", color: FAINT, fontStyle: "italic" }}>
                No line items
              </Text>
            </View>
          ) : (
            doc.lineItems.map((item) => (
              <View key={item.id} style={styles.tableRow}>
                <Text style={styles.tdLabel}>{item.label}</Text>
                <Text style={styles.tdQty}>{item.qty}</Text>
                <Text style={styles.tdUnit}>{item.unit}</Text>
                <Text style={styles.tdRate}>{money(item.rate)}</Text>
                <Text style={styles.tdAmount}>{money(item.qty * item.rate)}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.totalsWrap}>
          <View style={styles.totalsBox}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsMuted}>Subtotal</Text>
              <Text>{money(totals.subtotal)}</Text>
            </View>
            {doc.discountPercent > 0 && (
              <View style={styles.discountRow}>
                <Text>
                  {doc.discountLabel || "Discount"} ({doc.discountPercent}%)
                </Text>
                <Text>-{money(totals.discountAmount)}</Text>
              </View>
            )}
            <View style={styles.totalsRow}>
              <Text style={styles.totalsMuted}>Sales Tax ({doc.taxRate}%)</Text>
              <Text>{money(totals.taxAmount)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{isEstimate ? "Estimated Total" : "Total Due"}</Text>
              <Text style={styles.totalPill}>{money(totals.total)}</Text>
            </View>
          </View>
        </View>

        {doc.footerNote && <Text style={styles.footerNote}>{doc.footerNote}</Text>}
        <Text style={styles.footerTag}>Generated with Groundwork — thank you for your business.</Text>
      </Page>
    </PdfDocument>
  );
}

export async function renderInvoicePdf(doc: DocumentRecord, company: CompanyRecord): Promise<Buffer> {
  return renderToBuffer(<InvoicePdf doc={doc} company={company} />);
}
