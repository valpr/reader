/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 *
 * Native Canvas 2D renderer for the shareable Reading Recap card.
 * Zero dependencies: draws a fixed-size 1080x1350 portrait card from
 * LookbackMetrics and triggers a PNG download. Text-only (no cover art)
 * to avoid canvas taint from cross-origin/blob images.
 */

import { formatBunkobonPages } from '$lib/functions/statistic-util';
import type { LookbackMetrics } from './lookback-types';

export const RECAP_EXPORT_WIDTH = 1080;
export const RECAP_EXPORT_HEIGHT = 1350;

const FONT_STACK = `'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Yu Gothic', system-ui, sans-serif`;

function formatSeconds(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function formatNumber(num: number): string {
  return num.toLocaleString();
}

export function recapExportFilename(metrics: LookbackMetrics): string {
  const label = metrics.targetYear === 'all' ? 'all-time' : String(metrics.targetYear);
  return `reading-recap-${label}.png`;
}

/** Truncate with ellipsis so text fits maxWidth. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = '…';
  let truncated = text;
  while (truncated.length > 0) {
    truncated = truncated.slice(0, -1);
    if (ctx.measureText(truncated + ellipsis).width <= maxWidth) return truncated + ellipsis;
  }
  return ellipsis;
}

/** Greedy word-wrap; falls back to hard-splitting unbreakable tokens (JP titles, timestamps). */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  const push = (line: string) => {
    if (lines.length < maxLines) lines.push(line);
  };

  for (const word of words) {
    // Hard-split a single word that alone exceeds the width (e.g. long unbroken title).
    if (ctx.measureText(word).width > maxWidth) {
      if (current) push(current);
      let chunk = '';
      for (const ch of word) {
        if (ctx.measureText(chunk + ch).width > maxWidth && chunk) {
          push(chunk);
          if (lines.length >= maxLines) return lines;
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      current = chunk;
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      push(current);
      if (lines.length >= maxLines) return lines;
      current = word;
    }
  }
  if (current) push(current);
  return lines;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function drawRecapCard(metrics: LookbackMetrics): HTMLCanvasElement {
  const W = RECAP_EXPORT_WIDTH;
  const H = RECAP_EXPORT_HEIGHT;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  const yearLabel = metrics.targetYear === 'all' ? 'All-Time' : String(metrics.targetYear);
  const peakLabel = metrics.hourlyDistribution[metrics.peakReadingHour]?.label ?? '';

  // Background: deep indigo -> zinc gradient.
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#1e1b4b');
  bg.addColorStop(0.45, '#2e1065');
  bg.addColorStop(1, '#09090b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle accent glow.
  const glow = ctx.createRadialGradient(W / 2, 220, 40, W / 2, 220, 620);
  glow.addColorStop(0, 'rgba(129, 140, 248, 0.28)');
  glow.addColorStop(1, 'rgba(129, 140, 248, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const pad = 72;
  const contentW = W - pad * 2;
  let y = 88;

  // Eyebrow.
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = `600 26px ${FONT_STACK}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('L O O K B A C K   R E C A P', pad, y);
  y += 66;

  // Title.
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 68px ${FONT_STACK}`;
  ctx.fillText(fitText(ctx, `${yearLabel} in Reading`, contentW), pad, y);
  y += 46;

  // Subtitle.
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = `400 28px ${FONT_STACK}`;
  ctx.fillText('Your personal reading journey, habits, and milestones.', pad, y);
  y += 56;

  // Persona card.
  const cardX = pad;
  const cardW = contentW;
  const cardTop = y;
  const descLines = wrapText(ctx, metrics.primaryArchetype.description, cardW - 96, 3);
  const cardH = 300 + descLines.length * 38;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  roundRectPath(ctx, cardX, cardTop, cardW, cardH, 28);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const innerX = cardX + 48;
  let cy = cardTop + 96;
  ctx.font = '400 84px "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  ctx.fillText(metrics.primaryArchetype.badge, innerX, cy);
  ctx.fillStyle = '#c4b5fd';
  ctx.font = `700 26px ${FONT_STACK}`;
  ctx.fillText('PRIMARY PERSONA', innerX + 130, cardTop + 62);
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 52px ${FONT_STACK}`;
  ctx.fillText(
    fitText(ctx, metrics.primaryArchetype.name, cardW - 130 - 96),
    innerX + 130,
    cardTop + 122
  );
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `italic 400 28px ${FONT_STACK}`;
  cy += 8;
  ctx.fillText(fitText(ctx, `"${metrics.primaryArchetype.tagline}"`, cardW - 96), innerX, cy + 44);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `400 27px ${FONT_STACK}`;
  descLines.forEach((line, i) => {
    ctx.fillText(line, innerX, cy + 92 + i * 38);
  });
  y = cardTop + cardH + 48;

  // Stat grid: 2 columns x 3 rows.
  const stats: { label: string; value: string; sub: string }[] = [
    {
      label: 'READING TIME',
      value: formatSeconds(metrics.totalReadingTimeSeconds),
      sub: 'total immersion'
    },
    {
      label: 'CHARACTERS',
      value: formatNumber(metrics.totalCharactersRead),
      sub: `≈ ${formatBunkobonPages(metrics.totalCharactersRead)} bunkobon pages`
    },
    {
      label: 'ACTIVE DAYS',
      value: `${metrics.activeReadingDays} / ${metrics.totalDaysInPeriod}`,
      sub: `${metrics.consistencyPercentage}% consistency`
    },
    {
      label: 'LONGEST STREAK',
      value: `${metrics.longestStreakDays} ${metrics.longestStreakDays === 1 ? 'day' : 'days'}`,
      sub: 'unbroken habit'
    },
    {
      label: 'BOOKS FINISHED',
      value: `${metrics.booksCompleted} / ${metrics.booksStarted}`,
      sub: `${metrics.completionRate}% completion rate`
    },
    {
      label: 'CHRONOTYPE',
      value: metrics.peakTimeCategory,
      sub: peakLabel ? `peak: ${peakLabel}` : 'peak reading window'
    }
  ];

  const gap = 24;
  const cellW = (contentW - gap) / 2;
  const cellH = 168;
  stats.forEach((stat, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = pad + col * (cellW + gap);
    const sy = y + row * (cellH + gap);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    roundRectPath(ctx, x, sy, cellW, cellH, 20);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `600 22px ${FONT_STACK}`;
    ctx.fillText(stat.label, x + 28, sy + 44);
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 42px ${FONT_STACK}`;
    ctx.fillText(fitText(ctx, stat.value, cellW - 56), x + 28, sy + 100);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = `400 24px ${FONT_STACK}`;
    ctx.fillText(fitText(ctx, stat.sub, cellW - 56), x + 28, sy + 138);
  });
  y += 3 * (cellH + gap) + 24;

  // #1 book strip.
  const stripH = 148;
  ctx.fillStyle = 'rgba(251, 191, 36, 0.10)';
  roundRectPath(ctx, pad, y, contentW, stripH, 20);
  ctx.fill();
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#fcd34d';
  ctx.font = `700 22px ${FONT_STACK}`;
  ctx.fillText('TOP MILESTONE  •  #1 BOOK', pad + 28, y + 44);
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 40px ${FONT_STACK}`;
  const bookTitle = metrics.numberOneBook ? metrics.numberOneBook.title : 'No books recorded yet';
  ctx.fillText(fitText(ctx, bookTitle, contentW - 56), pad + 28, y + 98);
  if (metrics.numberOneBook) {
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = `400 24px ${FONT_STACK}`;
    ctx.fillText(
      fitText(
        ctx,
        `${formatSeconds(metrics.numberOneBook.readingTimeSeconds)}  •  ${formatNumber(metrics.numberOneBook.charactersRead)} chars`,
        contentW - 56
      ),
      pad + 28,
      y + 130
    );
  }
  y += stripH + 40;

  // Footer: drop-off cliff + device + branding.
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = `400 25px ${FONT_STACK}`;
  const footerLeft = `Drop-off cliff: ${metrics.dropOffAnalysis.medianDropOffPercentage}%`;
  const footerRight = metrics.topProfile
    ? `Top device: ${metrics.topProfile.profileName} (${metrics.topProfile.percentage}%)`
    : 'Single-device immersion';
  ctx.fillText(fitText(ctx, footerLeft, contentW / 2 - 16), pad, y);
  const rightW = ctx.measureText(fitText(ctx, footerRight, contentW / 2 - 16)).width;
  ctx.fillText(fitText(ctx, footerRight, contentW / 2 - 16), pad + contentW - rightW, y);
  y += 52;
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = `600 24px ${FONT_STACK}`;
  ctx.fillText('ッ Reader  •  Reading Lookback', pad, y);

  return canvas;
}

/** Render the recap card and trigger a PNG file download. Rejects on failure. */
export async function downloadRecapImage(metrics: LookbackMetrics): Promise<void> {
  const canvas = drawRecapCard(metrics);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/png')
  );
  if (!blob) throw new Error('Failed to encode recap image');
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = recapExportFilename(metrics);
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // Revoke on next tick so the download has a chance to start.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
