const fs = require('fs');
let content = fs.readFileSync('components/CityMap.tsx', 'utf-8');
content = content.replace(
    'if (!selectedUnitIds.has(u.id)) return u;',
    'if (!selectedUnitIds.has(u.id) && u.id !== unitId) return u;'
);
fs.writeFileSync('components/CityMap.tsx', content, 'utf-8');
