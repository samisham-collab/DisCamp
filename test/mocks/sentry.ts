// Stand-in for @sentry/react-native: records calls, sends nothing.

import { jest } from '@jest/globals';

export const init = jest.fn();
export const captureException = jest.fn();
export const addBreadcrumb = jest.fn();
