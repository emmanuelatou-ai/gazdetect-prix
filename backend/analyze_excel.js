const XLSX = require('xlsx');
const path = '/Users/emmanuelatou/Downloads/Tarification GazDetect Ed2026.xlsx';
const wb = XLSX.readFile(path);
console.log('Feuilles:', wb.SheetNames);
console.log('Total:', wb.SheetNames.length, 'feuilles');
console.log('---');
wb.SheetNames.forEach(name => {
  const ws = wb.Sheets[name];
  if (!ws || !ws['!ref']) { console.log(name + ': vide'); return; }
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  console.log('\n=== ' + name + ' ===');
  raw.slice(0,15).forEach(function(row, i) {
    const cells = row.filter(function(c) { return c !== ''; });
    if (cells.length) console.log('  L'+i+':', JSON.stringify(row.slice(0,10)));
  });
});
