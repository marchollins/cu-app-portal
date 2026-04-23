export function createDownloadHeaders(filename: string) {
  return new Headers({
    "content-type": "application/zip",
    "content-disposition": `attachment; filename="${filename}"`,
  });
}
