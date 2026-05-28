const SECRET_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
  /\b(?:sk|pk|rk|ghp|github_pat|xox[baprs])_[A-Za-z0-9_:-]{16,}\b/g,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /(?:[A-Za-z]:[/\\]Users[/\\]|\/Users\/|\/home\/)[^/\s"'<>]+/gi,
  /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^"'\s<>]{8,}/gi,
  /^[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*=.*$/gim,
  /\b[A-Za-z0-9+/=_-]{48,}\b/g,
];

export function redactText(input: string) {
  return SECRET_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, "[redacted]"),
    input
  );
}

export function redactJson<T>(input: T): T {
  return JSON.parse(redactText(JSON.stringify(input))) as T;
}
