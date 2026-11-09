/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Lightweight deterministic pseudo-QR code SVG generator for offline & instant badge rendering
export function generateSvgQRCode(data: string, size = 180): string {
  const hash = simpleHash(data);
  const matrixSize = 25; // 25x25 QR grid
  const cells: boolean[][] = [];

  for (let r = 0; r < matrixSize; r++) {
    cells[r] = [];
    for (let c = 0; c < matrixSize; c++) {
      // Finder patterns in 3 corners (7x7)
      if (isFinderPattern(r, c, matrixSize)) {
        cells[r][c] = isFinderPatternDark(r, c, matrixSize);
      } else if (isTimingPattern(r, c, matrixSize)) {
        cells[r][c] = (r + c) % 2 === 0;
      } else {
        // Deterministic pseudo-random pattern based on string hash and coordinates
        const cellHash = (hash * (r * 31 + c + 7)) ^ (data.charCodeAt((r + c) % data.length) * 17);
        cells[r][c] = (cellHash % 7 === 0 || cellHash % 5 === 1 || cellHash % 3 === 0);
      }
    }
  }

  const cellSize = size / matrixSize;
  let paths = '';
  for (let r = 0; r < matrixSize; r++) {
    for (let c = 0; c < matrixSize; c++) {
      if (cells[r][c]) {
        const x = c * cellSize;
        const y = r * cellSize;
        paths += `M${x},${y}h${cellSize}v${cellSize}h-${cellSize}z `;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" fill="#064e3b" class="rounded">
    <rect width="${size}" height="${size}" fill="#ffffff"/>
    <path d="${paths}" />
    <!-- Center logo badge circle -->
    <circle cx="${size / 2}" cy="${size / 2}" r="${cellSize * 2.2}" fill="#ffffff" stroke="#d97706" stroke-width="2"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${cellSize * 1.5}" fill="#064e3b"/>
    <text x="${size / 2}" y="${size / 2 + 3}" fill="#fbbf24" font-size="8" font-weight="bold" text-anchor="middle" font-family="sans-serif">AB</text>
  </svg>`;
}

function isFinderPattern(r: number, c: number, size: number): boolean {
  return (
    (r < 7 && c < 7) || // Top-left
    (r < 7 && c >= size - 7) || // Top-right
    (r >= size - 7 && c < 7) // Bottom-left
  );
}

function isFinderPatternDark(r: number, c: number, size: number): boolean {
  let localR = r;
  let localC = c;
  if (r >= size - 7) localR = r - (size - 7);
  if (c >= size - 7) localC = c - (size - 7);

  // 7x7 outer square is dark
  if (localR === 0 || localR === 6 || localC === 0 || localC === 6) return true;
  // 5x5 inner ring is light
  if (localR === 1 || localR === 5 || localC === 1 || localC === 5) return false;
  // 3x3 center is dark
  return true;
}

function isTimingPattern(r: number, c: number, size: number): boolean {
  if (r === 6 && c >= 7 && c < size - 7) return true;
  if (c === 6 && r >= 7 && r < size - 7) return true;
  return false;
}

function simpleHash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(hash);
}
