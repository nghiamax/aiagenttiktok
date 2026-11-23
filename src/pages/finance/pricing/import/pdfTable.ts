// Dựng lại bảng từ chữ trong file PDF (bảng phí ngành TikTok / Shopee xuất từ Excel).
// Logic thuần — nhận vị trí từng mẩu chữ, trả bảng string[][]. Test ở tests/pricing.test.ts

export interface PdfTextItem {
  str: string;
  /** Toạ độ góc trái dưới (đơn vị PDF, y tăng lên trên) */
  x: number;
  y: number;
  width: number;
}

interface Cell {
  text: string;
  x0: number;
  x1: number;
  y: number;
}

interface Column {
  x0: number;
  x1: number;
}

/** Ô phí dạng "12.50%" / "7,5 %" — dùng để nhận ra dòng dữ liệu */
const PERCENT_CELL = /^\d{1,2}([.,]\d+)?\s*%$/;
const DEFAULT_ROW = /m[aặ]c [dđ][iị]nh/i;
const LINE_TOLERANCE = 3;

/** Gom mẩu chữ cùng hàng (y gần nhau), trên xuống dưới, trái sang phải */
function toLines(items: PdfTextItem[]): Cell[][] {
  const sorted = items
    .filter((i) => i.str.trim())
    .map((i) => ({ text: i.str.replace(/\s+/g, ' ').trim(), x0: i.x, x1: i.x + i.width, y: i.y }))
    .sort((a, b) => b.y - a.y || a.x0 - b.x0);
  const lines: Cell[][] = [];
  for (const c of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last[0].y - c.y) <= LINE_TOLERANCE) last.push(c);
    else lines.push([c]);
  }
  return lines.map((l) => l.sort((a, b) => a.x0 - b.x0));
}

const isDataLine = (line: Cell[]) =>
  line.length >= 2 &&
  line.some((c) => PERCENT_CELL.test(c.text)) &&
  line.some((c) => !PERCENT_CELL.test(c.text) && !/^\d+$/.test(c.text)) &&
  !line.some((c) => DEFAULT_ROW.test(c.text));

/** Cột lấy từ các ô tiêu đề: ô chồng nhau theo chiều ngang (tiêu đề nhiều dòng) thuộc cùng cột */
function columnsFromHeader(headerCells: Cell[]): Column[] {
  const cols: Column[] = [];
  for (const c of [...headerCells].sort((a, b) => a.x0 - b.x0)) {
    const last = cols[cols.length - 1];
    if (last && c.x0 < last.x1 - 1) last.x1 = Math.max(last.x1, c.x1);
    else cols.push({ x0: c.x0, x1: c.x1 });
  }
  return cols;
}

/** Cột từ dòng dữ liệu đủ ô nhất (khi không có tiêu đề) */
function columnsFromData(lines: Cell[][]): Column[] {
  const widest = lines.filter(isDataLine).sort((a, b) => b.length - a.length)[0] ?? [];
  return widest.map((c) => ({ x0: c.x0, x1: c.x1 }));
}

/** Ô thuộc cột khớp nhất: so mép trái (chữ căn trái), tâm (căn giữa) và mép phải (số căn phải) */
function nearestColumn(cell: Cell, cols: Column[]): number {
  const center = (cell.x0 + cell.x1) / 2;
  let best = 0;
  let bestD = Infinity;
  cols.forEach((col, i) => {
    const d = Math.min(
      Math.abs(cell.x0 - col.x0),
      Math.abs(center - (col.x0 + col.x1) / 2),
      Math.abs(cell.x1 - col.x1),
    );
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Mảnh chữ sát nhau (PDF tách 1 chữ làm 2: "Đồ uố" + "ng") thì nối liền, cách xa mới thêm dấu cách */
const WORD_GAP = 1.5;

function lineToRow(line: Cell[], cols: Column[]): string[] {
  const groups: Cell[][] = cols.map(() => []);
  for (const c of line) groups[nearestColumn(c, cols)].push(c);
  return groups.map((cells) => {
    let out = '';
    let prev: Cell | null = null;
    for (const c of cells.sort((a, b) => b.y - a.y || a.x0 - b.x0)) {
      const glue = !prev ? '' : Math.abs(prev.y - c.y) <= LINE_TOLERANCE && c.x0 - prev.x1 < WORD_GAP ? '' : ' ';
      out += glue + c.text;
      prev = c;
    }
    return out;
  });
}

/**
 * Các trang PDF → một bảng: các dòng tiêu đề (trước dòng dữ liệu đầu tiên) giữ nguyên từng dòng,
 * kế đến dòng "phí mặc định" (nếu có) và dữ liệu. Ghép tiêu đề / tách phí mặc định ở `prepareTable`.
 */
export function pdfPagesToRows(pages: PdfTextItem[][]): string[][] {
  const pageLines = pages.map(toLines);
  let cols: Column[] | null = null;

  for (const lines of pageLines) {
    const first = lines.findIndex(isDataLine);
    if (first < 0) continue;
    const headerCells = headerCellsOf(lines, first);
    if (headerCells.length >= 2) cols = columnsFromHeader(headerCells);
    break;
  }
  if (!cols || cols.length < 2) cols = columnsFromData(pageLines.flat());
  if (cols.length < 2) return [];

  const rows: string[][] = [];
  let headerDone = false;
  for (const lines of pageLines) {
    let start = 0;
    let first = -1;
    let narrow: (c: Cell) => boolean = () => true;
    if (!headerDone) {
      first = lines.findIndex(isDataLine);
      if (first >= 0) {
        // Bỏ phần trên khối tiêu đề (tên bảng, ghi chú…) và ô quá rộng trong khối tiêu đề
        start = headerBlockStart(lines, first);
        narrow = narrowCell(lines);
        headerDone = true;
      }
    }
    lines.slice(start).forEach((line, i) => {
      const inHeader = start + i < first;
      const cells = inHeader ? line.filter((c) => narrow(c) || DEFAULT_ROW.test(c.text)) : line;
      if (cells.length) rows.push(lineToRow(cells, cols));
    });
  }
  return rows;
}

/** Khoảng cách dọc thường gặp giữa 2 dòng dữ liệu */
function rowSpacing(lines: Cell[][], first: number): number {
  const gaps: number[] = [];
  for (let i = first; i < Math.min(lines.length - 1, first + 20); i++) {
    const g = lines[i][0].y - lines[i + 1][0].y;
    if (g > 0) gaps.push(g);
  }
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] ?? 15;
}

/**
 * Khối tiêu đề = các dòng liền nhau ngay trên dòng dữ liệu đầu tiên (kể cả dòng chỉ 1 ô — tiêu đề cột
 * xuống dòng, ô tiêu đề cao). Dừng khi gặp khoảng trống lớn hơn ~2,5 dòng.
 */
function headerBlockStart(lines: Cell[][], first: number): number {
  const maxGap = rowSpacing(lines, first) * 2.5;
  let start = first;
  while (start > 0 && lines[start - 1][0].y - lines[start][0].y <= maxGap) start--;
  return start;
}

/** Ô rộng hơn ~45% bề ngang bảng (tên bảng, ghi chú) không phải tiêu đề cột */
function narrowCell(lines: Cell[][]): (c: Cell) => boolean {
  const data = lines.filter(isDataLine).flat();
  const left = Math.min(...data.map((c) => c.x0));
  const right = Math.max(...data.map((c) => c.x1));
  return (c) => c.x1 - c.x0 < (right - left) * 0.45;
}

function headerCellsOf(lines: Cell[][], first: number): Cell[] {
  return lines
    .slice(headerBlockStart(lines, first), first)
    .filter((l) => !l.some((c) => DEFAULT_ROW.test(c.text)))
    .flat()
    .filter(narrowCell(lines));
}
