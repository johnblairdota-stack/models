# models

GLB assets plus the **Run Robot Run** browser prototype.

```
models/           existing GLBs (bed, tato)
web-prototype/    Run Robot Run — Three.js web prototype
```

## Clone on another machine

```bash
git clone https://github.com/johnblairdota-stack/models.git
cd models/web-prototype
npm install
npm run build && node harness/serve.mjs
```

Then open `http://localhost:5192/?view=game.play`.
