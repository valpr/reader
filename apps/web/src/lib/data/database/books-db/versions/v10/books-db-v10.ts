/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type BooksDbV9 from '$lib/data/database/books-db/versions/v9/books-db-v9';

export interface BooksDbDeviceIdentity {
  id: 0;
  deviceId: string;
  deviceLabel: string;
}

export default interface BooksDbV10 extends BooksDbV9 {
  deviceIdentity: {
    key: number;
    value: BooksDbDeviceIdentity;
  };
}
