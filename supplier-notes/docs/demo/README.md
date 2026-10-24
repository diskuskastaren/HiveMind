# HiveMind README demo

The tour uses real app screenshots with entirely fictional data from [fixture.mjs](fixture.mjs). Its [HyperFrames composition](hivemind-tour/index.html) produces the MP4; the GIF is a smaller, silent preview for GitHub's README. The interactive page embeds the composition with `@hyperframes/player` and also lets visitors use the real HiveMind web app with that same sample workspace.

From `supplier-notes` on Windows:

```powershell
npm run electron:build
node docs/demo/capture-screens.cjs
cd docs/demo/hivemind-tour
npm run check
npm run render -- --output ../../hivemind-demo.mp4
cd ../../..
ffmpeg -i docs/hivemind-demo.mp4 -filter_complex "[0:v]fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=3" -loop 0 docs/hivemind-demo.gif
npm run build -- --base ./
node scripts/build-demo-site.cjs
```

`capture-screens.cjs` launches a separate temporary HiveMind profile and deletes it after capture. The site is written to `site/`, which GitHub Pages deploys through the repository workflow. The build injects the fictional fixture before the web app starts; **Reset sample data** replaces only the demo workspace in that browser.
