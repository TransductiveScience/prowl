import { shouldIgnorePath } from '../config/ignore-service';

/* ── Lazy JSZip loader (handles UMD/CJS export) ────── */

const getJSZipLib = async () => {
  const module = await import('jszip');
  return module.default || module;
};

/* ── Shared type for extracted files ────────────────── */

export interface FileEntry {
    path: string;
    content: string;
}

/* ── Detect the single-level root folder GitHub adds ── */

function detectArchiveRoot(paths: string[]): string {
    if (paths.length === 0) return '';

    const tally: Record<string, number> = {};
    let segmented = 0;

    for (const p of paths) {
        const slashIdx = p.indexOf('/');
        if (slashIdx === -1) continue;
        const segment = p.substring(0, slashIdx);
        tally[segment] = (tally[segment] || 0) + 1;
        segmented++;
    }

    if (segmented === 0) return '';

    let dominant = '';
    let maxHits = 0;
    for (const segment in tally) {
        if (tally[segment] > maxHits) {
            maxHits = tally[segment];
            dominant = segment;
        }
    }

    if (maxHits / segmented > 0.9) {
        return dominant + '/';
    }

    return '';
}

/* ── Public: extract a ZIP file into FileEntry[] ────── */

export async function extractZip(file: File): Promise<FileEntry[]> {
    const JSZip = await getJSZipLib();
    const zip = await JSZip.loadAsync(file);
    const items = Object.entries(zip.files);

    const allPaths: string[] = [];
    for (const [relativePath, entry] of items) {
        if (!entry.dir) {
            allPaths.push(relativePath);
        }
    }

    const archiveRoot = detectArchiveRoot(allPaths);

    const results: FileEntry[] = new Array(allPaths.length);
    let cursor = 0;

    for (const [relativePath, entry] of items) {
        if (entry.dir) continue;

        const normalizedPath = archiveRoot && relativePath.startsWith(archiveRoot)
            ? relativePath.slice(archiveRoot.length)
            : relativePath;

        if (!normalizedPath) continue;
        if (shouldIgnorePath(normalizedPath)) continue;

        const content = await entry.async('string');

        results[cursor] = {
            path: normalizedPath,
            content: content,
        };
        cursor++;
    }

    return results.slice(0, cursor);
}
