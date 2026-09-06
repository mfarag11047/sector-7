const fs = require('fs');
let content = fs.readFileSync('components/UIOverlay.tsx', 'utf-8');
content = content.replace(
    `<div className="text-white font-mono text-[10px]">CRAWLERS: {units.filter(u=>u.type==='crawler_drone').length}</div>`,
    `<div className="text-white font-mono text-[10px]">CRAWLERS: {minimapData.units.filter(u=>u.type==='crawler_drone').length}</div>`
);
fs.writeFileSync('components/UIOverlay.tsx', content, 'utf-8');
