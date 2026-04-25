import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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

// Brand-ish palette (HSL → hex approximations matching the app theme)
const COLOR = {
  primary: [88, 56, 184] as [number, number, number],   // brand purple
  accent: [245, 197, 66] as [number, number, number],   // yellow
  text: [30, 30, 35] as [number, number, number],
  muted: [110, 110, 120] as [number, number, number],
  border: [225, 225, 230] as [number, number, number],
  bgSoft: [250, 248, 244] as [number, number, number],  // warm off-white
  white: [255, 255, 255] as [number, number, number],
};

async function fetchImageDataUrl(path: string): Promise<{ data: string; w: number; h: number } | null> {
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
    return { data: dataUrl, w: dims.w, h: dims.h };
  } catch {
    return null;
  }
}

export async function exportWeekToPDF(opts: {
  week: number;
  year: number;
  clientBlocks: ClientBlock[];
}) {
  const { week, year, clientBlocks } = opts;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;

  // ===== Cover header on page 1 =====
  const drawCover = () => {
    doc.setFillColor(...COLOR.primary);
    doc.rect(0, 0, pageW, 32, 'F');
    doc.setFillColor(...COLOR.accent);
    doc.rect(0, 32, pageW, 1.5, 'F');

    doc.setTextColor(...COLOR.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text(`Briefing · Week ${week}`, margin, 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`${year} · ${clientBlocks.length} ${clientBlocks.length === 1 ? 'klant' : 'klanten'}`, margin, 24);

    doc.setFontSize(9);
    const generated = `Geëxporteerd ${new Date().toLocaleDateString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    doc.text(generated, pageW - margin, 16, { align: 'right' });
  };

  drawCover();
  let cursorY = 42;

  // ===== Per-client section =====
  for (let ci = 0; ci < clientBlocks.length; ci++) {
    const block = clientBlocks[ci];

    // New page for each client (except first stays after cover)
    if (ci > 0) {
      doc.addPage();
      // Slim header on subsequent pages
      doc.setFillColor(...COLOR.primary);
      doc.rect(0, 0, pageW, 10, 'F');
      doc.setFillColor(...COLOR.accent);
      doc.rect(0, 10, pageW, 0.8, 'F');
      doc.setTextColor(...COLOR.white);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(`Week ${week} · ${year}`, margin, 7);
      cursorY = 18;
    }

    // Client title bar
    doc.setFillColor(...COLOR.bgSoft);
    doc.roundedRect(margin, cursorY, pageW - margin * 2, 10, 1.5, 1.5, 'F');
    doc.setTextColor(...COLOR.text);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(block.clientName, margin + 4, cursorY + 6.8);

    // Status pill (right side)
    const statusLabel = STATUS_LABEL[block.status] || block.status;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const pillW = doc.getTextWidth(statusLabel) + 6;
    const pillX = pageW - margin - pillW - 2;
    doc.setFillColor(...COLOR.primary);
    doc.roundedRect(pillX, cursorY + 2.5, pillW, 5, 1, 1, 'F');
    doc.setTextColor(...COLOR.white);
    doc.text(statusLabel, pillX + pillW / 2, cursorY + 6, { align: 'center' });

    // Row count
    doc.setTextColor(...COLOR.muted);
    doc.setFontSize(8);
    doc.text(`${block.rows.length} ${block.rows.length === 1 ? 'rij' : 'rijen'}`, pillX - 4, cursorY + 6, { align: 'right' });

    cursorY += 14;

    if (block.rows.length === 0) {
      doc.setTextColor(...COLOR.muted);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.text('Geen briefing-rijen voor deze klant.', margin + 2, cursorY + 4);
      cursorY += 10;
      continue;
    }

    // Pre-fetch images per row (first image only, for inline thumbnail)
    const sortedRows = [...block.rows].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    // Build table rows
    const body = sortedRows.map((r, i) => [
      String(i + 1),
      (r.functies || []).join(', ') || '—',
      (r.locaties || []).join(', ') || '—',
      r.hook || '—',
      r.usps || '—',
      r.omschrijving || '—',
      r.vacature_url || '',
    ]);

    autoTable(doc, {
      startY: cursorY,
      head: [['#', 'Functie', 'Locatie', 'Hook', "USP's", 'Omschrijving', 'Vacaturelink']],
      body,
      margin: { left: margin, right: margin },
      styles: {
        font: 'helvetica',
        fontSize: 8.5,
        cellPadding: 2.2,
        valign: 'top',
        textColor: COLOR.text,
        lineColor: COLOR.border,
        lineWidth: 0.15,
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: COLOR.primary,
        textColor: COLOR.white,
        fontStyle: 'bold',
        fontSize: 8.5,
        halign: 'left',
      },
      alternateRowStyles: { fillColor: [252, 251, 248] },
      columnStyles: {
        0: { cellWidth: 7, halign: 'center', textColor: COLOR.muted },
        1: { cellWidth: 32, fontStyle: 'bold' },
        2: { cellWidth: 28 },
        3: { cellWidth: 45 },
        4: { cellWidth: 50 },
        5: { cellWidth: 60 },
        6: { cellWidth: 'auto', textColor: COLOR.primary, fontSize: 7.5 },
      },
      didDrawPage: () => {
        // Footer
        const pn = doc.getNumberOfPages();
        doc.setFontSize(7.5);
        doc.setTextColor(...COLOR.muted);
        doc.setFont('helvetica', 'normal');
        doc.text(
          `Eva AI Marketeer · Week ${week} · ${year}`,
          margin,
          pageH - 5
        );
        doc.text(`Pagina ${pn}`, pageW - margin, pageH - 5, { align: 'right' });
      },
    });

    cursorY = (doc as any).lastAutoTable.finalY + 6;

    // Inspiratie afbeeldingen (one row of thumbnails per row that has images)
    const rowsWithImages = sortedRows.filter(r => (r.creative_image_paths?.length || 0) > 0);
    if (rowsWithImages.length > 0) {
      // Section title
      if (cursorY > pageH - 50) {
        doc.addPage();
        cursorY = 18;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...COLOR.text);
      doc.text('Creatieve inspiratie', margin, cursorY);
      cursorY += 4;

      for (const r of rowsWithImages) {
        const label = `Rij ${(sortedRows.indexOf(r) + 1)} — ${(r.functies || []).join(', ') || 'geen functie'}`;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...COLOR.muted);

        if (cursorY > pageH - 45) {
          doc.addPage();
          cursorY = 18;
        }
        doc.text(label, margin, cursorY + 3);
        cursorY += 5;

        const paths = r.creative_image_paths || [];
        const thumbs = await Promise.all(paths.slice(0, 6).map(fetchImageDataUrl));
        const thumbW = 36;
        const thumbH = 36;
        const gap = 3;
        let x = margin;
        const startY = cursorY;
        let maxRowH = 0;

        for (const t of thumbs) {
          if (!t) continue;
          if (x + thumbW > pageW - margin) {
            x = margin;
            cursorY += thumbH + gap;
            if (cursorY + thumbH > pageH - 12) {
              doc.addPage();
              cursorY = 18;
            }
          }
          // Fit image inside the thumb box keeping aspect ratio
          const ratio = t.w / t.h;
          let dw = thumbW;
          let dh = thumbW / ratio;
          if (dh > thumbH) {
            dh = thumbH;
            dw = thumbH * ratio;
          }
          const offsetX = x + (thumbW - dw) / 2;
          const offsetY = cursorY + (thumbH - dh) / 2;
          // Light frame
          doc.setDrawColor(...COLOR.border);
          doc.setFillColor(...COLOR.white);
          doc.roundedRect(x, cursorY, thumbW, thumbH, 1, 1, 'FD');
          try {
            const fmt = t.data.startsWith('data:image/png') ? 'PNG' : 'JPEG';
            doc.addImage(t.data, fmt, offsetX, offsetY, dw, dh, undefined, 'FAST');
          } catch {
            // skip on error
          }
          x += thumbW + gap;
          maxRowH = Math.max(maxRowH, thumbH);
        }
        cursorY = Math.max(cursorY, startY) + maxRowH + 6;
      }
    }
  }

  const filename = `Briefing-Week${week}-${year}.pdf`;
  doc.save(filename);
}
