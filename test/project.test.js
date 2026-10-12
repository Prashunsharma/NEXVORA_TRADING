const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('all four social media icon assets exist and are SVG images', () => {
  for (const platform of ['instagram', 'facebook', 'youtube', 'telegram']) {
    const file = path.join(root, 'public', 'images', 'social', `${platform}.svg`);
    assert.ok(fs.existsSync(file), `Missing ${platform} icon`);
    assert.match(fs.readFileSync(file, 'utf8'), /<svg[\s>]/, `${platform} icon is not SVG`);
  }
});

test('community section uses each local social icon', () => {
  const page = read('views/index.ejs');
  for (const platform of ['instagram', 'facebook', 'youtube', 'telegram']) {
    assert.match(page, new RegExp(`/images/social/${platform}\\.svg`));
  }
});

test('risk disclosure warns about losses and does not promise returns', () => {
  const page = read('views/legal/risk-disclosure.ejs');
  assert.match(page, /Trading involves risk/i);
  assert.match(page, /lose some or all/i);
  assert.match(page, /No strategy.*guarantee profits/s);
  assert.match(page, /does not claim any registration, authorization or regulatory status/i);
});

test('privacy and terms pages are clearly marked as drafts', () => {
  assert.match(read('views/legal/privacy.ejs'), /Draft — not ready for publication/);
  assert.match(read('views/legal/terms.ejs'), /Draft — not ready for publication/);
});

test('form stores locally when no database URL is configured', () => {
  const server = read('server.js');
  assert.match(server, /if \(pool\)\s*\{/);
  assert.match(server, /enquiries\.json/);
  assert.match(read('README.md'), /local development fallback/i);
  assert.match(read('README.md'), /DATABASE_URL` is blank/i);
});


test('configured external links use noopener and noreferrer', () => {
  const templates = ['views/index.ejs', 'views/partials/header.ejs', 'views/partials/footer.ejs'];
  for (const file of templates) {
    const source = read(file);
    assert.doesNotMatch(source, /target="_blank"(?! rel="noopener noreferrer")/);
  }
});

test('styles respect reduced-motion preferences', () => {
  assert.match(read('public/css/style.css'), /prefers-reduced-motion:\s*reduce/);
});


test('About visual uses the supplied Nexvora emblem with looping motion', () => {
  const page = read('views/index.ejs');
  const css = read('public/css/style.css');
  assert.match(page, /class="orbit-logo" src="\/images\/nexvora-mark\.png"/);
  for (const animation of ['orbit-turn', 'orbit-breathe', 'logo-aura', 'logo-hover', 'logo-scan']) {
    assert.match(css, new RegExp(`@keyframes ${animation}`));
  }
  assert.match(css, /prefers-reduced-motion:\s*reduce[^{]*\{[^}]*orbit-logo-stage/s);
});

test('remote PostgreSQL is mandatory in production and has a health endpoint', () => {
  const server = read('server.js');
  assert.match(server, /const databaseRequired = isProduction \|\| process\.env\.DATABASE_REQUIRED === "true"/);
  assert.match(server, /DATABASE_URL is required/);
  assert.match(server, /app\.get\("\/healthz"/);
  assert.match(server, /await pool\.query\("SELECT 1"\)/);
  assert.match(read('.env.example'), /DATABASE_URL=/);
  assert.match(read('db/schema.sql'), /CREATE TABLE IF NOT EXISTS enquiries/i);
});

test('all EJS templates generate syntactically valid JavaScript', () => {
  function checkTemplate(file) {
    const template = read(file);
    const tag = /<%([_=-]?)([\s\S]+?)%>/g;
    let cursor = 0;
    let match;
    let generated = 'const __out=[]; const __append=(v)=>__out.push(v == null ? "" : String(v));\n';
    while ((match = tag.exec(template))) {
      generated += `__append(${JSON.stringify(template.slice(cursor, match.index))});\n`;
      if (match[1] === '=' || match[1] === '-') generated += `__append((${match[2]}));\n`;
      else if (match[1] !== '#') generated += `${match[2]}\n`;
      cursor = tag.lastIndex;
    }
    generated += `__append(${JSON.stringify(template.slice(cursor))});\n`;
    assert.doesNotThrow(() => new Function('locals', 'include', `with (locals) { ${generated} }`), file);
  }

  function visit(directory) {
    for (const name of fs.readdirSync(path.join(root, directory))) {
      const relative = path.join(directory, name);
      if (fs.statSync(path.join(root, relative)).isDirectory()) visit(relative);
      else if (relative.endsWith('.ejs')) checkTemplate(relative);
    }
  }
  visit('views');
});


test('reusable SVG icon partial defines a fixed safe icon catalogue', () => {
  const icon = read('views/partials/icon.ejs');
  for (const iconName of ['chart', 'graduation-cap', 'shield-check', 'mail', 'send', 'arrow-up-right', 'arrow-down', 'candles', 'brain']) {
    assert.match(icon, new RegExp(`"${iconName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  }
  assert.match(icon, /aria-hidden="true"/);
  assert.match(icon, /Object\.prototype\.hasOwnProperty\.call/);
});

test('reusable icons are used across navigation, hero, services, programs, contact and footer', () => {
  const files = {
    page: read('views/index.ejs'),
    header: read('views/partials/header.ejs'),
    footer: read('views/partials/footer.ejs'),
    css: read('public/css/style.css')
  };
  for (const name of ['graduation-cap', 'chart', 'calendar-clock', 'shield-check', 'candles', 'brain', 'send', 'mail', 'users']) {
    assert.match(`${files.page}\n${files.header}\n${files.footer}`, new RegExp(`name: "${name}"`), `Missing ${name} usage`);
  }
  assert.match(files.css, /\.ui-icon/);
  assert.match(files.css, /prefers-reduced-motion:\s*reduce/);
});

test('form submission preserves its icon while updating the label', () => {
  assert.match(read('views/index.ejs'), /class="submit-label"/);
  assert.match(read('public/js/main.js'), /querySelector\("\.submit-label"\)/);
});
