/**
 * Cover letter → PDF, rendered server-side with @react-pdf/renderer.
 *
 * Single-page, clean serif typography, generous margins. The PDF is light
 * theme even when the app is in dark mode — it's a printable document.
 */
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    paddingTop: 64,
    paddingBottom: 64,
    paddingHorizontal: 72,
    fontFamily: "Helvetica",
    fontSize: 11,
    lineHeight: 1.5,
    color: "#0d0f12",
  },
  header: {
    marginBottom: 24,
  },
  name: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  meta: {
    fontSize: 9,
    color: "#6b7079",
  },
  hr: {
    borderBottomWidth: 1,
    borderBottomColor: "#d6dae1",
    marginVertical: 16,
  },
  paragraph: {
    marginBottom: 10,
  },
});

export type CoverLetterPdfProps = {
  candidateName?: string;
  candidateEmail?: string;
  company: string;
  role: string;
  generatedAt: string;
  /** The cover letter body as plain text or simple markdown. */
  body: string;
};

export function CoverLetterDocument(props: CoverLetterPdfProps) {
  // Light markdown normalization: strip leading/trailing whitespace per line,
  // collapse blank-line runs, split on blank lines for paragraphs.
  const paragraphs = props.body
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <Document title={`${props.company} — ${props.role} — Cover Letter`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          {props.candidateName && (
            <Text style={styles.name}>{props.candidateName}</Text>
          )}
          {props.candidateEmail && (
            <Text style={styles.meta}>{props.candidateEmail}</Text>
          )}
          <Text style={styles.meta}>
            For {props.company} — {props.role} ·{" "}
            {new Date(props.generatedAt).toLocaleDateString()}
          </Text>
        </View>
        <View style={styles.hr} />
        {paragraphs.map((p, i) => (
          <Text key={i} style={styles.paragraph}>
            {p}
          </Text>
        ))}
      </Page>
    </Document>
  );
}
