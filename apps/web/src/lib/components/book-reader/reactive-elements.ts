/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { NEVER, filter, fromEvent, merge, take, tap } from 'rxjs';

import { FuriganaStyle } from '../../data/furigana-style';
import { nextChapter$ } from '$lib/components/book-reader/book-toc/book-toc';
import {
  readerImageGalleryPictures$,
  toggleImageGalleryPictureSpoiler$
} from '$lib/components/book-reader/book-reader-image-gallery/book-reader-image-gallery';
import { openImagePreview } from '$lib/components/book-reader/book-reader-image-preview/book-reader-image-preview';
import { isElementGaiji } from '$lib/functions/is-element-gaiji';

export function reactiveElements(
  document: Document,
  furiganaStyle: FuriganaStyle,
  hideSpoilerImage: boolean,
  isExtendedMode: boolean
) {
  const anchorTagDocumentListener = anchorTagListener(document);
  const spoilerImageDocumentListener = spoilerImageListener(document);

  return (contentEl: HTMLElement) =>
    merge(
      anchorTagDocumentListener(contentEl),
      rubyTagListener(contentEl, furiganaStyle),
      spoilerImageDocumentListener(contentEl),
      imagePreviewListener(contentEl, hideSpoilerImage, isExtendedMode)
    );
}

function anchorTagListener(document: Document) {
  return (contentEl: HTMLElement) => {
    const anchorTags = Array.from(contentEl.getElementsByTagName('a'));
    anchorTags.forEach((el) => {
      el.href = document.location.pathname + el.hash;
    });

    const obs$ = anchorTags.map((el) =>
      fromClickEvent(el).pipe(tap(() => nextChapter$.next(el.hash.substring(1))))
    );
    return merge(...obs$);
  };
}

function rubyTagListener(contentEl: HTMLElement, furiganaStyle: FuriganaStyle) {
  if (furiganaStyle === FuriganaStyle.Hide) {
    return NEVER;
  }

  const isToggle = furiganaStyle === FuriganaStyle.Toggle;
  const rubyTags = Array.from(contentEl.getElementsByTagName('ruby'));
  const obs$ = rubyTags.map((el) =>
    isToggle
      ? fromClickEvent(el).pipe(
          tap(() => {
            el.classList.toggle('reveal-rt');
          })
        )
      : fromClickEvent(el).pipe(
          take(1),
          tap(() => {
            el.classList.add('reveal-rt');
          })
        )
  );
  return merge(...obs$);
}

function spoilerImageListener(document: Document) {
  return (contentEl: HTMLElement) => {
    const elements = Array.from(contentEl.querySelectorAll('[data-ttu-spoiler-img]'));
    const obs$ = elements.map((el) => {
      const spoilerLabelEl = document.createElement('span');
      spoilerLabelEl.title = 'Show Image';
      spoilerLabelEl.classList.add('spoiler-label');
      spoilerLabelEl.setAttribute('aria-hidden', 'true');
      spoilerLabelEl.innerText = 'ネタバレ';
      el.appendChild(spoilerLabelEl);

      const imageElement = el.querySelector('img,image');

      toggleImageGalleryPictureSpoiler(imageElement, false);

      return fromClickEvent(el).pipe(
        take(1),
        tap(() => {
          el.removeChild(spoilerLabelEl);
          el.removeAttribute('data-ttu-spoiler-img');

          imageElement?.classList.add('ttu-unspoilered');

          toggleImageGalleryPictureSpoiler(imageElement, true);
        })
      );
    });
    return merge(...obs$);
  };
}

function imagePreviewListener(
  contentEl: HTMLElement,
  hideSpoilerImage: boolean,
  isExtendedMode: boolean
) {
  const imgElements = [
    ...Array.from(contentEl.querySelectorAll<HTMLImageElement>('img')),
    ...Array.from(contentEl.querySelectorAll<HTMLElement>('image'))
  ].filter((el) => {
    if (el.classList.contains('gaiji') || (el instanceof HTMLImageElement && isElementGaiji(el))) {
      return false;
    }
    return true;
  });

  const svgElements = Array.from(contentEl.querySelectorAll<SVGElement>('svg')).filter((svg) => {
    return svg.querySelector('image') !== null;
  });

  const imgObservables = imgElements.map((elm) => {
    elm.draggable = false;

    return merge(
      fromEvent(elm, 'contextmenu').pipe(
        tap((event) => {
          if (isExtendedMode) {
            event.preventDefault();
          }
        })
      ),
      fromEvent<MouseEvent>(elm, 'click').pipe(
        filter(() => {
          if (elm.closest('a')) {
            return false;
          }
          if (hideSpoilerImage && elm.closest('[data-ttu-spoiler-img]')) {
            return false;
          }
          return true;
        }),
        tap((ev) => {
          ev.preventDefault();
          ev.stopPropagation();

          const src =
            elm.getAttribute('src') ||
            elm.getAttribute('href') ||
            elm.getAttribute('xlink:href') ||
            (elm as any).currentSrc;
          if (!src) return;

          const pictures = readerImageGalleryPictures$.getValue();
          const index = pictures.findIndex((p) => p.url === src);

          openImagePreview(src, index, elm.getAttribute('alt') || undefined);
        })
      )
    );
  });

  const svgObservables = svgElements.map((svgEl) => {
    const childImage = svgEl.querySelector('image');
    if (!childImage) return NEVER;

    return merge(
      fromEvent(svgEl, 'contextmenu').pipe(
        tap((event) => {
          if (isExtendedMode) {
            event.preventDefault();
          }
        })
      ),
      fromEvent<MouseEvent>(svgEl, 'click').pipe(
        filter((ev) => {
          if (svgEl.closest('a') || childImage.closest('a')) return false;
          if (ev.target === childImage) return false;
          if (hideSpoilerImage && svgEl.closest('[data-ttu-spoiler-img]')) {
            return false;
          }
          return true;
        }),
        tap((ev) => {
          ev.preventDefault();
          ev.stopPropagation();

          const src =
            childImage.getAttribute('href') ||
            childImage.getAttribute('xlink:href') ||
            childImage.getAttribute('src');
          if (!src) return;

          const pictures = readerImageGalleryPictures$.getValue();
          const index = pictures.findIndex((p) => p.url === src);

          openImagePreview(src, index, childImage.getAttribute('alt') || undefined);
        })
      )
    );
  });

  return merge(...imgObservables, ...svgObservables);
}

function toggleImageGalleryPictureSpoiler(imageElement: Element | null, unspoilered: boolean) {
  if (imageElement instanceof HTMLImageElement) {
    toggleImageGalleryPictureSpoiler$.next({ url: imageElement.src, unspoilered });
  } else if (imageElement && 'href' in imageElement) {
    toggleImageGalleryPictureSpoiler$.next({
      url: (imageElement.href as SVGAnimatedString).baseVal,
      unspoilered
    });
  }
}

function fromClickEvent(el: Element) {
  return fromEvent(el, 'click').pipe(
    tap((ev) => {
      ev.preventDefault();
      ev.stopImmediatePropagation();
    })
  );
}
