/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { getParagraphNodes } from '$lib/components/book-reader/get-paragraph-nodes';
import type { BookmarkHighlight } from '$lib/data/database/books-db/versions/books-db';

export function getParagraphToPoint(x: number, y: number) {
  const element = document.elementFromPoint(x, y)?.closest('p');

  if (!element) {
    return undefined;
  }

  const nodes = getParagraphNodes(element);

  if (!nodes.length) {
    return undefined;
  }

  return { range: createRange(nodes[0]), parent: element };
}

export function createRange(node: Node, startOffset = 0, endOffset = 0) {
  const range = new Range();
  range.setStart(node, startOffset);
  range.setEnd(node, endOffset);

  return range;
}

export function getRangeForUserSelection(window: Window, preSelection: Range | undefined) {
  const currentSelection = window.getSelection()?.toString().trim()
    ? window.getSelection()?.getRangeAt(0)
    : undefined;

  let userSelection: Range | undefined;

  if (currentSelection) {
    userSelection = currentSelection;
  } else {
    userSelection = preSelection;
  }

  if (!userSelection) {
    return undefined;
  }

  const nextParagraph = userSelection.endContainer.parentElement?.closest('p');

  if (!nextParagraph) {
    return undefined;
  }

  const nodes = getParagraphNodes(nextParagraph);

  if (!nodes.length) {
    return undefined;
  }

  return createRange(nodes[0]);
}

export function getNodeBoundingRect(document: Document, node: Node) {
  const range = document.createRange();
  range.selectNode(node);
  return range.getBoundingClientRect();
}

export function clearRange(window: Window, timeout = 250) {
  window.getSelection()?.removeAllRanges();

  setTimeout(() => {
    window.getSelection()?.addRange(new Range());
  }, timeout);
}

export function getReferencePoints(
  window: Window,
  element: Element,
  verticalMode: boolean,
  firstDimensionMarginValue: number,
  bottomGap = 0
) {
  const firstDimensionMargin = Math.min(
    Math.max(firstDimensionMarginValue, 0),
    verticalMode ? window.innerWidth / 4 : window.innerHeight / 4
  );
  const rect = element.getBoundingClientRect();
  const elLeftReferencePoint = verticalMode ? firstDimensionMargin : rect.left;
  const elRightReferencePoint = verticalMode
    ? window.innerWidth - firstDimensionMargin
    : rect.right;
  const elTopReferencePoint = verticalMode ? rect.top : firstDimensionMargin;
  const elBottomReferencePoint = verticalMode
    ? rect.bottom
    : window.innerHeight - firstDimensionMargin - bottomGap;
  const pointGap = Number(getComputedStyle(element).lineHeight.replace(/px$/, ''));

  return {
    elLeftReferencePoint,
    elRightReferencePoint,
    elTopReferencePoint,
    elBottomReferencePoint,
    firstDimensionMargin,
    pointGap
  };
}

export function pulseElement(
  element: HTMLElement | undefined | null,
  action: 'add' | 'remove',
  duration: number,
  timeout = 0
) {
  if (!element) {
    return;
  }

  const cssClass = `animate-[pulse_${duration}s_cubic-bezier(0.4,0,0.6,1)_${
    timeout ? '1' : 'infinite'
  }]`;

  element.classList[action](cssClass);

  if (timeout) {
    setTimeout(() => element.classList.remove(cssClass), timeout);
  }
}

export const READABLE_BLOCK_SELECTOR =
  'p, h1, h2, h3, h4, h5, h6, li, blockquote, dt, dd, div.paragraph, div.text';

export function getSectionBlocks(sectionEl: Element): Element[] {
  const blocks = Array.from(sectionEl.querySelectorAll(READABLE_BLOCK_SELECTOR));
  if (blocks.length > 0) {
    return blocks;
  }
  // Fallback: leaf divs containing non-empty text
  return Array.from(sectionEl.querySelectorAll('div')).filter(
    (div) => !div.querySelector('div') && (div.textContent?.trim().length ?? 0) > 0
  );
}

export function findEnclosingBlock(node: Node, blocks: Element[]): Element | undefined {
  let current: Node | null = node;
  while (current) {
    if (current instanceof Element && blocks.includes(current)) {
      return current;
    }
    current = current.parentNode;
  }
  return undefined;
}

export function getBlockTextLength(blockEl: Element): number {
  let len = 0;
  const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (n.parentElement?.closest('rt')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let node = walker.nextNode();
  while (node) {
    len += node.textContent?.length || 0;
    node = walker.nextNode();
  }
  return len;
}

export function getTextOffsetInBlock(
  blockEl: Element,
  targetNode: Node,
  nodeOffset: number
): number {
  let accumulated = 0;

  let normalizedTarget = targetNode;
  let normalizedOffset = nodeOffset;

  if (targetNode.nodeType === Node.ELEMENT_NODE) {
    const el = targetNode as Element;
    if (nodeOffset < el.childNodes.length) {
      normalizedTarget = el.childNodes[nodeOffset];
      normalizedOffset = 0;
    } else {
      normalizedTarget = el.lastChild || el;
      normalizedOffset = normalizedTarget.textContent?.length || 0;
    }
  }

  const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (n.parentElement?.closest('rt')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  let current = walker.nextNode();
  while (current) {
    if (current === normalizedTarget) {
      accumulated += Math.min(normalizedOffset, current.textContent?.length || 0);
      return accumulated;
    }
    if (normalizedTarget.contains(current)) {
      accumulated += current.textContent?.length || 0;
      return accumulated;
    }
    accumulated += current.textContent?.length || 0;
    current = walker.nextNode();
  }

  return accumulated;
}

export function extractNormalizedSnippet(range: Range, maxLength = 500): string {
  try {
    const fragment = range.cloneContents();
    fragment.querySelectorAll('rt').forEach((rt) => rt.remove());
    const text = fragment.textContent || '';
    return text.replace(/\s+/g, ' ').trim().slice(0, maxLength);
  } catch {
    return range.toString().replace(/\s+/g, ' ').trim().slice(0, maxLength);
  }
}

export function getSelectionHighlightData(
  range: Range,
  rootContentEl: HTMLElement,
  isPaginated: boolean,
  currentSectionIndex: number
): BookmarkHighlight | undefined {
  if (!range || range.collapsed) return undefined;
  if (
    !rootContentEl.contains(range.startContainer) ||
    !rootContentEl.contains(range.endContainer)
  ) {
    return undefined;
  }

  let startSectionEl: Element | null = null;
  let endSectionEl: Element | null = null;
  let startSectionIndex = currentSectionIndex;
  let endSectionIndex = currentSectionIndex;

  if (isPaginated) {
    startSectionEl = rootContentEl;
    endSectionEl = rootContentEl;
  } else {
    for (let i = 0; i < rootContentEl.children.length; i += 1) {
      const child = rootContentEl.children[i];
      if (child.contains(range.startContainer)) {
        startSectionEl = child;
        startSectionIndex = i;
      }
      if (child.contains(range.endContainer)) {
        endSectionEl = child;
        endSectionIndex = i;
      }
    }
    if (!startSectionEl) {
      startSectionEl = rootContentEl;
      startSectionIndex = 0;
    }
    if (!endSectionEl) {
      endSectionEl = rootContentEl;
      endSectionIndex = 0;
    }
  }

  const startBlocks = getSectionBlocks(startSectionEl);
  const endBlocks = startSectionEl === endSectionEl ? startBlocks : getSectionBlocks(endSectionEl);

  const startBlock = findEnclosingBlock(range.startContainer, startBlocks);
  const endBlock = findEnclosingBlock(range.endContainer, endBlocks);

  if (!startBlock || !endBlock) return undefined;

  const startBlockIndex = startBlocks.indexOf(startBlock);
  let endBlockIndex = endBlocks.indexOf(endBlock);

  if (startBlockIndex === -1 || endBlockIndex === -1) return undefined;

  const startCharOffset = getTextOffsetInBlock(startBlock, range.startContainer, range.startOffset);
  let endCharOffset = getTextOffsetInBlock(endBlock, range.endContainer, range.endOffset);

  const MAX_BLOCKS = 5;
  if (startSectionIndex === endSectionIndex) {
    if (endBlockIndex - startBlockIndex >= MAX_BLOCKS) {
      endBlockIndex = startBlockIndex + MAX_BLOCKS - 1;
      const clampedBlock = startBlocks[endBlockIndex];
      endCharOffset = getBlockTextLength(clampedBlock);
    }
  }

  const snippet = extractNormalizedSnippet(range);
  if (!snippet) return undefined;

  return {
    start: {
      sectionIndex: startSectionIndex,
      blockIndex: startBlockIndex,
      charOffset: startCharOffset
    },
    end: {
      sectionIndex: endSectionIndex,
      blockIndex: endBlockIndex,
      charOffset: endCharOffset
    },
    snippet
  };
}
