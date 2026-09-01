// Content-version validation. Returns a list of ValidationIssue objects
// ({ field, message }). An empty list means the version is publishable.
export function validateContentVersion(version = {}) {
  const issues = [];
  const body = String(version.body ?? '').trim();
  const title = String(version.title ?? '').trim();

  if (!body) issues.push({ field: 'body', message: 'Body is required.' });
  if (!title) issues.push({ field: 'title', message: 'Title is required.' });
  if (!version.category) issues.push({ field: 'category', message: 'Category is required.' });

  return issues;
}

export function hasValidationIssues(issues) {
  return Array.isArray(issues) && issues.length > 0;
}