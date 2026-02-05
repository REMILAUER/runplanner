/**
 * PDF Export Utility
 * Generates training plan PDFs using jsPDF
 */

import { formatPace } from './vdot';

/**
 * Load jsPDF dynamically
 */
async function loadJsPDF() {
  if (window.jspdf) return window.jspdf;
  
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    script.onload = () => resolve(window.jspdf);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

/**
 * Generate PDF from training plan
 */
export async function generatePlanPDF(weeklyPlan, plan, profile, availability, paces) {
  const { jsPDF } = await loadJsPDF();
  const doc = new jsPDF('p', 'mm', 'a4');

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;

  // Colors
  const colors = {
    black: [26, 26, 26],
    gray: [136, 136, 136],
    lightGray: [238, 238, 238],
    white: [255, 255, 255],
    phases: {
      Base: [126, 200, 227],
      Construction: [232, 135, 60],
      Spécifique: [214, 48, 49],
      Affûtage: [74, 158, 74],
    },
    sessions: {
      EF: [126, 200, 227],
      SL: [76, 168, 168],
      SEUIL: [232, 135, 60],
      VMA: [214, 48, 49],
      TEMPO: [232, 200, 64],
      RECUP: [158, 158, 158],
    },
  };

  const objective = plan?.cycles?.[0]?.objective;
  const totalVolume = Math.round(weeklyPlan.reduce((sum, w) => sum + w.volume, 0));
  const totalSessions = weeklyPlan.reduce((sum, w) => sum + w.sessions.length, 0);

  // Helper functions
  const setFont = (size, style = 'normal') => {
    doc.setFontSize(size);
    doc.setFont('helvetica', style);
  };

  const drawRect = (x, y, w, h, color, fill = true) => {
    doc.setFillColor(...color);
    doc.setDrawColor(...color);
    if (fill) {
      doc.rect(x, y, w, h, 'F');
    } else {
      doc.rect(x, y, w, h, 'S');
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // PAGE 1: SUMMARY
  // ═══════════════════════════════════════════════════════════════════

  let y = margin;

  // Header bar
  drawRect(0, 0, pageWidth, 35, colors.black);
  doc.setTextColor(...colors.white);
  setFont(22, 'bold');
  doc.text(objective ? `Préparation ${objective.distance}` : "Plan d'entraînement", margin, 18);
  setFont(10, 'normal');
  doc.text(`${weeklyPlan.length} semaines · ${availability.sessionsPerWeek} séances/semaine`, margin, 28);

  y = 50;
  doc.setTextColor(...colors.black);

  // Profile section
  setFont(12, 'bold');
  doc.text('PROFIL', margin, y);
  y += 6;
  drawRect(margin, y, contentWidth, 0.5, colors.black);
  y += 6;

  setFont(10, 'normal');
  doc.text(`${profile.firstName || '—'} ${profile.lastName || ''}`, margin, y);
  if (profile.refDistance && profile.refTime) {
    doc.text(`Référence : ${profile.refDistance} en ${profile.refTime}`, margin + 80, y);
  }
  y += 12;

  // Plan overview
  setFont(12, 'bold');
  doc.text('APERÇU DU PLAN', margin, y);
  y += 6;
  drawRect(margin, y, contentWidth, 0.5, colors.black);
  y += 8;

  // Stats boxes
  const boxWidth = (contentWidth - 10) / 3;
  const boxes = [
    { label: 'Semaines', value: weeklyPlan.length.toString() },
    { label: 'Séances', value: totalSessions.toString() },
    { label: 'Volume total', value: `${totalVolume} km` },
  ];

  boxes.forEach((box, i) => {
    const bx = margin + i * (boxWidth + 5);
    drawRect(bx, y, boxWidth, 20, colors.lightGray);
    setFont(16, 'bold');
    doc.text(box.value, bx + boxWidth / 2, y + 10, { align: 'center' });
    setFont(8, 'normal');
    doc.setTextColor(...colors.gray);
    doc.text(box.label, bx + boxWidth / 2, y + 16, { align: 'center' });
    doc.setTextColor(...colors.black);
  });
  y += 28;

  // Volume progression chart
  setFont(12, 'bold');
  doc.text('PROGRESSION DU VOLUME', margin, y);
  y += 6;
  drawRect(margin, y, contentWidth, 0.5, colors.black);
  y += 8;

  const chartHeight = 35;
  const maxVol = Math.max(...weeklyPlan.map((w) => w.volume));
  const barWidth = Math.min(8, (contentWidth - weeklyPlan.length) / weeklyPlan.length);
  const barGap = (contentWidth - barWidth * weeklyPlan.length) / (weeklyPlan.length - 1 || 1);

  weeklyPlan.forEach((w, i) => {
    const bh = (w.volume / maxVol) * chartHeight;
    const bx = margin + i * (barWidth + barGap);
    const by = y + chartHeight - bh;
    const phaseColor = colors.phases[w.phase] || colors.gray;
    drawRect(bx, by, barWidth, bh, phaseColor);
  });
  y += chartHeight + 8;

  // Phase legend
  const phases = ['Base', 'Construction', 'Spécifique', 'Affûtage'];
  let legendX = margin;
  setFont(8, 'normal');
  phases.forEach((phase) => {
    drawRect(legendX, y, 4, 4, colors.phases[phase]);
    doc.text(phase, legendX + 6, y + 3.5);
    legendX += doc.getTextWidth(phase) + 12;
  });
  y += 15;

  // Paces section
  setFont(12, 'bold');
  doc.text('VOS ALLURES', margin, y);
  y += 6;
  drawRect(margin, y, contentWidth, 0.5, colors.black);
  y += 6;

  const paceList = [
    { key: 'Easy', label: 'Easy' },
    { key: 'Tempo', label: 'Tempo' },
    { key: 'Seuil2', label: 'Seuil 2' },
    { key: 'VMALongue', label: 'VMA longue' },
    { key: 'VMACourte', label: 'VMA courte' },
  ];

  setFont(9, 'normal');
  paceList.forEach((p, i) => {
    const pace = paces?.[p.key];
    if (pace) {
      const px = margin + (i % 3) * 60;
      const py = y + Math.floor(i / 3) * 8;
      doc.setTextColor(...colors.gray);
      doc.text(p.label + ':', px, py);
      doc.setTextColor(...colors.black);
      doc.text(`${formatPace(pace.fast)}-${formatPace(pace.slow)}`, px + 28, py);
    }
  });
  y += 22;

  // ═══════════════════════════════════════════════════════════════════
  // PAGES 2+: WEEKLY DETAILS
  // ═══════════════════════════════════════════════════════════════════

  weeklyPlan.forEach((weekData) => {
    doc.addPage();
    y = margin;

    const phaseColor = colors.phases[weekData.phase] || colors.gray;

    // Week header
    drawRect(0, 0, pageWidth, 30, phaseColor);
    doc.setTextColor(...colors.white);
    setFont(18, 'bold');
    doc.text(`Semaine ${weekData.week}`, margin, 14);
    setFont(10, 'normal');

    const dateRange = `${weekData.weekStartDate.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
    })} — ${weekData.weekEndDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
    doc.text(dateRange, margin, 22);

    // Volume badge
    setFont(14, 'bold');
    doc.text(`${Math.round(weekData.volume)} km`, pageWidth - margin, 14, { align: 'right' });
    setFont(8, 'normal');
    doc.text('volume', pageWidth - margin, 21, { align: 'right' });

    y = 38;
    doc.setTextColor(...colors.black);

    // Week objective
    setFont(10, 'normal');
    doc.setTextColor(...colors.gray);
    doc.text(`${weekData.phase} — ${weekData.objective}`, margin, y);
    if (weekData.isAssim) {
      doc.text("  ·  SEMAINE D'ASSIMILATION", margin + doc.getTextWidth(`${weekData.phase} — ${weekData.objective}`), y);
    }
    doc.setTextColor(...colors.black);
    y += 10;

    // Sessions
    weekData.sessions.forEach((session) => {
      const sessionColor = colors.sessions[session.type] || colors.gray;

      // Check if we need a new page
      if (y > pageHeight - 60) {
        doc.addPage();
        y = margin;
      }

      // Session card
      const cardHeight = 45;
      drawRect(margin, y, 4, cardHeight, sessionColor);

      // Date
      setFont(9, 'bold');
      doc.text(
        session.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
        margin + 8,
        y + 6
      );

      // Title and duration
      setFont(11, 'bold');
      doc.text(session.title, margin + 8, y + 14);
      setFont(9, 'normal');
      doc.setTextColor(...colors.gray);
      doc.text(`${session.duration} · ${session.distance} km`, margin + 8, y + 21);
      doc.setTextColor(...colors.black);

      // Main workout summary
      setFont(8, 'normal');
      let mainText = '';
      session.main.forEach((block, bi) => {
        if (bi > 0) mainText += ' | ';
        mainText += block.description;
        if (block.pace && block.pace !== '—') mainText += ` @ ${block.pace}/km`;
      });

      // Truncate if too long
      const maxWidth = contentWidth - 12;
      if (doc.getTextWidth(mainText) > maxWidth) {
        while (doc.getTextWidth(mainText + '...') > maxWidth && mainText.length > 0) {
          mainText = mainText.slice(0, -1);
        }
        mainText += '...';
      }
      doc.text(mainText, margin + 8, y + 30);

      // Warmup/cooldown
      if (session.warmup?.duration !== '—' || session.cooldown?.duration !== '—') {
        doc.setTextColor(...colors.gray);
        let wcText = '';
        if (session.warmup?.duration !== '—') wcText += `Échauf: ${session.warmup.duration}`;
        if (session.cooldown?.duration !== '—') {
          if (wcText) wcText += ' · ';
          wcText += `Retour: ${session.cooldown.duration}`;
        }
        doc.text(wcText, margin + 8, y + 38);
        doc.setTextColor(...colors.black);
      }

      y += cardHeight + 6;
    });

    // Week total footer
    y += 4;
    drawRect(margin, y, contentWidth, 0.5, colors.lightGray);
    y += 6;
    setFont(9, 'bold');
    doc.text(`Total semaine : ${weekData.sessions.length} séances · ${weekData.totalDistance} km`, margin, y);
  });

  // Save
  const fileName = objective
    ? `plan-${objective.distance.toLowerCase().replace(' ', '-')}-${weeklyPlan.length}sem.pdf`
    : `plan-entrainement-${weeklyPlan.length}sem.pdf`;
  doc.save(fileName);
}
