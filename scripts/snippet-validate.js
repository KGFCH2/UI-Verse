const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const COMPONENTS_FILE = path.join(ROOT, 'data', 'components.json');
const SNIPPETS_INDEX = path.join(ROOT, 'data', 'snippets', 'index.json');

function loadJson(p){ return JSON.parse(fs.readFileSync(p,'utf8')); }
function computeHash(s){ return crypto.createHash('sha1').update(s, 'utf8').digest('hex'); }
function extractSnippet(html){
  const mainMatch = html.match(/<main[\s\S]*?>[\s\S]*?<\/main>/i);
  if(mainMatch) return mainMatch[0].trim();
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if(bodyMatch) return bodyMatch[1].trim();
  return html.trim();
}

function validate(){
  if(!fs.existsSync(SNIPPETS_INDEX)){
    return { ok: false, error: 'snippets index not found', path: SNIPPETS_INDEX };
  }

  const index = loadJson(SNIPPETS_INDEX);
  const comps = loadJson(COMPONENTS_FILE);
  const results = [];

  for(const entry of index){
    const id = entry.id;
    const htmlPath = path.join(ROOT, entry.html);
    const jsxPath = path.join(ROOT, entry.jsx);
    const vuePath = path.join(ROOT, entry.vue);
    const missing = [];
    if(!fs.existsSync(htmlPath)) missing.push('html');
    if(!fs.existsSync(jsxPath)) missing.push('jsx');
    if(!fs.existsSync(vuePath)) missing.push('vue');

    let hashOk = false;
    if(fs.existsSync(htmlPath)){
      const html = fs.readFileSync(htmlPath,'utf8');
      const snippet = extractSnippet(html);
      const hash = computeHash(snippet);
      hashOk = hash === entry.hash;
    }

    results.push({ id, missing, hashOk });
  }

  const missingManifest = comps.filter(c=> !index.find(e=>e.id===c.id)).map(c=>c.id);

  const ok = results.every(r=> r.missing.length===0 && r.hashOk) && missingManifest.length===0;
  return { ok, results, missingManifest };
}

if(require.main === module){
  const report = validate();
  console.log(JSON.stringify(report, null, 2));
  if(!report.ok) process.exitCode = 2;
}

module.exports = { validate };
