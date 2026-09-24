/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import {
  faBug,
  faChartLine,
  faCircleQuestion,
  faCog,
  faEllipsis,
  faFileArrowUp,
  faFileZipper,
  faFolderPlus,
  faHashtag,
  faIcons,
  faImages,
  faListCheck,
  faSignOutAlt,
  faTriangleExclamation
} from '@fortawesome/free-solid-svg-icons';

export const mergeEntries = {
  OVERFLOW: {
    routeId: '',
    label: 'More Actions',
    icon: faEllipsis,
    title: 'More Actions'
  },
  MANAGE: { routeId: '/manage', label: 'Manager', icon: faSignOutAlt, title: 'Go to Book Manager' },
  UI_SHOWCASE: {
    routeId: '/ui-showcase',
    label: 'Astryx UI',
    icon: faIcons,
    title: 'Astryx UI Components Showcase'
  },
  SETTINGS: {
    routeId: '/settings/reader',
    label: 'Settings',
    icon: faCog,
    title: 'Go to Reader Settings'
  },
  STATISTICS: {
    routeId: '/statistics',
    label: 'Statistics',
    icon: faChartLine,
    title: 'Go to Statistics'
  },
  JUMP_TO_POSITION: {
    routeId: '',
    label: 'Jump',
    icon: faHashtag,
    title: 'Jump to Position'
  },
  READER_IMAGE_GALLERY: {
    routeId: '',
    label: 'Images',
    icon: faImages,
    title: 'Open Image Gallery'
  },
  DOMAIN_HINT: {
    routeId: '',
    label: 'Domain Hint',
    icon: faTriangleExclamation,
    title: 'Old Domain used'
  },
  DOCUMENTATION: {
    routeId: '/docs/',
    label: 'Documentation',
    icon: faCircleQuestion,
    title: 'Documentation & Guides',
    external: true
  },
  BUG_REPORT: { routeId: '', label: 'Bug Report', icon: faBug, title: 'Report an Issue' },
  BOOK_SELECTION: {
    routeId: '',
    label: 'Select Books',
    icon: faListCheck,
    title: 'Enable Book Selection'
  },
  FOLDER_IMPORT: {
    routeId: '',
    label: 'Import Folder(s)',
    icon: faFolderPlus,
    title: 'Import from Folder'
  },
  FILE_IMPORT: { routeId: '', label: 'Import File(s)', icon: faFileArrowUp, title: 'Import Files' },
  BACKUP_IMPORT: {
    routeId: '',
    label: 'Import Backup',
    icon: faFileZipper,
    title: 'Import Backup'
  }
};
