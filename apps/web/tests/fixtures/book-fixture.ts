/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type { Page } from '@playwright/test';
import { currentDbVersion } from '../../src/lib/data/database/books-db/versions/books-db';

export interface TestSection {
  reference: string;
  charactersWeight: number;
  label?: string;
  startCharacter?: number;
  characters?: number;
}

export interface TestBookData {
  id: number;
  title: string;
  language?: string;
  styleSheet: string;
  elementHtml: string;
  blobs: Record<string, any>;
  coverImage?: string;
  hasThumb: boolean;
  characters: number;
  sections?: TestSection[];
  lastBookModified: number;
  lastBookOpen: number;
  storageSource?: string;
  tags?: string[];
}

export const SAMPLE_BOOK: TestBookData = {
  id: 1,
  title: '吾輩は猫である (Playwright Test Book)',
  language: 'ja',
  styleSheet: '',
  elementHtml: `
    <div id="section-1" class="reader-chapter">
      <h2>第一章 吾輩の誕生</h2>
      <p>吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。吾輩はここで始めて人間というものを見た。しかもあとで聞くとそれは書生という人間中で一番獰悪な種族であったそうだ。この書生というのは時々我々を捕えて煮て食うという話である。</p>
      <p>しかしその当時は何という考もなかったから別段恐しいとも思わなかった。ただ彼の掌に載せられてスーと持ち上げられた時何だかフワフワした感じがあったばかりである。掌の上で少し落ちついて書生の顔を見たのがいわゆる人間というものの見始であろう。</p>
    </div>
    <div id="section-2" class="reader-chapter">
      <h2>第二章 人間というもの</h2>
      <p>この時妙なものだと思った感じが今でも残っている。第一毛をもって装飾されべきはずの顔がつるつるしてまるで薬缶だ。その後猫にも大分逢ったがこんな片輪には一度も出会わした事がない。のみならず顔の真中があまりに突起している。そうしてその穴の中から時々ぷうぷうと煙を吹く。どうも咽せぽくて実に弱った。これが人間の飲む煙草というものである事はようやくこの頃知った。</p>
      <p>この書生の掌の裏でしばらくはよい心持に坐っておったが、しばらくすると非常な速力で動く。書生が動くのか自分だけが動くのか分らないが無暗に眼が廻る。胸が悪くなる。到底助からないと思っていると、どさりと音がして眼から火が出た。それまでは記憶しているがあとは何の事やらすがりついた。</p>
    </div>
    <div id="section-3" class="reader-chapter">
      <h2>第三章 主人の家</h2>
      <p>気が付いて見ると書生はもう居ない。たくさん居た兄弟が一疋も見えぬ。肝心の母親さえ姿を隠してしまった。その上今までの所とは違って無暗に明るい。眼を明いていられぬくらいだ。はてな何だろうと這い出して見るとどうも痛い。藁の上から急に笹原の中へ棄てられたのである。</p>
      <p>ようやくの思いで池の端へ辿り着いた。ここでしばらく休んで、それからまた這い出した。竹垣の崩れた所から何とか潜り込んで、ようやくある家の庭へ入る事ができた。これが今の主人の家である。</p>
    </div>
  `,
  blobs: {},
  hasThumb: false,
  characters: 1200,
  sections: [
    {
      reference: 'section-1',
      charactersWeight: 400,
      label: '第一章 吾輩の誕生',
      startCharacter: 0,
      characters: 400
    },
    {
      reference: 'section-2',
      charactersWeight: 400,
      label: '第二章 人間というもの',
      startCharacter: 400,
      characters: 400
    },
    {
      reference: 'section-3',
      charactersWeight: 400,
      label: '第三章 主人の家',
      startCharacter: 800,
      characters: 400
    }
  ],
  lastBookModified: Date.now(),
  lastBookOpen: Date.now()
};

export interface ReaderSettingsOptions {
  viewMode?: 'paginated' | 'continuous';
  writingMode?: 'vertical-rl' | 'horizontal-tb';
  fontSize?: number;
  theme?: string;
  enableTapEdgeToFlip?: boolean;
  showCharacterCounter?: boolean;
  showPercentage?: boolean;
}

/**
 * Configure reader localStorage settings before navigating
 */
export async function setReaderSettings(page: Page, settings: ReaderSettingsOptions) {
  await page.evaluate((s) => {
    if (s.viewMode !== undefined) {
      localStorage.setItem('viewMode', s.viewMode);
    }
    if (s.writingMode !== undefined) {
      localStorage.setItem('writingMode', s.writingMode);
    }
    if (s.fontSize !== undefined) {
      localStorage.setItem('fontSize', `${s.fontSize}`);
    }
    if (s.theme !== undefined) {
      localStorage.setItem('theme', s.theme);
    }
    if (s.enableTapEdgeToFlip !== undefined) {
      localStorage.setItem('enableTapEdgeToFlip', s.enableTapEdgeToFlip ? '1' : '0');
    }
    if (s.showCharacterCounter !== undefined) {
      localStorage.setItem('showCharacterCounter', s.showCharacterCounter ? '1' : '0');
    }
    if (s.showPercentage !== undefined) {
      localStorage.setItem('showPercentage', s.showPercentage ? '1' : '0');
    }
  }, settings);
}

/**
 * Directly seeds the IndexedDB 'books' database with a book record, default bookmark, and lastItem.
 * Ensures fast (<100ms) setup for reader tests.
 */
export async function seedReaderBook(
  page: Page,
  customBook: Partial<TestBookData> = {},
  settings: ReaderSettingsOptions = {}
): Promise<TestBookData> {
  const fullBook: TestBookData = {
    ...SAMPLE_BOOK,
    ...customBook,
    lastBookModified: Date.now(),
    lastBookOpen: Date.now()
  };

  // Navigate to root to ensure origin is set
  await page.goto('/');

  // Apply settings to localStorage
  await setReaderSettings(page, settings);

  // Seed IndexedDB
  await page.evaluate(
    async ({ book, version }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('books', version);
        request.onupgradeneeded = () => {
          const d = request.result;
          if (!d.objectStoreNames.contains('data')) {
            const ds = d.createObjectStore('data', { keyPath: 'id', autoIncrement: true });
            ds.createIndex('title', 'title');
          }
          if (!d.objectStoreNames.contains('bookmark')) {
            d.createObjectStore('bookmark', { keyPath: 'dataId' });
          }
          if (!d.objectStoreNames.contains('userBookmark')) {
            const us = d.createObjectStore('userBookmark', { keyPath: 'id', autoIncrement: true });
            us.createIndex('dataId', 'dataId');
          }
          if (!d.objectStoreNames.contains('lastItem')) {
            d.createObjectStore('lastItem');
          }
          if (!d.objectStoreNames.contains('storageSource')) {
            d.createObjectStore('storageSource', { keyPath: 'name' });
          }
          if (!d.objectStoreNames.contains('statistic')) {
            const ss = d.createObjectStore('statistic', { keyPath: ['title', 'dateKey'] });
            ss.createIndex('dateKey', 'dateKey');
            ss.createIndex('completedBook', ['completedBook', 'title']);
          }
          if (!d.objectStoreNames.contains('readingGoal')) {
            const rs = d.createObjectStore('readingGoal', { keyPath: 'goalStartDate' });
            rs.createIndex('goalEndDate', 'goalEndDate');
          }
          if (!d.objectStoreNames.contains('lastModified')) {
            d.createObjectStore('lastModified', { keyPath: ['title', 'dataType'] });
          }
          if (!d.objectStoreNames.contains('audioBook')) {
            d.createObjectStore('audioBook', { keyPath: 'title' });
          }
          if (!d.objectStoreNames.contains('subtitle')) {
            d.createObjectStore('subtitle', { keyPath: 'title' });
          }
          if (!d.objectStoreNames.contains('handle')) {
            d.createObjectStore('handle', { keyPath: ['title', 'dataType'] });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['data', 'bookmark', 'lastItem'], 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);

        tx.objectStore('data').put(book);
        tx.objectStore('bookmark').put({
          dataId: book.id,
          exploredCharCount: 0,
          progress: 0,
          lastBookmarkModified: Date.now()
        });
        tx.objectStore('lastItem').put({ dataId: book.id }, 0);
      });
    },
    { book: fullBook, version: currentDbVersion }
  );

  return fullBook;
}

/**
 * Seeds statistics records directly into the 'statistic' store in IndexedDB.
 */
export async function seedStatistics(page: Page, statistics: any[]): Promise<void> {
  await page.evaluate(
    async ({ stats, version }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('books', version);
        request.onupgradeneeded = () => {
          const d = request.result;
          if (!d.objectStoreNames.contains('data')) {
            const ds = d.createObjectStore('data', { keyPath: 'id', autoIncrement: true });
            ds.createIndex('title', 'title');
          }
          if (!d.objectStoreNames.contains('statistic')) {
            const ss = d.createObjectStore('statistic', { keyPath: ['title', 'dateKey'] });
            ss.createIndex('dateKey', 'dateKey');
            ss.createIndex('completedBook', ['completedBook', 'title']);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['statistic'], 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        const store = tx.objectStore('statistic');
        for (const s of stats) {
          store.put(s);
        }
      });
    },
    { stats: statistics, version: currentDbVersion }
  );
}
