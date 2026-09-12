export function extractLocalArtifactReferences(html: string): string[] {
  return [
    ...new Set(
      [
        ...html.matchAll(
          /<(?:a|img|link|script)\b[^>]*(?:href|src)="([^"]+)"/gi,
        ),
      ]
        .map((match) => match[1]!)
        .filter((value) => value.startsWith('/') && !value.startsWith('//'))
        .map((value) => value.split('#')[0]!.split('?')[0]!),
    ),
  ].sort()
}
