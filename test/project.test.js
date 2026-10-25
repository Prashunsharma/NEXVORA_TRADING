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

test('legal pages use publishable language with no draft or developer-facing markers', () => {
  // The owner asked for the internal draft language to be removed for launch;
  // substantive warnings and disclaimers must stay (see the risk test above).
  for (const file of ['views/legal/privacy.ejs', 'views/legal/terms.ejs', 'views/legal/risk-disclosure.ejs']) {
    const page = read(file);
    assert.doesNotMatch(page, /Draft — not ready for publication/);
    assert.doesNotMatch(page, /confirm before launch/i);
    assert.doesNotMatch(page, /configure before launch/i);
    assert.doesNotMatch(page, /Required before launch/i);
    assert.doesNotMatch(page, /local JSON file/i);
    assert.doesNotMatch(page, /working placeholder/i);
  }
  assert.match(read('views/legal/privacy.ejs'), /Information we collect/);
  assert.match(read('views/legal/privacy.ejs'), /retained for as long as needed/i);
  assert.match(read('views/legal/terms.ejs'), /Educational content only/);
});

test('theme system, hero canvas and production sitemap base URL are wired up', () => {
  assert.match(read('views/partials/head.ejs'), /nexvora-theme/);
  assert.match(read('views/partials/head.ejs'), /data-theme/);
  assert.match(read('views/partials/header.ejs'), /data-theme-toggle/);
  assert.match(read('views/partials/header.ejs'), /aria-label="Switch to (light|dark) theme"/);
  assert.match(read('views/index.ejs'), /id="hero-canvas"/);
  assert.match(read('public/css/style.css'), /\[data-theme="light"\]/);
  assert.match(read('public/js/hero-canvas.js'), /prefers-reduced-motion/);
  assert.match(read('public/js/main.js'), /nexvora:themechange/);
  const server = read('server.js');
  assert.match(server, /process\.env\.SITE_URL \|\| "https:\/\/nexvoratrading\.com"/);
  assert.doesNotMatch(server, /SITE_URL \|\| `http:\/\/localhost/);
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

test('header no longer carries the oversized green Join Telegram CTA', () => {
  const header = read('views/partials/header.ejs');
  assert.doesNotMatch(header, /Join Telegram/);
  assert.doesNotMatch(header, /class="btn primary"/);
});

test('waitlist buttons use the silver variant and the FAQ section is gone', () => {
  const page = read('views/index.ejs');
  const css = read('public/css/style.css');
  const silverButtons = page.match(/class="btn silver"/g) || [];
  assert.ok(silverButtons.length >= 2, 'hero and Trading Foundations waitlist buttons should be silver');
  assert.match(css, /\.btn\.silver\{/);
  assert.doesNotMatch(page, /id="faq"/);
  assert.doesNotMatch(page, /faq-item/);
  assert.doesNotMatch(css, /\.faq-item/);
});

test('all four social card buttons share the same secondary style', () => {
  const page = read('views/index.ejs');
  assert.match(page, /class="btn secondary" href="<%= site\.social\.telegram/);
  assert.doesNotMatch(page, /class="btn primary" href="<%= site\.social\.telegram/);
});

test('topics marquee sits below the hero with alternating solid and outline words', () => {
  const page = read('views/index.ejs');
  assert.match(page, /class="topics-marquee"/);
  assert.match(page, /Market Structure/);
  assert.match(page, /mq-word outline/);
  assert.match(read('public/css/style.css'), /@keyframes marquee-scroll/);
  assert.match(read('public/css/style.css'), /\.mq-word\{[^}]*text-transform:uppercase/);
});

test('schema defines admin, offer and testimonial tables', () => {
  const schema = read('db/schema.sql');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS admins/i);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS offers/i);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS testimonials/i);
  assert.match(schema, /password_hash TEXT NOT NULL/i);
  assert.match(schema, /image_public_id TEXT/i);
  assert.match(schema, /starts_at TIMESTAMPTZ/i);
  assert.match(schema, /rating SMALLINT CHECK \(rating BETWEEN 1 AND 5\)/i);
  const server = read('server.js');
  assert.match(server, /store\.ensureTables\(\)/);
  assert.match(server, /CREATE TABLE IF NOT EXISTS enquiries/i);
});

test('admin panel routes, session auth and CSRF protection are wired up', () => {
  const server = read('server.js');
  for (const route of ['/admin/login', '/admin/logout', '/admin/offers', '/admin/testimonials', '/admin/admins', '/admin/password', '/admin/cloudinary-sign']) {
    assert.ok(server.includes(`"${route}"`) || server.includes(`"${route}/`), `Missing route ${route}`);
  }
  assert.match(server, /require\("express-session"\)/);
  assert.match(server, /require\("bcryptjs"\)/);
  assert.match(server, /name: "nexvora\.sid"/);
  assert.match(server, /httpOnly: true/);
  assert.match(server, /sameSite: "lax"/);
  assert.match(server, /secure: isProduction/);
  assert.match(server, /req\.session\.csrfToken/);
  assert.match(server, /status\(403\)/);
  assert.match(server, /requireAdmin/);
  assert.match(server, /bcrypt\.compare/);
  assert.match(server, /bcrypt\.hash\(password, 12\)/);
  // Login is rate limited more strictly than the public enquiry form.
  assert.match(server, /loginLimiter/);
  // Every admin POST form template carries the CSRF hidden field.
  for (const view of ['login', 'offer-form', 'testimonial-form', 'admins', 'password']) {
    assert.match(read(`views/admin/${view}.ejs`), /name="_csrf"/, `${view} is missing a CSRF field`);
  }
  assert.ok(fs.existsSync(path.join(root, 'public', 'css', 'admin.css')));
  assert.ok(fs.existsSync(path.join(root, 'public', 'js', 'admin.js')));
});

test('create-admin script exists, is wired into package.json and supports env mode', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['create-admin'], 'node scripts/create-admin.js');
  assert.ok(pkg.dependencies.bcryptjs, 'bcryptjs dependency missing');
  assert.ok(pkg.dependencies['express-session'], 'express-session dependency missing');
  assert.match(pkg.scripts.check, /public\/js\/admin\.js/);
  assert.match(pkg.scripts.check, /scripts\/create-admin\.js/);
  const script = read('scripts/create-admin.js');
  assert.match(script, /CREATE_ADMIN_NAME/);
  assert.match(script, /CREATE_ADMIN_EMAIL/);
  assert.match(script, /CREATE_ADMIN_PASSWORD/);
  assert.match(script, /DUPLICATE_EMAIL/);
});

test('cloudinary signing follows the sorted-parameter SHA-1 rule', () => {
  const { signParams, deliveryUrl } = require('../lib/cloudinary');
  // "folder=nexvora/offers&timestamp=1700000000" + secret, SHA-1 hex.
  assert.equal(
    signParams({ timestamp: 1700000000, folder: 'nexvora/offers' }, 'testsecret'),
    '0c98db0ea6a224ee64cb57bdf7a3c21bb7764259'
  );
  // Empty values are excluded from the signature string.
  assert.equal(
    signParams({ folder: 'nexvora/offers', timestamp: 1700000000, eager: '' }, 'testsecret'),
    '0c98db0ea6a224ee64cb57bdf7a3c21bb7764259'
  );
  const base = 'https://res.cloudinary.com/demo/image/upload/v1700000000/nexvora/offers/banner.jpg';
  assert.equal(
    deliveryUrl(base, 'f_auto,q_auto,w_900'),
    'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_900/v1700000000/nexvora/offers/banner.jpg'
  );
  // Non-Cloudinary URLs pass through untouched.
  assert.equal(deliveryUrl('https://example.com/x.jpg', 'f_auto,q_auto,w_900'), 'https://example.com/x.jpg');
  assert.equal(deliveryUrl('/images/local.jpg', 'f_auto,q_auto,w_900'), '/images/local.jpg');
});

test('homepage renders admin-managed offers and testimonials conditionally', () => {
  const page = read('views/index.ejs');
  assert.match(page, /id="offers"/);
  assert.match(page, /offers\.forEach/);
  assert.match(page, /offerImageUrl\(offer\.image_url\)/);
  assert.match(page, /testimonials\.forEach/);
  assert.match(page, /testimonial-card/);
  // The old static "coming soon" feedback placeholder is gone.
  assert.doesNotMatch(page, /Community stories coming soon/);
  const css = read('public/css/style.css');
  assert.match(css, /\.offer-card\{/);
  assert.match(css, /\.offer-media img\{[^}]*object-fit:cover/);
  assert.match(css, /\.testimonial-card\{/);
  const server = read('server.js');
  assert.match(server, /listVisibleOffers/);
  assert.match(server, /listVisibleTestimonials/);
});

test('JSON content store supports the admin flows without a database', async () => {
  const { createStore } = require('../lib/store');
  const dataDir = path.join(root, 'data');
  const names = ['admins', 'offers', 'testimonials'];
  const backups = {};
  for (const name of names) {
    const file = path.join(dataDir, `${name}.json`);
    backups[name] = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  }
  try {
    const store = createStore(null);
    const admin = await store.createAdmin({ name: 'Test Admin', email: 'Test@Example.com', passwordHash: 'hash' });
    assert.equal(admin.email, 'test@example.com', 'emails are stored lowercased');
    await assert.rejects(
      () => store.createAdmin({ name: 'Dupe', email: 'TEST@example.com', passwordHash: 'hash' }),
      (error) => error.code === 'DUPLICATE_EMAIL'
    );
    assert.equal(await store.countActiveAdmins(), 1);

    const offer = await store.createOffer({
      title: 'Weekend Offer', description: 'Details', image_url: 'https://example.com/o.jpg',
      image_public_id: null, link_url: '/#contact', is_active: true, sort_order: 1,
      starts_at: null, ends_at: null
    });
    const scheduled = await store.createOffer({
      title: 'Future Offer', description: 'Later', image_url: 'https://example.com/f.jpg',
      image_public_id: null, link_url: null, is_active: true, sort_order: 0,
      starts_at: new Date(Date.now() + 86400000).toISOString(), ends_at: null
    });
    let visible = await store.listVisibleOffers();
    assert.deepEqual(visible.map((entry) => entry.title), ['Weekend Offer'], 'future-dated offer stays hidden');
    await store.setOfferActive(offer.id, false);
    visible = await store.listVisibleOffers();
    assert.equal(visible.length, 0, 'inactive offers are hidden');
    await store.deleteOffer(scheduled.id);
    assert.equal((await store.listOffers()).length, 1);

    const entry = await store.createTestimonial({
      author_name: 'Priya', author_context: 'Learner', quote: 'Clear and honest.',
      rating: 5, avatar_url: null, avatar_public_id: null, is_active: true, sort_order: 0
    });
    assert.equal((await store.listVisibleTestimonials()).length, 1);
    await store.setTestimonialActive(entry.id, false);
    assert.equal((await store.listVisibleTestimonials()).length, 0);
  } finally {
    for (const name of names) {
      const file = path.join(dataDir, `${name}.json`);
      if (backups[name] === null) {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      } else {
        fs.writeFileSync(file, backups[name]);
      }
    }
  }
});

test('site-wide background, custom cursor and illustrative ticker are on every page', () => {
  const partial = read('views/partials/background.ejs');
  assert.match(partial, /id="site-bg-canvas"/);
  assert.match(partial, /class="cursor-fx"/);
  assert.match(partial, /class="ticker-bar"/);
  assert.match(partial, /Illustrative/);
  for (const symbol of ['NIFTY 50', 'BANKNIFTY', 'SENSEX', 'BTC/USDT', 'ETH/USDT', 'GOLD', 'SOL/USDT']) {
    assert.match(partial, new RegExp(symbol.replace('/', '\\/')));
  }
  assert.match(read('views/index.ejs'), /include\("partials\/background"\)/);
  assert.match(read('views/404.ejs'), /include\("partials\/background"\)/);
  for (const legal of ['privacy', 'terms', 'risk-disclosure']) {
    assert.match(read(`views/legal/${legal}.ejs`), /include\("\.\.\/partials\/background"\)/);
  }
  const footer = read('views/partials/footer.ejs');
  assert.match(footer, /\/js\/background-canvas\.js/);
  assert.match(footer, /\/js\/ticker\.js/);
  const background = read('public/js/background-canvas.js');
  assert.match(background, /prefers-reduced-motion/);
  assert.match(background, /nexvora:themechange/);
  const ticker = read('public/js/ticker.js');
  assert.match(ticker, /SIMULATED/);
  const main = read('public/js/main.js');
  assert.match(main, /custom-cursor/);
  assert.match(main, /is-interactive/);
  const css = read('public/css/style.css');
  assert.match(css, /\.site-bg\{/);
  assert.match(css, /\.ticker-bar\{/);
  assert.match(css, /html\.custom-cursor/);
});
