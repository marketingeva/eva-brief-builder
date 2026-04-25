import jsPDF from 'jspdf';
import { supabase } from '@/integrations/supabase/client';

interface Row {
  id: string;
  functies: string[] | null;
  locaties: string[] | null;
  hook: string | null;
  usps: string | null;
  omschrijving: string | null;
  vacature_url: string | null;
  creative_image_paths: string[] | null;
  sort_order: number | null;
}

interface ClientBlock {
  clientName: string;
  status: string;
  rows: Row[];
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Concept',
  in_review: 'In Review',
  approved: 'Goedgekeurd',
};

// Match app palette — sidebar deep purple as brand anchor (no yellow)
const C = {
  ink: [24, 22, 32] as [number, number, number],
  body: [60, 58, 70] as [number, number, number],
  muted: [128, 124, 138] as [number, number, number],
  subtle: [170, 166, 178] as [number, number, number],
  border: [232, 228, 222] as [number, number, number],
  divider: [240, 236, 230] as [number, number, number],
  bg: [251, 249, 245] as [number, number, number],       // warm off-white
  card: [255, 254, 251] as [number, number, number],
  brand: [42, 24, 57] as [number, number, number],       // sidebar deep purple
  brandLight: [225, 215, 234] as [number, number, number],
  primary: [101, 43, 151] as [number, number, number],   // primary purple
  primarySoft: [240, 234, 246] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  success: [34, 139, 92] as [number, number, number],
};

// Page geometry (A4 landscape)
const PAGE = { w: 297, h: 210, margin: 14 };

async function fetchImageDataUrl(path: string): Promise<{ data: string; w: number; h: number; fmt: 'PNG' | 'JPEG' } | null> {
  try {
    const { data } = await supabase.storage.from('briefing-assets').createSignedUrl(path, 600);
    if (!data?.signedUrl) return null;
    const res = await fetch(data.signedUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 1, h: 1 });
      img.src = dataUrl;
    });
    const fmt: 'PNG' | 'JPEG' = dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    return { data: dataUrl, w: dims.w, h: dims.h, fmt };
  } catch {
    return null;
  }
}

// ---- helpers ----
const setFill = (doc: jsPDF, c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
const setDraw = (doc: jsPDF, c: [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2]);
const setText = (doc: jsPDF, c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);

function paintBackground(doc: jsPDF) {
  setFill(doc, C.bg);
  doc.rect(0, 0, PAGE.w, PAGE.h, 'F');
}

// Map-pin icon — vector approximation of Lucide MapPin, drawn at (cx, baselineY)
// `size` is the icon height in mm.
function drawMapPin(doc: jsPDF, cx: number, cy: number, size: number, color: [number, number, number]) {
  setDraw(doc, color);
  setFill(doc, color);
  doc.setLineWidth(size * 0.12);
  // Teardrop body (circle on top + triangle to tip)
  const r = size * 0.34;
  const topY = cy - size * 0.5 + r;       // center of circle
  const tipY = cy + size * 0.5;
  doc.circle(cx, topY, r, 'F');
  // Triangle from circle bottom to tip
  const baseY = topY + r * 0.55;
  doc.triangle(cx - r * 0.85, baseY, cx + r * 0.85, baseY, cx, tipY, 'F');
  // Inner dot (cut-out look)
  setFill(doc, C.white);
  doc.circle(cx, topY, r * 0.42, 'F');
}

function drawPageChrome(doc: jsPDF, week: number, year: number, clientName?: string) {
  // Slim deep-purple top bar (no yellow)
  setFill(doc, C.brand);
  doc.rect(0, 0, PAGE.w, 4, 'F');

  // Header text
  setText(doc, C.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Briefing · Week ${week} · ${year}`, PAGE.margin, 10);
  if (clientName) {
    doc.text(clientName, PAGE.w - PAGE.margin, 10, { align: 'right' });
  }

  // Footer
  const pn = doc.getNumberOfPages();
  setText(doc, C.subtle);
  doc.setFontSize(7.5);
  doc.text('Eva AI Marketeer', PAGE.margin, PAGE.h - 6);
  doc.text(`Pagina ${pn}`, PAGE.w - PAGE.margin, PAGE.h - 6, { align: 'right' });
}

function drawCover(doc: jsPDF, week: number, year: number, clientCount: number, rowCount: number) {
  paintBackground(doc);
  // Deep-purple brand block (sidebar color)
  setFill(doc, C.brand);
  doc.rect(0, 0, PAGE.w, 112, 'F');

  // Eyebrow
  setText(doc, C.brandLight);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('WEEKBRIEFING', PAGE.margin, 38);

  // Title
  setText(doc, C.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(56);
  doc.text(`Week ${week}`, PAGE.margin, 72);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(16);
  setText(doc, C.brandLight);
  doc.text(`${year}`, PAGE.margin, 88);

  // Stats card on the right
  const cardW = 110;
  const cardH = 64;
  const cardX = PAGE.w - PAGE.margin - cardW;
  const cardY = 30;
  setFill(doc, C.white);
  doc.roundedRect(cardX, cardY, cardW, cardH, 3, 3, 'F');

  setText(doc, C.muted);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('OVERZICHT', cardX + 8, cardY + 11);

  setText(doc, C.ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.text(String(clientCount), cardX + 8, cardY + 32);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setText(doc, C.muted);
  doc.text(clientCount === 1 ? 'klant' : 'klanten', cardX + 8, cardY + 39);

  setText(doc, C.ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.text(String(rowCount), cardX + 60, cardY + 32);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setText(doc, C.muted);
  doc.text('totaal aantal advertenties', cardX + 60, cardY + 39);

  // Divider
  setDraw(doc, [230, 230, 230]);
  doc.setLineWidth(0.2);
  doc.line(cardX + 8, cardY + 46, cardX + cardW - 8, cardY + 46);

  setText(doc, C.muted);
  doc.setFontSize(8);
  doc.text(
    `Geëxporteerd op ${new Date().toLocaleDateString('nl-NL', { day: '2-digit', month: 'long', year: 'numeric' })}`,
    cardX + 8,
    cardY + 56
  );

  // Subtitle below brand block
  setText(doc, C.body);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('Briefing voor de grafisch vormgever', PAGE.margin, 128);
  setText(doc, C.muted);
  doc.setFontSize(9);
  doc.text(
    'Per klant: rij-overzicht met functie, locatie, hook, USP\'s, omschrijving en creatieve inspiratie.',
    PAGE.margin,
    135
  );
}

function drawClientHeader(doc: jsPDF, name: string, status: string, rowCount: number, y: number): number {
  const h = 14;
  setFill(doc, C.white);
  setDraw(doc, C.border);
  doc.setLineWidth(0.2);
  doc.roundedRect(PAGE.margin, y, PAGE.w - PAGE.margin * 2, h, 2, 2, 'FD');

  // Accent bar
  setFill(doc, C.brand);
  doc.roundedRect(PAGE.margin, y, 1.6, h, 0.8, 0.8, 'F');

  setText(doc, C.ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(name, PAGE.margin + 6, y + 9);

  // Row count
  setText(doc, C.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const rowText = `${rowCount} ${rowCount === 1 ? 'rij' : 'rijen'}`;
  const rowTextW = doc.getTextWidth(rowText);

  // Status pill (right)
  const label = STATUS_LABEL[status] || status;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  const pillTextW = doc.getTextWidth(label);
  const pillW = pillTextW + 8;
  const pillH = 5.5;
  const pillX = PAGE.w - PAGE.margin - pillW - 4;
  const pillY = y + (h - pillH) / 2;

  let pillFill: [number, number, number] = C.primarySoft;
  let pillText: [number, number, number] = C.primary;
  if (status === 'approved') { pillFill = [223, 245, 232]; pillText = C.success; }
  if (status === 'in_review') { pillFill = [255, 243, 215]; pillText = [165, 115, 20]; }
  if (status === 'draft') { pillFill = [235, 232, 226]; pillText = C.muted; }

  setFill(doc, pillFill);
  doc.roundedRect(pillX, pillY, pillW, pillH, pillH / 2, pillH / 2, 'F');
  setText(doc, pillText);
  doc.text(label, pillX + pillW / 2, pillY + pillH - 1.6, { align: 'center' });

  setText(doc, C.muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(rowText, pillX - 4 - rowTextW, y + 9);

  return y + h + 5;
}

// Word-wrap helper that returns lines AND total height
function measureLines(doc: jsPDF, text: string, width: number, lineHeight: number): { lines: string[]; height: number } {
  const lines = doc.splitTextToSize(text || '—', width);
  return { lines, height: lines.length * lineHeight };
}

// Pre-fetch all images for a row
async function loadRowImages(paths: string[], max: number) {
  return (await Promise.all(paths.slice(0, max).map(fetchImageDataUrl))).filter(Boolean) as Array<{ data: string; w: number; h: number; fmt: 'PNG' | 'JPEG' }>;
}

interface PreparedRow {
  index: number;
  functies: string[];
  locaties: string[];
  hook: string;
  usps: string;
  omschrijving: string;
  vacature_url: string;
  images: Array<{ data: string; w: number; h: number; fmt: 'PNG' | 'JPEG' }>;
  cardHeight: number;
}

function calcRowCardHeight(doc: jsPDF, r: { hook: string; usps: string; omschrijving: string; functies: string[]; locaties: string[] }, contentColW: number): number {
  // Card layout:
  // - Header strip with #, functie, locatie chips, vacature link  (h ~ 16)
  // - 3 columns: Hook | USP's | Omschrijving (text wraps)
  // - Padding
  const padX = 5;
  const headerH = 14;
  const labelH = 4.5;       // small label per column
  const lineH = 4;          // body line height @ 8.5pt
  const colGap = 4;
  const columnsW = (contentColW - padX * 2 - colGap * 2) / 3;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const hookH = measureLines(doc, r.hook || '—', columnsW, lineH).height;
  const uspsH = measureLines(doc, r.usps || '—', columnsW, lineH).height;
  const omsH = measureLines(doc, r.omschrijving || '—', columnsW, lineH).height;
  const bodyH = Math.max(hookH, uspsH, omsH);

  // total = top pad + header + gap + label + body + bottom pad
  return 4 + headerH + 3 + labelH + bodyH + 6;
}

function drawRowCard(
  doc: jsPDF,
  r: PreparedRow,
  x: number,
  y: number,
  w: number,
  height: number,
  imagesColW: number
): void {
  // Card background
  setFill(doc, C.white);
  setDraw(doc, C.border);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, w, height, 2.5, 2.5, 'FD');

  // Left content area separator from images area
  const contentW = w - imagesColW - 4;
  const padX = 5;
  const padY = 5;

  // ===== Header strip inside card =====
  const headerY = y + padY;
  // Index circle
  const circleR = 3.4;
  const circleX = x + padX + circleR;
  const circleY = headerY + circleR + 0.5;
  setFill(doc, C.brand);
  doc.circle(circleX, circleY, circleR, 'F');
  setText(doc, C.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(String(r.index + 1), circleX, circleY + 1.5, { align: 'center' });

  // Functie (bold, dark)
  const cx = circleX + circleR + 4;
  setText(doc, C.ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  const functieText = r.functies.join(', ') || 'Geen functie';
  const maxFunctieW = contentW * 0.45;
  const functieFit = doc.splitTextToSize(functieText, maxFunctieW)[0];
  doc.text(functieFit, cx, circleY + 2);
  const functieW = doc.getTextWidth(functieFit);

  // Locatie chip — directly next to functie with a real map-pin icon
  const locText = r.locaties.join(', ') || 'Geen locatie';
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const locTextW = Math.min(doc.getTextWidth(locText), contentW * 0.4);
  const chipPadX = 3;
  const iconGap = 1.6;
  const iconSize = 3.2;
  const chipW = iconSize + iconGap + locTextW + chipPadX * 2;
  const chipH = 6;
  const chipX = cx + functieW + 5;
  const chipY = circleY - chipH / 2 + 0.4;

  setFill(doc, C.brandLight);
  doc.roundedRect(chipX, chipY, chipW, chipH, chipH / 2, chipH / 2, 'F');

  // Map-pin icon (vector path)
  drawMapPin(doc, chipX + chipPadX + iconSize / 2, chipY + chipH / 2, iconSize, C.brand);

  setText(doc, C.brand);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  const locFit = doc.splitTextToSize(locText, locTextW)[0];
  doc.text(locFit, chipX + chipPadX + iconSize + iconGap, chipY + chipH - 2);

  // Vacature link (second line, small)
  if (r.vacature_url) {
    setText(doc, C.primary);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    const linkY = headerY + 12;
    const link = r.vacature_url;
    const maxLinkW = contentW - padX * 2;
    const fit = doc.splitTextToSize(link, maxLinkW)[0];
    doc.textWithLink(fit, x + padX, linkY, { url: link });
  }

  // Divider
  const dividerY = headerY + 14;
  setDraw(doc, C.divider);
  doc.setLineWidth(0.2);
  doc.line(x + padX, dividerY, x + contentW - padX, dividerY);

  // ===== 3 columns: Hook | USP's | Omschrijving =====
  const colGap = 4;
  const colW = (contentW - padX * 2 - colGap * 2) / 3;
  const colY = dividerY + 4;

  const drawColumn = (cx0: number, label: string, body: string) => {
    setText(doc, C.muted);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(label.toUpperCase(), cx0, colY);

    setText(doc, C.body);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const lines = doc.splitTextToSize(body || '—', colW);
    doc.text(lines, cx0, colY + 5);
  };

  drawColumn(x + padX, 'Hook', r.hook);
  drawColumn(x + padX + colW + colGap, "USP's", r.usps);
  drawColumn(x + padX + (colW + colGap) * 2, 'Omschrijving', r.omschrijving);

  // ===== Images column on the right =====
  if (imagesColW > 0) {
    const imgX = x + contentW + 4;
    const imgY = y + padY;
    const imgAreaH = height - padY * 2;

    // Subtle separator
    setDraw(doc, C.divider);
    doc.setLineWidth(0.2);
    doc.line(imgX - 2, y + 4, imgX - 2, y + height - 4);

    setText(doc, C.muted);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text('CREATIEVE INSPIRATIE', imgX, imgY + 1.5);

    if (r.images.length === 0) {
      setText(doc, C.subtle);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.text('Geen afbeeldingen', imgX, imgY + 9);
      return;
    }

    // Grid: up to 4 images in a 2x2; if 1 → big single
    const gridY = imgY + 5;
    const gridH = imgAreaH - 5;
    const imgs = r.images.slice(0, 4);
    let cols = 2;
    let rows = 2;
    if (imgs.length === 1) { cols = 1; rows = 1; }
    else if (imgs.length === 2) { cols = 2; rows = 1; }
    else if (imgs.length === 3) { cols = 2; rows = 2; } // 3rd in second row
    const gap = 1.8;
    const cellW = (imagesColW - gap * (cols - 1)) / cols;
    const cellH = (gridH - gap * (rows - 1)) / rows;

    imgs.forEach((img, i) => {
      const r0 = Math.floor(i / cols);
      const c0 = i % cols;
      const cx = imgX + c0 * (cellW + gap);
      const cy = gridY + r0 * (cellH + gap);
      // Cell background
      setFill(doc, C.bg);
      doc.roundedRect(cx, cy, cellW, cellH, 1.2, 1.2, 'F');
      // Fit image (contain)
      const ratio = img.w / img.h;
      let dw = cellW;
      let dh = cellW / ratio;
      if (dh > cellH) {
        dh = cellH;
        dw = cellH * ratio;
      }
      const ox = cx + (cellW - dw) / 2;
      const oy = cy + (cellH - dh) / 2;
      try {
        doc.addImage(img.data, img.fmt, ox, oy, dw, dh, undefined, 'FAST');
      } catch {
        // skip
      }
    });

    // "+N" overlay if more than 4
    if (r.images.length > 4) {
      setFill(doc, C.ink);
      const badge = `+${r.images.length - 4}`;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      const bw = doc.getTextWidth(badge) + 4;
      const bh = 5;
      doc.roundedRect(imgX + imagesColW - bw - 1, gridY + gridH - bh - 1, bw, bh, 1.2, 1.2, 'F');
      setText(doc, C.white);
      doc.text(badge, imgX + imagesColW - bw / 2 - 1, gridY + gridH - 2.5, { align: 'center' });
    }
  }
}

export async function exportWeekToPDF(opts: {
  week: number;
  year: number;
  clientBlocks: ClientBlock[];
}) {
  const { week, year, clientBlocks } = opts;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });

  const totalRows = clientBlocks.reduce((acc, b) => acc + b.rows.length, 0);

  // ---- Cover ----
  drawCover(doc, week, year, clientBlocks.length, totalRows);

  const contentW = PAGE.w - PAGE.margin * 2;
  const imagesColW = 64; // fixed visual column for inspiration
  const cardGap = 4;

  for (let ci = 0; ci < clientBlocks.length; ci++) {
    const block = clientBlocks[ci];

    // New page per client (always — keeps it clean)
    doc.addPage();
    paintBackground(doc);
    drawPageChrome(doc, week, year, block.clientName);

    let y = 18;
    y = drawClientHeader(doc, block.clientName, block.status, block.rows.length, y);

    if (block.rows.length === 0) {
      // Empty state
      setFill(doc, C.white);
      setDraw(doc, C.border);
      doc.setLineWidth(0.25);
      doc.roundedRect(PAGE.margin, y, contentW, 22, 2, 2, 'FD');
      setText(doc, C.muted);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(10);
      doc.text('Geen briefing-rijen voor deze klant.', PAGE.margin + 6, y + 13);
      continue;
    }

    // Pre-load images & compute card heights
    const sorted = [...block.rows].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const prepared: PreparedRow[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i];
      const images = await loadRowImages(r.creative_image_paths || [], 4);
      const pr: PreparedRow = {
        index: i,
        functies: r.functies || [],
        locaties: r.locaties || [],
        hook: r.hook || '',
        usps: r.usps || '',
        omschrijving: r.omschrijving || '',
        vacature_url: r.vacature_url || '',
        images,
        cardHeight: 0,
      };
      pr.cardHeight = Math.max(
        calcRowCardHeight(doc, pr, contentW - imagesColW - 4),
        // Ensure enough height for an image grid (min ~52mm)
        images.length > 0 ? 56 : 38
      );
      prepared.push(pr);
    }

    // Draw cards
    for (const pr of prepared) {
      // Page break if needed
      if (y + pr.cardHeight > PAGE.h - 14) {
        doc.addPage();
        paintBackground(doc);
        drawPageChrome(doc, week, year, block.clientName);
        y = 18;
      }
      drawRowCard(doc, pr, PAGE.margin, y, contentW, pr.cardHeight, imagesColW);
      y += pr.cardHeight + cardGap;
    }
  }

  // Re-stamp page chrome with final page numbers (footers were drawn at addPage time, but pn updates already correct)
  doc.save(`Briefing-Week${week}-${year}.pdf`);
}
