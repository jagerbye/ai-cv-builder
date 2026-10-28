import { createElement as h } from 'react';
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { fileURLToPath } from 'node:url';
import type { CvEducation, CvExperience, CvResponse } from '../cv/types.js';

// T-19 (CVB-18), F-007, ADR-005. Server-side A4 PDF with a real text layer.
// The CV is read through core/cv/read.ts (getCv); this module only lays it out.
// Fonts are Liberation Sans (SIL OFL 1.1, see api/assets/fonts/LICENSE_LIBERATION):
// Latin-1 supplement, Cyrillic and typographic punctuation are covered.

const A4: [number, number] = [595, 842];
// 15 mm is 42.5 pt; 43 pt keeps every margin at or above the F-007 floor.
const MARGIN = 43;
const FAMILY = 'LiberationSans';
const FONT_DIR = fileURLToPath(new URL('../../../assets/fonts/', import.meta.url));

let fontsRegistered = false;

function registerFonts(): void {
  if (fontsRegistered) return;
  Font.register({
    family: FAMILY,
    fonts: [
      { src: `${FONT_DIR}LiberationSans-Regular.ttf`, fontWeight: 400 },
      { src: `${FONT_DIR}LiberationSans-Bold.ttf`, fontWeight: 700 },
    ],
  });
  fontsRegistered = true;
}

const styles = StyleSheet.create({
  page: {
    paddingTop: MARGIN,
    paddingBottom: MARGIN,
    paddingLeft: MARGIN,
    paddingRight: MARGIN,
    fontFamily: FAMILY,
    fontSize: 10,
    lineHeight: 1.35,
    color: '#111111',
  },
  name: { fontSize: 20, fontWeight: 700 },
  role: { fontSize: 11, marginTop: 2 },
  contact: { fontSize: 9, marginTop: 4, color: '#444444' },
  section: { marginTop: 14 },
  heading: {
    fontSize: 11,
    fontWeight: 700,
    borderBottomWidth: 0.5,
    borderBottomColor: '#999999',
    paddingBottom: 2,
    marginBottom: 6,
  },
  entry: { marginBottom: 8 },
  bold: { fontWeight: 700 },
  meta: { fontSize: 9, color: '#444444', marginBottom: 3 },
  bullet: { flexDirection: 'row', marginLeft: 4, marginBottom: 2 },
  bulletMark: { width: 10 },
  bulletText: { flex: 1 },
  paragraph: {},
});

function nonEmpty(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

function experienceBlock(entry: CvExperience) {
  const bullets = entry.bullets.filter((b) => nonEmpty(b.text));
  return h(
    View,
    { key: entry.id, style: styles.entry },
    h(Text, { style: styles.bold, wrap: false }, entry.role),
    h(Text, { style: styles.meta, wrap: false }, [entry.employer, entry.period].filter(nonEmpty).join(' | ')),
    ...bullets.map((b) =>
      h(
        View,
        { key: b.id, style: styles.bullet },
        h(Text, { style: styles.bulletMark }, '•'),
        h(Text, { style: styles.bulletText }, b.text),
      ),
    ),
  );
}

function educationBlock(entry: CvEducation) {
  return h(
    View,
    { key: entry.id, style: styles.entry },
    h(Text, { style: styles.bold, wrap: false }, entry.institution),
    h(Text, { style: styles.meta, wrap: false }, [entry.degree, entry.period].filter(nonEmpty).join(' | ')),
  );
}

function section(title: string, children: ReturnType<typeof h>[]) {
  return h(
    View,
    { style: styles.section },
    h(Text, { style: styles.heading, wrap: false, minPresenceAhead: 40 }, title),
    ...children,
  );
}

function buildDocument(cv: CvResponse) {
  const contact = cv.contact;
  const contactLine = [contact.email, contact.phone, contact.location, ...contact.links]
    .filter(nonEmpty)
    .join(' | ');
  const summaryText = cv.summary?.text ?? '';
  const experience = cv.experience.filter((e) => nonEmpty(e.role) || nonEmpty(e.employer));
  const education = cv.education.filter((e) => nonEmpty(e.institution));
  const skills = cv.skills.map((s) => s.name).filter(nonEmpty);

  const body = [
    contact.fullName && nonEmpty(contact.fullName) ? h(Text, { key: 'name', style: styles.name }, contact.fullName) : null,
    nonEmpty(cv.targetRole) ? h(Text, { key: 'role', style: styles.role }, cv.targetRole) : null,
    contactLine ? h(Text, { key: 'contact', style: styles.contact }, contactLine) : null,
    nonEmpty(summaryText)
      ? section('Summary', [h(Text, { key: 'summary', style: styles.paragraph }, summaryText)])
      : null,
    experience.length > 0
      ? section('Experience', experience.map(experienceBlock))
      : null,
    education.length > 0 ? section('Education', education.map(educationBlock)) : null,
    skills.length > 0
      ? section('Skills', [h(Text, { key: 'skills', style: styles.paragraph }, skills.join(', '))])
      : null,
  ];

  return h(
    Document,
    { title: cv.title || contact.fullName || 'CV', author: contact.fullName || undefined },
    h(Page, { size: A4, style: styles.page }, ...body),
  );
}

// Returns the PDF bytes. Pagination is react-pdf's: long sections flow onto the next
// page inside the margins, and a heading is not left alone at a page foot.
export async function renderCvPdf(cv: CvResponse): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(buildDocument(cv));
}
