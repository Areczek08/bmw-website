const fs = require('fs');
const path = require('path');

// 1. Analyze schema
const schema = fs.readFileSync(path.join(__dirname, '..', 'backups', 'phase0', 'schema_snapshot.sql'), 'utf8');
const lines = schema.split('\n');
let currentTable = '';
const textCols = [];
for (const line of lines) {
  if (line.startsWith('CREATE TABLE')) {
    currentTable = line.split(' ')[2].replace(/`/g, '');
  }
  if (line.toLowerCase().includes('longtext') || line.toLowerCase().includes('mediumtext')) {
    textCols.push({ table: currentTable, col: line.trim() });
  }
}

console.log('=== HEAVY COLUMNS (LONGTEXT / MEDIUMTEXT) ===');
console.log(textCols);
