/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import {
  BOOKMARK_COLORS,
  type BookmarkColor,
  type BooksDbUserBookmarkData
} from '$lib/components/book-reader/book-bookmarks/bookmark-types';
import { getSectionBlocks } from '$lib/functions/range-util';

export function hexToRgba(hex: string, alpha = 0.35): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function clearHighlights(containerEl: HTMLElement): void {
  const marks = Array.from(containerEl.querySelectorAll('mark[data-ttu-highlight]'));
  if (!marks.length) return;

  const parentsToNormalize = new Set<Node>();
  for (let i = 0; i < marks.length; i += 1) {
    const mark = marks[i];
    const parent = mark.parentNode;
    if (parent) {
      parentsToNormalize.add(parent);
      mark.replaceWith(...Array.from(mark.childNodes));
    }
  }

  parentsToNormalize.forEach((parent) => {
    if (parent instanceof Element || parent instanceof DocumentFragment) {
      parent.normalize();
    }
  });
}

function getNonRtTextNodes(blockEl: Element): Text[] {
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (n.parentElement?.closest('rt')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let n = walker.nextNode();
  while (n) {
    textNodes.push(n as Text);
    n = walker.nextNode();
  }
  return textNodes;
}

function highlightRangeInBlock(
  blockEl: Element,
  startChar: number,
  endChar: number,
  bookmarkId: number | string,
  color: BookmarkColor
): void {
  const textNodes = getNonRtTextNodes(blockEl);
  if (!textNodes.length) return;

  let acc = 0;
  const nodeSpans = textNodes.map((node) => {
    const len = node.textContent?.length || 0;
    const span = { node, start: acc, end: acc + len };
    acc += len;
    return span;
  });

  const effectiveEnd = Number.isFinite(endChar) ? endChar : acc;
  if (startChar >= effectiveEnd) return;

  const hexColor = BOOKMARK_COLORS[color] || '#3b82f6';
  const bgColor = hexToRgba(hexColor, 0.35);

  const overlappingSpans = nodeSpans.filter(
    (span) => span.end > startChar && span.start < effectiveEnd
  );

  for (let i = 0; i < overlappingSpans.length; i += 1) {
    const span = overlappingSpans[i];
    const nodeLen = span.node.textContent?.length || 0;
    const from = Math.max(0, startChar - span.start);
    const to = Math.min(nodeLen, effectiveEnd - span.start);

    if (from >= to || to <= 0) continue;

    if (to < span.node.length) {
      span.node.splitText(to);
    }

    let target: Text;
    if (from > 0) {
      target = span.node.splitText(from);
    } else {
      target = span.node;
    }

    const mark = document.createElement('mark');
    mark.setAttribute('data-ttu-highlight', String(bookmarkId));
    mark.style.backgroundColor = bgColor;
    mark.style.color = 'inherit';
    mark.style.padding = '0';
    mark.style.margin = '0';
    mark.style.border = '0';
    mark.style.borderRadius = '2px';

    target.replaceWith(mark);
    mark.appendChild(target);
  }
}

export function applyHighlights(
  containerEl: HTMLElement,
  sectionIndex: number,
  bookmarks: BooksDbUserBookmarkData[],
  isPaginated: boolean
): void {
  if (!bookmarks || !bookmarks.length) return;

  // In continuous mode, containerEl has multiple section elements as children.
  // We apply highlights across all relevant sections.
  const sectionsToProcess: { sectionEl: Element; idx: number }[] = [];
  if (isPaginated) {
    sectionsToProcess.push({ sectionEl: containerEl, idx: sectionIndex });
  } else {
    for (let i = 0; i < containerEl.children.length; i += 1) {
      sectionsToProcess.push({ sectionEl: containerEl.children[i], idx: i });
    }
    if (!sectionsToProcess.length) {
      sectionsToProcess.push({ sectionEl: containerEl, idx: 0 });
    }
  }

  for (let s = 0; s < sectionsToProcess.length; s += 1) {
    const { sectionEl, idx: currentSecIdx } = sectionsToProcess[s];

    const matchingBookmarks = bookmarks.filter((b) => {
      if (b.isAutosave || !b.highlight) return false;
      const { start, end } = b.highlight;
      return start.sectionIndex <= currentSecIdx && currentSecIdx <= end.sectionIndex;
    });

    if (!matchingBookmarks.length) continue;

    const blocks = getSectionBlocks(sectionEl);
    if (!blocks.length) continue;

    for (let bIdx = 0; bIdx < matchingBookmarks.length; bIdx += 1) {
      const ub = matchingBookmarks[bIdx];
      const { start, end } = ub.highlight!;
      const bookmarkId = ub.id ?? `bm-${ub.createdAt}`;

      let firstBlockIdx = 0;
      let lastBlockIdx = blocks.length - 1;
      let startOffset = 0;
      let endOffset = Infinity;

      if (start.sectionIndex === currentSecIdx) {
        firstBlockIdx = Math.max(0, Math.min(start.blockIndex, blocks.length - 1));
        startOffset = start.charOffset;
      }
      if (end.sectionIndex === currentSecIdx) {
        lastBlockIdx = Math.max(0, Math.min(end.blockIndex, blocks.length - 1));
        endOffset = end.charOffset;
      }

      if (firstBlockIdx > lastBlockIdx) continue;

      for (let blockIdx = firstBlockIdx; blockIdx <= lastBlockIdx; blockIdx += 1) {
        const blockEl = blocks[blockIdx];
        const blockStart = blockIdx === firstBlockIdx ? startOffset : 0;
        const blockEnd = blockIdx === lastBlockIdx ? endOffset : Infinity;

        highlightRangeInBlock(blockEl, blockStart, blockEnd, bookmarkId, ub.color);
      }
    }
  }
}
