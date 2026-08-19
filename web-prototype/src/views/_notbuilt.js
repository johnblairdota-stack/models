import * as THREE from 'three';
import { Engine } from '../core/engine.js';

/**
 * Placeholder for a piece that has not been built yet. It renders and captures cleanly
 * — an honest "0%" on the progress page is worth more than a broken view that looks like
 * a bug, and it means the harness can shoot every piece from day one.
 */
export async function notBuilt(name, args = {}) {
  const engine = new Engine({ grade: 'studio', bloom: false, ao: false, fov: 40 });
  engine.scene.background = new THREE.Color(0x0a0c10);
  engine.camera.position.set(0, 0, 3);

  const el = document.createElement('div');
  el.style.cssText = `position:fixed;inset:0;display:grid;place-items:center;z-index:30;
    font:600 13px/2.1 ui-monospace,Menlo,monospace;color:#3d4a5a;letter-spacing:.22em;
    text-align:center;text-transform:uppercase`;
  el.innerHTML = `<div><div style="font-size:11px;color:#2b3542;margin-bottom:14px">RUN ROBOT RUN</div>
    <div style="color:#5b6b7f;font-size:16px;letter-spacing:.3em">NOT BUILT</div>
    <div style="margin-top:12px;color:#333d4a;font-size:11px;letter-spacing:.14em">${name}${args.stage !== undefined ? ' · stage ' + args.stage : ''}${args.gadget ? ' · ' + args.gadget : ''}</div></div>`;
  document.body.appendChild(el);

  engine.finalizeScene();
  engine.markReady();
  engine.start();
  return engine;
}
