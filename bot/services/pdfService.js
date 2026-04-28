const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const S = require('../templates/pdf-styles');

const LOGOS_DIR = path.join(__dirname, '../data/logos');
const SI_AHORRO_LOGO = path.join(__dirname, '../../logo/logo-transparent-png.png');

const DISCLAIMER =
  'Comparativa realizada en base a las condiciones económicas y consumo energético indicados en la ' +
  'factura. La información facilitada es orientativa y no constituye oferta vinculante. ' +
  'Los impuestos aplicados son los mismos que los indicados en su factura. ' +
  'Sí Ahorro no se hace responsable de variaciones en tarifas indexadas.';

/**
 * Genera el PDF de comparativa como Buffer.
 * bestResult = objeto de tariffService.calculateBest().best
 * commission = { comision_anual: number | null }
 */
async function generate(billData, bestResult, commission) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      renderCover(doc, billData, bestResult);
      doc.addPage({ size: 'A4', margin: 0 });
      renderComparison(doc, billData, bestResult, commission);
    } catch (err) {
      reject(err);
      return;
    }

    doc.end();
  });
}

// ─── PÁGINA 1: Portada ─────────────────────────────────────────────────────

function renderCover(doc, billData, bestResult) {
  const W = doc.page.width;
  const H = doc.page.height;

  // Fondo blanco
  doc.rect(0, 0, W, H).fill(S.colors.white);

  // Logo de la comercializadora recomendada (centrado verticalmente)
  const logoFile = path.join(LOGOS_DIR, bestResult.tarifa.logo || '');
  const logoExists = bestResult.tarifa.logo && fs.existsSync(logoFile);
  const centerY = H / 2;

  if (logoExists) {
    const logoMaxW = 280;
    const logoMaxH = 120;
    doc.image(logoFile, (W - logoMaxW) / 2, centerY - logoMaxH / 2, {
      fit: [logoMaxW, logoMaxH],
      align: 'center',
      valign: 'center'
    });
  } else {
    // Fallback: nombre de la empresa en texto
    doc.font(S.fonts.bold)
      .fontSize(S.fontSize.hero)
      .fillColor(S.colors.teal)
      .text(bestResult.tarifa.comercializadora, 50, centerY - 30, {
        width: W - 100,
        align: 'center'
      });
  }

  // Nombre del cliente en gris claro (parte inferior)
  if (billData.cliente) {
    doc.font(S.fonts.regular)
      .fontSize(S.fontSize.body)
      .fillColor(S.colors.lightGray)
      .text(billData.cliente, 50, H - 80, { width: W - 100, align: 'center' });
  }
}

// ─── PÁGINA 2: Comparativa ─────────────────────────────────────────────────

function renderComparison(doc, billData, bestResult, commission) {
  const M = S.layout.margin;
  const W = doc.page.width;
  const contentW = W - M * 2;
  let y = M;

  // ── Cabecera ──────────────────────────────────────────────────
  doc.font(S.fonts.bold)
    .fontSize(S.fontSize.tiny)
    .fillColor(S.colors.teal)
    .text('COMPARATIVA ELECTRICIDAD', M, y, { characterSpacing: 0.5 });
  y += 13;
  doc.moveTo(M, y).lineTo(M + contentW, y)
    .lineWidth(0.75).strokeColor(S.colors.teal).stroke();
  y += 14;

  // ── Texto introductorio ──────────────────────────────────────
  doc.font(S.fonts.regular)
    .fontSize(S.fontSize.small)
    .fillColor(S.colors.text)
    .text(
      'En este documento, le presentamos la comparativa de precios entre su actual comercializadora ' +
      'y lo que habría pagado con nosotros para el rango de fechas indicado en el comparativo.',
      M, y, { width: contentW }
    );
  y += 36;

  // ── Datos de la comparativa ──────────────────────────────────
  doc.font(S.fonts.bold)
    .fontSize(S.fontSize.subtitle)
    .fillColor(S.colors.text)
    .text('Datos de la comparativa', M, y);
  y += 22;

  const datos = [
    ['Cliente:', billData.cliente || '—'],
    ['CUPS:', billData.cups || '—'],
    ['Comercializadora actual:', billData.comercializadora || '—'],
    ['ATR:', billData.atr || '2.0TD'],
    ['Periodo de facturación:', formatPeriodo(billData.fecha_inicio, billData.fecha_fin, billData.dias)],
    ['Potencias contratadas:', formatPotencias(billData)]
  ];

  datos.forEach(([label, value]) => {
    doc.font(S.fonts.regular).fontSize(S.fontSize.small).fillColor(S.colors.labelGray)
      .text(label, M, y, { width: 155, lineBreak: false });
    doc.font(S.fonts.regular).fontSize(S.fontSize.small).fillColor(S.colors.text)
      .text(value, M + 160, y, { width: contentW - 160 });
    y += 16;
  });
  y += 18;

  // ── Comparativa de precios ───────────────────────────────────
  doc.font(S.fonts.bold)
    .fontSize(S.fontSize.subtitle)
    .fillColor(S.colors.text)
    .text('Comparativa de precios', M, y);
  y += 22;

  const colW = (contentW - S.layout.columnGap) / 2;
  const col1X = M;
  const col2X = M + colW + S.layout.columnGap;

  // Cabeceras de columna
  drawColHeader(doc, billData.comercializadora || 'Actual', col1X, y, colW);
  drawColHeader(doc, bestResult.tarifa.comercializadora, col2X, y, colW);
  y += 36;

  // Filas de conceptos
  const lineas = [
    ['Potencia',           billData.coste_potencia,          bestResult.costes.coste_potencia],
    ['Energía',            billData.coste_energia,           bestResult.costes.coste_energia],
    ['E. reactiva',        billData.e_reactiva || 0,         0],
    ['Excesos pot.',       billData.excesos_pot || 0,        0],
    ['Imp. eléctrico',     billData.impuesto_electrico || 0, bestResult.costes.impuesto_electrico],
    ['Otros conceptos',    billData.otros_conceptos || 0,    0],
    ['IVA',                billData.iva || 0,                bestResult.costes.iva]
  ];

  lineas.forEach(([label, v1, v2]) => {
    drawLineItem(doc, label, v1, v2, col1X, col2X, y, colW);
    y += S.layout.lineHeight;
  });

  y += 22;

  // Separador sutil
  doc.moveTo(col1X, y).lineTo(col1X + colW, y)
    .lineWidth(0.5).strokeColor(S.colors.rule).stroke();
  doc.moveTo(col2X, y).lineTo(col2X + colW, y)
    .lineWidth(0.5).strokeColor(S.colors.rule).stroke();
  y += 14;

  // Totales
  doc.font(S.fonts.regular).fontSize(S.fontSize.small).fillColor(S.colors.labelGray)
    .text('Total factura', col1X, y, { width: colW, align: 'center' });
  doc.font(S.fonts.regular).fontSize(S.fontSize.small).fillColor(S.colors.labelGray)
    .text('Total factura', col2X, y, { width: colW, align: 'center' });
  y += 14;

  doc.font(S.fonts.bold).fontSize(S.fontSize.xlarge).fillColor(S.colors.text)
    .text(fmt(billData.total), col1X, y, { width: colW, align: 'center' });
  doc.font(S.fonts.bold).fontSize(S.fontSize.xlarge).fillColor(S.colors.text)
    .text(fmt(bestResult.costes.total), col2X, y, { width: colW, align: 'center' });
  y += 46;

  // Ahorro en factura y anual
  const ahorroFactura = bestResult.ahorro_periodo;
  const ahorroAnual   = bestResult.ahorro_anual;

  drawSavingsRow(doc, 'Tu ahorro en factura:', ahorroFactura, M, W - M, y, false);
  y += 32;
  drawSavingsRow(doc, 'Ahorro anual:', ahorroAnual, M, W - M, y, true);
  y += 50;

  // ── Disclaimer ──────────────────────────────────────────────
  const disclaimerY = Math.max(y + 10, doc.page.height - 110);
  doc.font(S.fonts.regular).fontSize(S.fontSize.tiny).fillColor(S.colors.labelGray)
    .text(DISCLAIMER, M, disclaimerY, { width: contentW });

  // ── Pie de página ────────────────────────────────────────────
  const footerY = doc.page.height - 32;

  // Logo Sí Ahorro (si existe)
  if (fs.existsSync(SI_AHORRO_LOGO)) {
    doc.image(SI_AHORRO_LOGO, M, footerY - 6, { height: 18 });
  } else {
    doc.font(S.fonts.bold).fontSize(8).fillColor(S.colors.teal)
      .text('Sí Ahorro', M, footerY - 2);
  }

  // Badge número de página (estilo IDES: cuadrado verde con "1")
  const badgeW = 22;
  const badgeX = W - M - badgeW;
  doc.rect(badgeX, footerY - 6, badgeW, badgeW).fill(S.colors.teal);
  doc.font(S.fonts.bold).fontSize(9).fillColor(S.colors.white)
    .text('1', badgeX, footerY - 1, { width: badgeW, align: 'center' });
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function drawColHeader(doc, text, x, y, width) {
  doc.rect(x, y, width, 28).fill(S.colors.columnHeader);
  doc.font(S.fonts.bold).fontSize(S.fontSize.small).fillColor(S.colors.text)
    .text(text, x, y + 10, { width, align: 'center' });
}

function drawLineItem(doc, label, v1, v2, col1X, col2X, y, colW) {
  // Columna 1
  doc.font(S.fonts.regular).fontSize(S.fontSize.small).fillColor(S.colors.text)
    .text(label, col1X + 8, y, { width: colW * 0.55, lineBreak: false });
  doc.font(S.fonts.regular).fontSize(S.fontSize.small).fillColor(S.colors.text)
    .text(fmt(v1), col1X, y, { width: colW - 4, align: 'right', lineBreak: false });

  // Columna 2
  doc.font(S.fonts.regular).fontSize(S.fontSize.small).fillColor(S.colors.text)
    .text(label, col2X + 8, y, { width: colW * 0.55, lineBreak: false });
  doc.font(S.fonts.regular).fontSize(S.fontSize.small).fillColor(S.colors.text)
    .text(fmt(v2), col2X, y, { width: colW - 4, align: 'right', lineBreak: false });
}

function drawSavingsRow(doc, label, value, x, maxX, y, large) {
  const labelFontSize = large ? S.fontSize.subtitle : S.fontSize.body;
  const valueFontSize = large ? 28 : 22;

  doc.font(S.fonts.regular).fontSize(labelFontSize).fillColor(S.colors.text)
    .text(label, x + 30, y + (large ? 2 : 3), { lineBreak: false });

  doc.font(S.fonts.bold).fontSize(valueFontSize).fillColor(S.colors.teal)
    .text(fmt(value), x, y - (large ? 2 : 0), { width: maxX - x, align: 'right' });
}

function fmt(n) {
  if (n == null || isNaN(n)) return '—';
  return n.toFixed(2).replace('.', ',') + '€';
}

function formatPeriodo(inicio, fin, dias) {
  if (!inicio || !fin) return dias ? `${dias} días` : '—';
  return `Desde ${toES(inicio)} hasta ${toES(fin)}`;
}

function toES(dateStr) {
  if (!dateStr) return '—';
  try {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  } catch { return dateStr; }
}

function formatPotencias(bill) {
  const p1 = bill.potencia_p1_kw || 0;
  const p2 = bill.potencia_p2_kw || 0;
  if (!p1 && !p2) return '—';
  return `P1: ${p1} kW | P2: ${p2} kW | P3: 0,00 kW | P4: 0,00 kW | P5: 0,00 kW | P6: 0,00 kW`;
}

module.exports = { generate };
