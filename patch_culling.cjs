const fs = require('fs');
const path = require('path');

const files = [
    'components/Unit.tsx',
    'components/Building.tsx',
    'components/Structure.tsx',
    'components/Base.tsx',
    'components/BlockStatus.tsx'
];

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf-8');
    
    // Add import if not present
    if (!content.includes('isObjectInFrustum')) {
        const importStatement = "import { isObjectInFrustum } from '../frustum';\n";
        const lastImportIndex = content.lastIndexOf('import ');
        const nextLineIndex = content.indexOf('\n', lastImportIndex);
        content = content.slice(0, nextLineIndex + 1) + importStatement + content.slice(nextLineIndex + 1);
    }

    fs.writeFileSync(file, content, 'utf-8');
});
