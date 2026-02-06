import { formatPace } from './vdot';
import { FONT } from '../styles/tokens';
import { PHASE_COLORS, SESSION_TYPES } from '../data/constants';

export async function generatePlanPDF(weeklyPlan, plan, profile, availability, paces) {
  // Dynamically load jsPDF
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  document.head.appendChild(script);

  await new Promise((resolve) => {
    script.onload = resolve;
  });

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;

  // Colors (RGB)
  const colors = {
    black: [26, 26, 26],
    gray: [136, 136, 136],
    lightGray: [238, 238, 238],
    white: [255, 255, 255],
    phases: {
      "Base": [126, 200, 227],
      "Construction": [232, 135, 60],
      "Spécifique": [214, 48, 49],
      "Affûtage": [74, 158, 74],
    },
    sessions: {
      "EF": [126, 200, 227],
      "SL": [76, 168, 168],
      "SEUIL": [232, 135, 60],
      "VMA": [214, 48, 49],
      "TEMPO": [232, 200, 64],
      "RECUP": [158, 158, 158],
    }
  };

  const objective = plan?.cycles?.[0]?.objective;
  const totalVolLow = Math.round(weeklyPlan.reduce((sum, w) => sum + (w.totalDistance?.low || w.volume), 0));
  const totalVolHigh = Math.round(weeklyPlan.reduce((sum, w) => sum + (w.totalDistance?.high || w.volume), 0));
  const totalVolume = totalVolLow === totalVolHigh ? `${totalVolLow}` : `${totalVolLow}-${totalVolHigh}`;
  const totalSessions = weeklyPlan.reduce((sum, w) => sum + w.sessions.filter(s => !s.isRest).length, 0);

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
  doc.text(objective ? `Préparation ${objective.distance}` : 'Plan d\'entraînement', margin, 18);
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
  const maxVol = Math.max(...weeklyPlan.map(w => w.volume));
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

  // Phase breakdown
  setFont(12, 'bold');
  doc.text('STRUCTURE DES PHASES', margin, y);
  y += 6;
  drawRect(margin, y, contentWidth, 0.5, colors.black);
  y += 8;

  // Count weeks per phase
  const phaseCounts = {};
  weeklyPlan.forEach(w => {
    phaseCounts[w.phase] = (phaseCounts[w.phase] || 0) + 1;
  });

  setFont(9, 'normal');
  let phaseX = margin;
  phases.forEach((phase) => {
    const count = phaseCounts[phase] || 0;
    if (count > 0) {
      drawRect(phaseX, y, 4, 10, colors.phases[phase]);
      doc.text(`${phase}: ${count} sem.`, phaseX + 6, y + 6);
      phaseX += 45;
    }
  });

  // Helper: format distance range for PDF
  const pdfDist = (d) => {
    if (typeof d === 'number') return `${d}`;
    if (d && d.low !== undefined) return d.low === d.high ? `${d.low}` : `${d.low}-${d.high}`;
    return '—';
  };

  // ═══════════════════════════════════════════════════════════════════
  // PAGES 2+: WEEKLY DETAILS WITH FULL SESSION BREAKDOWN
  // ═══════════════════════════════════════════════════════════════════

  weeklyPlan.forEach((weekData, weekIdx) => {
    doc.addPage();
    y = margin;

    const phaseColor = colors.phases[weekData.phase] || colors.gray;

    // Week header
    drawRect(0, 0, pageWidth, 30, phaseColor);
    doc.setTextColor(...colors.white);
    setFont(18, 'bold');
    doc.text(`Semaine ${weekData.week}`, margin, 14);
    setFont(10, 'normal');

    const dateRange = `${weekData.weekStartDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} — ${weekData.weekEndDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
    doc.text(dateRange, margin, 22);

    // Volume badge
    setFont(14, 'bold');
    doc.text(`${pdfDist(weekData.totalDistance)} km`, pageWidth - margin, 14, { align: 'right' });
    setFont(8, 'normal');
    doc.text('volume', pageWidth - margin, 21, { align: 'right' });

    y = 38;
    doc.setTextColor(...colors.black);

    // Week objective
    setFont(10, 'normal');
    doc.setTextColor(...colors.gray);
    let objText = `${weekData.phase} — ${weekData.objective}`;
    if (weekData.isAssim) objText += '  ·  SEMAINE D\'ASSIMILATION';
    doc.text(objText, margin, y);
    doc.setTextColor(...colors.black);
    y += 10;

    // Sessions with full detail
    weekData.sessions.forEach((session, si) => {
      // Rest day: simple gray line
      if (session.isRest) {
        if (y + 12 > pageHeight - 15) { doc.addPage(); y = margin; }
        setFont(9, 'normal');
        doc.setTextColor(...colors.gray);
        const restLabel = session.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) + '  —  Jour off';
        doc.text(restLabel, margin + 6, y + 5);
        doc.setTextColor(...colors.black);
        y += 10;
        return;
      }
      const sessionColor = colors.sessions[session.type] || colors.gray;

      // Estimate height needed for this session
      const mainBlockCount = session.main ? session.main.length : 0;
      const hasWarmup = session.warmup && session.warmup.duration !== '—';
      const hasCooldown = session.cooldown && session.cooldown.duration !== '—';
      const hasNotes = session.notes && session.notes.trim().length > 0;
      const hasCoachTips = session.coach_tips && session.coach_tips.length > 0;
      const tipsCount = hasCoachTips ? (Array.isArray(session.coach_tips) ? session.coach_tips.length : 1) : 0;
      const estimatedHeight = 22 + (hasWarmup ? 14 : 0) + mainBlockCount * 12 + (hasCooldown ? 14 : 0) + (hasNotes ? 14 : 0) + (tipsCount * 7 + (hasCoachTips ? 10 : 0)) + 6;

      // Check if we need a new page
      if (y + estimatedHeight > pageHeight - 15) {
        doc.addPage();
        y = margin;
      }

      // Session header bar
      drawRect(margin, y, contentWidth, 18, sessionColor);
      doc.setTextColor(...colors.white);
      setFont(10, 'bold');
      doc.text(session.title, margin + 6, y + 7);
      setFont(9, 'normal');
      const sessionMeta = `${session.duration}  ·  ${pdfDist(session.distance)} km`;
      doc.text(sessionMeta, pageWidth - margin - 6, y + 7, { align: 'right' });

      // Date line
      y += 18;
      doc.setTextColor(...colors.black);
      setFont(8, 'normal');
      doc.setTextColor(...colors.gray);
      doc.text(session.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }), margin + 6, y + 5);
      doc.setTextColor(...colors.black);
      y += 9;

      // Warmup
      if (hasWarmup) {
        drawRect(margin + 4, y, 2, 10, [126, 200, 227]); // light blue
        setFont(8, 'bold');
        doc.text('ÉCHAUFFEMENT', margin + 10, y + 4);
        setFont(8, 'normal');
        doc.setTextColor(...colors.gray);
        const warmupText = `${session.warmup.duration} @ ${session.warmup.pace}/km — ${session.warmup.description}`;
        doc.text(warmupText, margin + 10, y + 10);
        doc.setTextColor(...colors.black);
        y += 14;
      }

      // Main blocks
      if (session.main && session.main.length > 0) {
        drawRect(margin + 4, y, 2, session.main.length * 12, sessionColor);
        setFont(8, 'bold');
        doc.text('CORPS DE SÉANCE', margin + 10, y + 4);
        y += 7;

        setFont(8, 'normal');
        session.main.forEach((block) => {
          let blockText = block.description;
          if (block.pace && block.pace !== '—') blockText += ` @ ${block.pace}/km`;
          if (block.duration && block.duration !== '—') blockText += ` (${block.duration})`;

          // Truncate if too long
          const maxW = contentWidth - 16;
          if (doc.getTextWidth(blockText) > maxW) {
            while (doc.getTextWidth(blockText + '...') > maxW && blockText.length > 0) {
              blockText = blockText.slice(0, -1);
            }
            blockText += '...';
          }
          doc.text(blockText, margin + 10, y + 4);
          y += 8;
        });
        y += 2;
      }

      // Cooldown
      if (hasCooldown) {
        drawRect(margin + 4, y, 2, 10, [74, 158, 74]); // green
        setFont(8, 'bold');
        doc.text('RETOUR AU CALME', margin + 10, y + 4);
        setFont(8, 'normal');
        doc.setTextColor(...colors.gray);
        const cooldownText = `${session.cooldown.duration} @ ${session.cooldown.pace}/km — ${session.cooldown.description}`;
        doc.text(cooldownText, margin + 10, y + 10);
        doc.setTextColor(...colors.black);
        y += 14;
      }

      // Notes / Conseils
      if (hasNotes) {
        drawRect(margin + 4, y, contentWidth - 8, 12, [255, 250, 230]); // cream background
        setFont(7, 'italic');
        doc.setTextColor(100, 100, 100);
        let noteText = session.notes.trim();
        const maxW = contentWidth - 20;
        if (doc.getTextWidth(noteText) > maxW) {
          while (doc.getTextWidth(noteText + '...') > maxW && noteText.length > 0) {
            noteText = noteText.slice(0, -1);
          }
          noteText += '...';
        }
        doc.text(noteText, margin + 8, y + 8);
        doc.setTextColor(...colors.black);
        y += 16;
      }

      // Coach tips
      if (hasCoachTips) {
        const tips = Array.isArray(session.coach_tips) ? session.coach_tips : [session.coach_tips];
        drawRect(margin + 4, y, contentWidth - 8, tips.length * 8 + 6, [232, 245, 233]);
        setFont(7, 'bold');
        doc.setTextColor(46, 125, 50);
        doc.text('CONSEILS DU COACH', margin + 8, y + 5);
        setFont(7, 'normal');
        doc.setTextColor(27, 94, 32);
        tips.forEach((tip, ti) => {
          let tipText = `\u2022 ${tip}`;
          const maxW = contentWidth - 20;
          if (doc.getTextWidth(tipText) > maxW) {
            while (doc.getTextWidth(tipText + '...') > maxW && tipText.length > 0) {
              tipText = tipText.slice(0, -1);
            }
            tipText += '...';
          }
          doc.text(tipText, margin + 8, y + 11 + ti * 7);
        });
        doc.setTextColor(...colors.black);
        y += tips.length * 7 + 10;
      }

      y += 4;

      // Separator between sessions
      if (si < weekData.sessions.length - 1) {
        drawRect(margin + 20, y, contentWidth - 40, 0.3, colors.lightGray);
        y += 4;
      }
    });

    // Week total footer
    y += 4;
    drawRect(margin, y, contentWidth, 0.5, colors.black);
    y += 6;
    setFont(9, 'bold');
    doc.text(`Total semaine : ${weekData.sessions.filter(s => !s.isRest).length} séances · ${pdfDist(weekData.totalDistance)} km`, margin, y);
  });

  // Save
  const fileName = objective
    ? `plan-${objective.distance.toLowerCase().replace(' ', '-')}-${weeklyPlan.length}sem.pdf`
    : `plan-entrainement-${weeklyPlan.length}sem.pdf`;
  doc.save(fileName);
}
