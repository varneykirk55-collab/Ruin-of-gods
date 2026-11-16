const fs=require('fs');
const js=['src/sim.js','src/render.js','src/audio.js','src/main.js'].map(f=>fs.readFileSync(f,'utf8').replace(/^'use strict';\n/,'')).join('\n');
const out=fs.readFileSync('src/template.html','utf8').replace('/*__JS__*/',()=>"'use strict';\n"+js.replace(/<\/script/g,'<\\/script'));
fs.writeFileSync('index.html',out); console.log('built',(out.length/1024|0)+'KB');
