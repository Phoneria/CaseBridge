export function readingMarkdown(text: string) {
  if (!/Kurgusal (?:örnek|dosya|belge) · [CH]\d{2}/u.test(text)) return text;
  return text.split(/\n\s*\n/).map((block, index) => {
    if (index === 0) return '# ' + block;
    const [heading, ...lines] = block.split('\n');
    if (!lines.length || heading.length > 65 || /[:.!?]/.test(heading)) return block;
    return '## ' + heading + '\n\n' + lines.join('  \n');
  }).join('\n\n');
}
