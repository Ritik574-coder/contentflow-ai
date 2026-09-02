import test from 'node:test';
import assert from 'node:assert/strict';

import { markdownToHtml } from '../src/shared/markdown.js';

test('markdownToHtml converts headings to appropriate HTML tags', () => {
  const md = `# Main Title
## Section Heading
### Subsection Heading
#### Level 4
##### Level 5
###### Level 6`;

  const html = markdownToHtml(md);

  assert.ok(html.includes('<h1>Main Title</h1>'));
  assert.ok(html.includes('<h2>Section Heading</h2>'));
  assert.ok(html.includes('<h3>Subsection Heading</h3>'));
  assert.ok(html.includes('<h4>Level 4</h4>'));
  assert.ok(html.includes('<h5>Level 5</h5>'));
  assert.ok(html.includes('<h6>Level 6</h6>'));
});

test('markdownToHtml converts inline formatting (bold, italic, strikethrough, code)', () => {
  const md = `This is **bold text**, *italic text*, ~~strikethrough text~~, and \`inline code\`.`;
  const html = markdownToHtml(md);

  assert.ok(html.includes('<strong>bold text</strong>'));
  assert.ok(html.includes('<em>italic text</em>'));
  assert.ok(html.includes('<del>strikethrough text</del>') || html.includes('<s>strikethrough text</s>') || html.includes('<strike>strikethrough text</strike>'));
  assert.ok(html.includes('<code>inline code</code>'));
});

test('markdownToHtml converts unordered and ordered lists', () => {
  const unorderedMd = `- Item one
- Item two
- Item three`;

  const unorderedHtml = markdownToHtml(unorderedMd);
  assert.ok(unorderedHtml.includes('<ul>'));
  assert.ok(unorderedHtml.includes('<li>Item one</li>'));
  assert.ok(unorderedHtml.includes('<li>Item two</li>'));
  assert.ok(unorderedHtml.includes('<li>Item three</li>'));
  assert.ok(unorderedHtml.includes('</ul>'));

  const orderedMd = `1. First step
2. Second step
3. Third step`;

  const orderedHtml = markdownToHtml(orderedMd);
  assert.ok(orderedHtml.includes('<ol>'));
  assert.ok(orderedHtml.includes('<li>First step</li>'));
  assert.ok(orderedHtml.includes('<li>Second step</li>'));
  assert.ok(orderedHtml.includes('<li>Third step</li>'));
  assert.ok(orderedHtml.includes('</ol>'));
});

test('markdownToHtml converts links and images safely', () => {
  const md = `Check out [ContentFlow AI](https://github.com/Ritik574-coder/contentflow-ai) and image ![Logo](https://example.com/logo.png).`;
  const html = markdownToHtml(md);

  assert.ok(html.includes('<a href="https://github.com/Ritik574-coder/contentflow-ai">ContentFlow AI</a>'));
  assert.ok(html.includes('<img src="https://example.com/logo.png" alt="Logo" />') || html.includes('<img src="https://example.com/logo.png" alt="Logo">'));
});

test('markdownToHtml converts blockquotes and code blocks', () => {
  const md = `> This is a notable quote.

\`\`\`javascript
const greeting = "Hello, ContentFlow!";
console.log(greeting);
\`\`\``;

  const html = markdownToHtml(md);

  assert.ok(html.includes('<blockquote>'));
  assert.ok(html.includes('<p>This is a notable quote.</p>'));
  assert.ok(html.includes('</blockquote>'));
  assert.ok(html.includes('<pre><code class="language-javascript">'));
  assert.ok(html.includes('const greeting = "Hello, ContentFlow!";'));
  assert.ok(html.includes('</code></pre>'));
});

test('markdownToHtml converts markdown tables', () => {
  const md = `| Platform | Status |
|---|---|
| Blogger | Enabled |
| DEV.to | Enabled |`;

  const html = markdownToHtml(md);

  assert.ok(html.includes('<table>'));
  assert.ok(html.includes('<thead>'));
  assert.ok(html.includes('<th>Platform</th>'));
  assert.ok(html.includes('<tbody>'));
  assert.ok(html.includes('<td>Blogger</td>'));
  assert.ok(html.includes('</table>'));
});

test('markdownToHtml converts multiline content with paragraphs', () => {
  const md = `First paragraph with some details.

Second paragraph with more information.`;

  const html = markdownToHtml(md);

  assert.ok(html.includes('<p>First paragraph with some details.</p>'));
  assert.ok(html.includes('<p>Second paragraph with more information.</p>'));
});

test('markdownToHtml sanitizes dangerous HTML tags and XSS attacks', () => {
  const dangerousMd = `
# Safe Title
<script>alert('xss')</script>
<iframe src="https://malicious.com"></iframe>
<a href="javascript:alert('pwned')">Click here</a>
<img src="x" onerror="alert(1)" />
<object data="evil.swf"></object>
`;

  const html = markdownToHtml(dangerousMd);

  assert.ok(html.includes('<h1>Safe Title</h1>'));
  assert.equal(html.includes('<script>'), false);
  assert.equal(html.includes('alert(\'xss\')'), false);
  assert.equal(html.includes('<iframe'), false);
  assert.equal(html.includes('javascript:'), false);
  assert.equal(html.includes('onerror='), false);
  assert.equal(html.includes('<object'), false);
});

test('markdownToHtml handles edge cases: null, undefined, empty strings', () => {
  assert.equal(markdownToHtml(''), '');
  assert.equal(markdownToHtml(null), '');
  assert.equal(markdownToHtml(undefined), '');
  assert.equal(markdownToHtml('   '), '');
});
