/**
 * Nano Banana (Gemini image) concept sheets for mansion furniture.
 * Requires GEMINI_API_KEY. Does not write the key to disk.
 *
 *   node tools/nano-furn-concepts.mjs
 *   node tools/nano-furn-concepts.mjs --only chair,desk
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'concept', 'furn');
const KEY = process.env.GEMINI_API_KEY;
if (!KEY) {
  console.error('Set GEMINI_API_KEY');
  process.exit(1);
}

const MODEL = process.env.NANO_MODEL || 'gemini-3.1-flash-image';

const FRAME =
  'Game prop concept art for a Three.js horror game set in a Victorian mansion. ' +
  'Three-quarter view, entire object visible uncropped, centered, plain light grey seamless background, ' +
  'flat even studio lighting with soft fill (no hard cast shadows that bake into the form), ' +
  'no people, no text, no UI, no watermark labels, single object only. ' +
  'Readable silhouette for Meshy Image-to-3D. Period mansion style: dark walnut, gilt accents, dust.';

const ASSETS = [
  {
    id: 'chair',
    file: 'rrr_prop_chair_v1_concept.png',
    prompt:
      `${FRAME} Ornate ballroom side chair: cabriole front legs, sabre rear legs, pierced splat back, ` +
      `cresting rail, upholstered seat. Height ~1.05 m relative scale.`,
  },
  {
    id: 'desk',
    file: 'rrr_prop_desk_v1_concept.png',
    prompt:
      `${FRAME} Heavy study writing desk with drawers, leather inset top, turned legs. Width ~1.6 m.`,
  },
  {
    id: 'console',
    file: 'rrr_prop_console_v1_concept.png',
    prompt:
      `${FRAME} Narrow wall console table with pale marble top, gilt carved apron, cabriole legs.`,
  },
  {
    id: 'crate',
    file: 'rrr_prop_crate_v1_concept.png',
    prompt:
      `${FRAME} Rough timber shipping crate with cross battens, about 0.8 m cube, weathered wood.`,
  },
  {
    id: 'cam-wall',
    file: 'rrr_prop_cam-wall_v1_concept.png',
    prompt:
      `${FRAME} Small wall-mounted CCTV security camera on a short bracket, boxy head, matte black metal.`,
  },
  {
    id: 'cam-tripod',
    file: 'rrr_prop_cam-tripod_v1_concept.png',
    prompt:
      `${FRAME} Floor tripod with three splayed legs and a boxy video camera on top, height ~1.4 m, ` +
      `clear camera-on-legs silhouette.`,
  },
  {
    id: 'fireplace',
    file: 'rrr_prop_fireplace_v1_concept.png',
    prompt:
      `${FRAME} Ornate study chimneypiece and mantel with carved surround and open firebox, width ~2 m.`,
  },
  {
    id: 'chandelier',
    file: 'rrr_prop_chandelier_v1_concept.png',
    prompt:
      `${FRAME} Hanging ballroom chandelier with brass arms, crystal drops, short chain, diameter ~1.2 m.`,
  },
];

const onlyArg = process.argv.find((a) => a.startsWith('--only='))?.slice(7)
  || (process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null);
const only = onlyArg ? new Set(onlyArg.split(',').map((s) => s.trim()).filter(Boolean)) : null;

fs.mkdirSync(OUT, { recursive: true });

const ai = new GoogleGenAI({ apiKey: KEY });

async function genOne(asset) {
  const dest = path.join(OUT, asset.file);
  console.log(`\n=== ${asset.id} ===`);
  console.log(`model ${MODEL}`);

  let response;
  try {
    response = await ai.models.generateContent({
      model: MODEL,
      contents: asset.prompt,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });
  } catch (err) {
    // Fallback to interactions API if generateContent image path fails on this SDK.
    console.log(`  generateContent failed (${err.message}); trying interactions…`);
    const interaction = await ai.interactions.create({
      model: MODEL,
      input: asset.prompt,
    });
    const img = interaction.output_image;
    if (!img?.data) throw new Error('interactions returned no image');
    fs.writeFileSync(dest, Buffer.from(img.data, 'base64'));
    console.log(`  wrote ${asset.file} (${fs.statSync(dest).size} bytes)`);
    return;
  }

  const parts = response.candidates?.[0]?.content?.parts || response.parts || [];
  let wrote = false;
  for (const part of parts) {
    if (part.text) console.log(`  text: ${part.text.slice(0, 120)}`);
    const inline = part.inlineData || part.inline_data;
    if (inline?.data) {
      const buf = Buffer.from(inline.data, 'base64');
      fs.writeFileSync(dest, buf);
      console.log(`  wrote ${asset.file} (${buf.length} bytes)`);
      wrote = true;
    }
  }
  if (!wrote) {
    throw new Error(`no image in response: ${JSON.stringify(response).slice(0, 400)}`);
  }
}

async function main() {
  const list = ASSETS.filter((a) => !only || only.has(a.id));
  console.log(`Out: ${OUT}`);
  console.log(`Generating ${list.length} concepts…`);
  for (const asset of list) {
    await genOne(asset);
  }
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('\nFATAL:', err.message || err);
  process.exit(1);
});
