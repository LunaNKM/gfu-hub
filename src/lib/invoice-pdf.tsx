import {
  Document,
  Font,
  Image as PdfImage,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";

let fontsRegistered = false;
function ensureFonts() {
  if (fontsRegistered) return;
  fontsRegistered = true;
  Font.register({
    family: "Pretendard",
    fonts: [
      { src: "/fonts/Pretendard-Regular.otf", fontWeight: "normal" },
      { src: "/fonts/Pretendard-SemiBold.otf", fontWeight: 600 },
      { src: "/fonts/Pretendard-Bold.otf", fontWeight: "bold" },
    ],
  });
}

export type InvoiceItem = {
  name: string;
  unitPrice: number;
  quantity: string;
  amount: number;
};

export type InvoiceData = {
  no: string;
  code: string;
  buyerName: string;
  buyerAddress: string;
  campaignTitle: string;
  items: InvoiceItem[];
};

/** 지퓨처스 자체 정보 — 견적서 템플릿 기준으로 고정. */
const GF_NAME = "주식회사 지퓨처스";
const GF_ADDRESS = "서울 마포구 독막로 18, 합정하이팍 5층";
const GF_BANK_INFO = [
  "[지퓨처스 은행 정보]",
  "",
  "- 수취인: (주)지퓨처스",
  "- 거래은행: KB 국민은행",
  "- 계좌정보: 479001-01-291017",
];

const won = (value: number) => `₩${Math.round(value).toLocaleString("ko-KR")}`;

const styles = StyleSheet.create({
  page: {
    fontFamily: "Pretendard",
    fontSize: 9,
    color: "#1a1a1a",
    padding: 28,
  },
  box: {
    border: "1pt solid #999999",
  },
  header: {
    backgroundColor: "#434343",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    padding: "14pt 16pt",
  },
  headerTitle: {
    color: "#ffffff",
    fontSize: 26,
    fontWeight: "bold",
  },
  headerMeta: {
    alignItems: "flex-end",
  },
  headerMetaText: {
    color: "#ffffff",
    fontSize: 9,
  },
  infoRow: {
    flexDirection: "row",
    borderBottom: "1pt solid #cccccc",
  },
  infoRowLast: {
    borderBottom: "1pt solid #999999",
  },
  infoLabel: {
    width: 70,
    backgroundColor: "#d9d9d9",
    fontWeight: "bold",
    fontSize: 8,
    textAlign: "center",
    justifyContent: "center",
    padding: "6pt 4pt",
  },
  infoValue: {
    flex: 1,
    backgroundColor: "#f3f3f3",
    fontSize: 8,
    justifyContent: "center",
    padding: "6pt 8pt",
  },
  spacer: {
    height: 10,
  },
  statement: {
    textAlign: "center",
    fontWeight: "bold",
    fontSize: 9,
    padding: "8pt 0",
  },
  sectionLabel: {
    backgroundColor: "#434343",
    color: "#ffffff",
    fontWeight: "bold",
    fontSize: 9,
    textAlign: "center",
    padding: "6pt 0",
  },
  tableHeadRow: {
    flexDirection: "row",
    backgroundColor: "#efefef",
    borderBottom: "1pt solid #999999",
  },
  tableRow: {
    flexDirection: "row",
    borderBottom: "1pt solid #cccccc",
  },
  cellItem: { flex: 2.4, padding: "6pt 4pt", textAlign: "center" },
  cellPrice: { flex: 1.8, padding: "6pt 4pt", textAlign: "center" },
  cellQty: { flex: 1.4, padding: "6pt 4pt", textAlign: "center" },
  cellAmount: { flex: 2, padding: "6pt 4pt", textAlign: "center" },
  headCellText: { fontWeight: "bold", fontSize: 8.5 },
  totalRow: {
    flexDirection: "row",
    borderBottom: "1pt solid #cccccc",
  },
  subtotalRow: {
    borderTop: "2pt solid #333333",
  },
  totalLabel: {
    flex: 5.6,
    fontWeight: "bold",
    fontSize: 8.5,
    textAlign: "center",
    padding: "6pt 0",
  },
  totalValue: {
    flex: 2,
    fontSize: 8.5,
    textAlign: "center",
    padding: "6pt 0",
  },
  grandTotalRow: {
    backgroundColor: "#f3f3f3",
  },
  grandTotalText: {
    fontWeight: "bold",
  },
  bankBox: {
    borderTop: "1pt solid #999999",
    padding: "10pt 12pt",
    fontSize: 8,
    lineHeight: 1.5,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginTop: 16,
  },
  footerText: {
    fontWeight: "bold",
    fontSize: 11,
  },
  stamp: {
    width: 34,
    height: 34,
    marginLeft: -14,
  },
});

function InvoiceDocument({ data }: { data: InvoiceData }) {
  const subtotal = data.items.reduce((sum, item) => sum + item.amount, 0);
  const vat = subtotal * 0.1;
  const total = subtotal + vat;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.box}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Invoice</Text>
            <View style={styles.headerMeta}>
              <Text style={styles.headerMetaText}>No. {data.no}</Text>
              <Text style={styles.headerMetaText}>{data.code}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>회사명</Text>
            <Text style={styles.infoValue}>{data.buyerName}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>주소</Text>
            <Text style={styles.infoValue}>{data.buyerAddress}</Text>
          </View>

          <View style={styles.spacer} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>회사명</Text>
            <Text style={styles.infoValue}>{GF_NAME}</Text>
          </View>
          <View style={[styles.infoRow, styles.infoRowLast]}>
            <Text style={styles.infoLabel}>주소</Text>
            <Text style={styles.infoValue}>{GF_ADDRESS}</Text>
          </View>

          <Text style={styles.statement}>하기 항목으로 견적서 전달 드립니다.</Text>

          <Text style={styles.sectionLabel}>{data.campaignTitle}</Text>

          <View style={styles.tableHeadRow}>
            <Text style={[styles.cellItem, styles.headCellText]}>항목</Text>
            <Text style={[styles.cellPrice, styles.headCellText]}>단가</Text>
            <Text style={[styles.cellQty, styles.headCellText]}>수량</Text>
            <Text style={[styles.cellAmount, styles.headCellText]}>금액</Text>
          </View>
          {data.items.map((item, index) => (
            <View style={styles.tableRow} key={index}>
              <Text style={styles.cellItem}>{item.name}</Text>
              <Text style={styles.cellPrice}>{won(item.unitPrice)}</Text>
              <Text style={styles.cellQty}>{item.quantity}</Text>
              <Text style={styles.cellAmount}>{won(item.amount)}</Text>
            </View>
          ))}

          <View style={[styles.totalRow, styles.subtotalRow]}>
            <Text style={styles.totalLabel}>소   계</Text>
            <Text style={styles.totalValue}>{won(subtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>부가세</Text>
            <Text style={styles.totalValue}>{won(vat)}</Text>
          </View>
          <View style={[styles.totalRow, styles.grandTotalRow]}>
            <Text style={[styles.totalLabel, styles.grandTotalText]}>합   계</Text>
            <Text style={[styles.totalValue, styles.grandTotalText]}>{won(total)}</Text>
          </View>

          <View style={styles.bankBox}>
            {GF_BANK_INFO.map((line, index) => (
              <Text key={index}>{line || " "}</Text>
            ))}
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>G-FUTURES INC.</Text>
          <PdfImage style={styles.stamp} src="/images/invoice-stamp.png" />
        </View>
      </Page>
    </Document>
  );
}

export async function downloadInvoicePdf(data: InvoiceData) {
  ensureFonts();
  const blob = await pdf(<InvoiceDocument data={data} />).toBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Invoice_${data.no}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
