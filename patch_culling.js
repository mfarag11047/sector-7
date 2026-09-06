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
    if (content.includes('distanceToSquared') && !content.includes('isObjectInFrustum')) {
        // Need to figure out the import path
        // all these are in components/, so '../frustum'
        const importStatement = "import { isObjectInFrustum } from '../frustum';\n";
        
        // Find the last import
        const lastImportIndex = content.lastIndexOf('import ');
        const nextLineIndex = content.indexOf('\n', lastImportIndex);
        
        content = content.slice(0, nextLineIndex + 1) + importStatement + content.slice(nextLineIndex + 1);
    }
    
    // Replace logic
    // We will do this manually for each pattern

    fs.writeFileSync(file, content, 'utf-8');
});
