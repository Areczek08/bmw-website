const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(fullPath));
    } else {
      results.push(fullPath);
    }
  });
  return results;
}

const apiFiles = walk(path.join(__dirname, '..', 'app', 'api')).filter(f => f.endsWith('.js') || f.endsWith('.ts'));

console.log('Total API routes found:', apiFiles.length);

const findings = [];

for (const file of apiFiles) {
  const relPath = path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/');
  const code = fs.readFileSync(file, 'utf8');

  // Find db calls
  const dbCalls = (code.match(/\bdb(One|All|Run)?\s*\(/g) || []).length;
  const selectStar = (code.match(/SELECT\s+\*\s+FROM/gi) || []).length;
  const rawQueries = [];
  const queryMatches = code.matchAll(/\b(?:db|dbOne|dbAll|dbRun|conn\.query)\s*\(\s*[`'"]([\s\S]*?)[`'"]/gi);
  for (const q of queryMatches) {
    const rawSql = q[1].trim().replace(/\s+/g, ' ').slice(0, 100);
    rawQueries.push(rawSql);
  }

  // Detect loop with db call (N+1)
  let loopDb = false;
  if (/for\s*\([^)]*\)\s*\{[^}]*\bawait\s+db/s.test(code) ||
      /\.forEach\s*\([^)]*\bawait\s+db/s.test(code) ||
      /for\s+await\b/s.test(code)) {
    loopDb = true;
  }

  // Detect fetch calls
  const fetchCalls = (code.match(/\bfetch\s*\(/g) || []).length;

  findings.push({
    endpoint: relPath.replace('app/api', '/api').replace('/route.js', ''),
    file: relPath,
    dbCalls,
    selectStar,
    loopDb,
    fetchCalls,
    sampleQueries: rawQueries.slice(0, 3)
  });
}

// Sort by dbCalls desc
findings.sort((a, b) => b.dbCalls - a.dbCalls);

console.log('=== TOP 15 ROUTES WITH MOST DB CALLS ===');
console.log(findings.slice(0, 15).map(f => ({
  endpoint: f.endpoint,
  dbCalls: f.dbCalls,
  selectStar: f.selectStar,
  loopDb: f.loopDb,
  fetchCalls: f.fetchCalls
})));

console.log('\n=== ROUTES WITH POTENTIAL N+1 (DB IN LOOP) ===');
const loopRoutes = findings.filter(f => f.loopDb);
console.log(loopRoutes.map(f => ({ endpoint: f.endpoint, file: f.file })));

console.log('\n=== ROUTES WITH SELECT * ===');
const selectStarRoutes = findings.filter(f => f.selectStar > 0);
console.log(selectStarRoutes.map(f => ({ endpoint: f.endpoint, count: f.selectStar, samples: f.sampleQueries })));
