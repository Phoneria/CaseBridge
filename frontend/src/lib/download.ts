/** Triggers a browser download for a Blob (auth-protected files can't be
 * plain <a href> links because the API needs the Authorization header). */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
