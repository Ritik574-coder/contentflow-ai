import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

const DEFAULT_SANITIZE_OPTIONS = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    'img',
    'del',
    's',
    'strike',
  ],
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    a: ['href', 'name', 'target', 'title', 'rel'],
    img: ['src', 'srcset', 'alt', 'title', 'width', 'height', 'loading'],
    code: ['class'],
    pre: ['class'],
    th: ['align', 'colspan', 'rowspan'],
    td: ['align', 'colspan', 'rowspan'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
};

/**
 * Convert Markdown text to clean, Blogger-compatible HTML.
 *
 * @param {string} markdown - The markdown content string to convert.
 * @param {object} [options] - Optional overrides for sanitization or marked parsing.
 * @returns {string} Clean, safe HTML markup.
 */
export function markdownToHtml(markdown, options = {}) {
  const rawText = String(markdown ?? '').trim();
  if (!rawText) return '';

  const markedOptions = {
    gfm: true,
    breaks: false,
    async: false,
    ...(options.marked || {}),
  };

  const parsedHtml = marked.parse(rawText, markedOptions);

  const sanitizeOptions = {
    ...DEFAULT_SANITIZE_OPTIONS,
    ...(options.sanitize || {}),
  };

  return sanitizeHtml(parsedHtml, sanitizeOptions).trim();
}
