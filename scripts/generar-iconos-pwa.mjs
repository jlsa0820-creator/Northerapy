// Genera los íconos PWA del CRM (diseño teal/oscuro coherente con la app).
// Ejecutar: node scripts/generar-iconos-pwa.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const RAIZ = "/home/z/my-project";
mkdirSync(join(RAIZ, "public/icons"), { recursive: true });

const DEFS = `
  <defs>
    <linearGradient id="fondo" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#0F172A"/>
      <stop offset="1" stop-color="#1E293B"/>
    </linearGradient>
    <linearGradient id="teal" x1="0" y1="0" x2="0" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#5EEAD4"/>
      <stop offset="1" stop-color="#14B8A6"/>
    </linearGradient>
  </defs>`;

// Variante estándar (esquinas redondeadas, para launcher/navegador)
const SVG_BASE = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  ${DEFS}
  <rect width="512" height="512" rx="112" fill="url(#fondo)"/>
  <rect x="7" y="7" width="498" height="498" rx="105" fill="none" stroke="#2DD4BF" stroke-opacity="0.22" stroke-width="5"/>
  <g stroke="url(#teal)" stroke-width="56" stroke-linecap="butt" fill="none">
    <path d="M184 124 V388"/>
    <path d="M328 124 V388"/>
    <path d="M184 124 L328 388"/>
  </g>
  <path d="M148 452 H212 L240 410 L266 472 L292 452 H364" fill="none" stroke="#2DD4BF" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"/>
</svg>`;

// Variante maskable: fondo completo y contenido dentro de la zona segura (80 % central)
const SVG_MASKABLE = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  ${DEFS}
  <rect width="512" height="512" fill="url(#fondo)"/>
  <g stroke="url(#teal)" stroke-width="48" stroke-linecap="butt" fill="none">
    <path d="M196 136 V344"/>
    <path d="M316 136 V344"/>
    <path d="M196 136 L316 344"/>
  </g>
  <path d="M168 412 H222 L244 382 L262 430 L282 412 H344" fill="none" stroke="#2DD4BF" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"/>
</svg>`;

// Variante full-bleed (sin redondeo: iOS recorta solo)
const SVG_FULL = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  ${DEFS}
  <rect width="512" height="512" fill="url(#fondo)"/>
  <g stroke="url(#teal)" stroke-width="56" stroke-linecap="butt" fill="none">
    <path d="M184 124 V388"/>
    <path d="M328 124 V388"/>
    <path d="M184 124 L328 388"/>
  </g>
  <path d="M148 452 H212 L240 410 L266 472 L292 452 H364" fill="none" stroke="#2DD4BF" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"/>
</svg>`;

async function render(svg, destino, tam) {
  await sharp(Buffer.from(svg)).resize(tam, tam).png().toFile(destino);
  console.log(`✓ ${destino} (${tam}x${tam})`);
}

await render(SVG_BASE, join(RAIZ, "public/icons/icon-512.png"), 512);
await render(SVG_BASE, join(RAIZ, "public/icons/icon-192.png"), 192);
await render(SVG_MASKABLE, join(RAIZ, "public/icons/icon-maskable-512.png"), 512);
await render(SVG_FULL, join(RAIZ, "public/icons/apple-icon.png"), 180); // se mueve a src/app
await render(SVG_BASE, join(RAIZ, "public/icons/favicon-256.png"), 256); // se mueve a src/app

// Next.js App Router: convención de archivos
const { renameSync, copyFileSync } = await import("node:fs");
renameSync(join(RAIZ, "public/icons/apple-icon.png"), join(RAIZ, "src/app/apple-icon.png"));
renameSync(join(RAIZ, "public/icons/favicon-256.png"), join(RAIZ, "src/app/icon.png"));
console.log("✓ src/app/icon.png + src/app/apple-icon.png (convención Next)");

console.log("\nÍconos PWA generados correctamente.");
