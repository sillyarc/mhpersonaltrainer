const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outDir = path.join(root, 'docs');
const outHtml = path.join(outDir, 'mh-personal-trainer-guia-completo.html');

const IGNORE_DIRS = new Set([
  '.git',
  'node_modules',
  '.next',
  '.next-dev',
  '.next-tauri',
  '.expo',
  '.expo-shared',
  'build',
  'dist',
  'out',
  'coverage',
  '.turbo',
  '.dart_tool',
  '.idea',
  '.vscode',
  '.tmp_video_frames_1856',
  '.tmp_video_frames_1856_b',
]);

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function walkFiles(dir, list = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.git')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      walkFiles(fullPath, list);
    } else {
      list.push(fullPath);
    }
  }
  return list;
}

function buildTreeLines(dir, maxDepth) {
  function walk(currentDir, prefix, depth, lines) {
    let entries = fs.readdirSync(currentDir, { withFileTypes: true });
    entries = entries
      .filter((entry) => {
        if (entry.name.startsWith('.git')) return false;
        if (entry.isDirectory() && IGNORE_DIRS.has(entry.name)) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    entries.forEach((entry, index) => {
      const isLast = index === entries.length - 1;
      const connector = isLast ? '└─' : '├─';
      const suffix = entry.isDirectory() ? '/' : '';
      lines.push(`${prefix}${connector} ${entry.name}${suffix}`);
      if (entry.isDirectory() && depth < maxDepth) {
        const nextPrefix = `${prefix}${isLast ? '   ' : '│  '}`;
        walk(path.join(currentDir, entry.name), nextPrefix, depth + 1, lines);
      }
    });
  }

  const title = `${path.basename(dir)}/`;
  const lines = [title];
  walk(dir, '', 0, lines);
  return lines;
}

function routeFromNextPage(relativePath) {
  const parts = relativePath.split(path.sep);
  const folders = parts.slice(0, -1).filter((segment) => !/^\(.*\)$/.test(segment));
  if (folders.length === 0) return '/';
  return `/${folders.join('/')}`;
}

function routeFromExpoFile(relativePath) {
  const parts = relativePath.split(path.sep);
  const file = parts[parts.length - 1];
  const fileName = file.replace(/\.tsx$/i, '');
  const folderSegments = parts
    .slice(0, -1)
    .filter((segment) => !/^\(.*\)$/.test(segment));
  if (fileName !== 'index') folderSegments.push(fileName);
  if (folderSegments.length === 0) return '/';
  return `/${folderSegments.join('/')}`;
}

function firstRouteArea(route) {
  if (route === '/') return 'home';
  const clean = route.replace(/^\//, '');
  const first = clean.split('/')[0];
  return first || 'home';
}

function listNextRoutes() {
  const appDir = path.join(root, 'web-next', 'app');
  const files = walkFiles(appDir).filter((file) => file.endsWith(`${path.sep}page.tsx`));
  const routes = files.map((file) => {
    const relativePath = path.relative(appDir, file);
    const parts = relativePath.split(path.sep);
    const groupRaw = parts[0] || '';
    const group = /^\(.*\)$/.test(groupRaw) ? groupRaw.slice(1, -1) : 'root';
    const route = routeFromNextPage(relativePath);
    return {
      route,
      source: `web-next/app/${toPosix(relativePath)}`,
      group,
      area: firstRouteArea(route),
      dynamic: /\[[^/\]]+\]/.test(route),
    };
  });
  routes.sort((a, b) => a.route.localeCompare(b.route) || a.source.localeCompare(b.source));
  return routes;
}

function listExpoRoutes() {
  const appDir = path.join(root, 'mh-personal-trainer-react-native', 'app');
  const files = walkFiles(appDir).filter((file) => file.endsWith('.tsx'));
  const routes = files
    .filter((file) => path.basename(file) !== '_layout.tsx')
    .map((file) => {
      const relativePath = path.relative(appDir, file);
      const parts = relativePath.split(path.sep);
      const groupRaw = parts[0] || '';
      const group = /^\(.*\)$/.test(groupRaw) ? groupRaw.slice(1, -1) : 'root';
      const route = routeFromExpoFile(relativePath);
      return {
        route,
        source: `mh-personal-trainer-react-native/app/${toPosix(relativePath)}`,
        group,
        area: firstRouteArea(route),
        dynamic: /\[[^/\]]+\]/.test(route),
      };
    });
  routes.sort((a, b) => a.route.localeCompare(b.route) || a.source.localeCompare(b.source));
  return routes;
}

function extractNamesFromLayout(filePath, componentName) {
  const content = readText(filePath);
  const regex = new RegExp(`<${componentName}\\.Screen\\s+name="([^"]+)"`, 'g');
  const names = [];
  for (const match of content.matchAll(regex)) {
    names.push(match[1]);
  }
  return names;
}

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function extractEnvVars(baseDir, regex) {
  const files = walkFiles(baseDir).filter((file) => /\.(ts|tsx|js|mjs|cjs)$/.test(file));
  const vars = [];
  for (const file of files) {
    const text = readText(file);
    for (const match of text.matchAll(regex)) {
      if (match[1]) vars.push(match[1]);
    }
  }
  return uniqueSorted(vars);
}

function parsePackageScripts(packageJsonPath) {
  const json = readJson(packageJsonPath);
  const scripts = json.scripts || {};
  return Object.entries(scripts).map(([name, command]) => ({ name, command }));
}

function parseCloudFunctionExports(indexPath) {
  const text = readText(indexPath);
  const names = [];
  for (const match of text.matchAll(/exports\.([A-Za-z0-9_]+)\s*=/g)) {
    names.push(match[1]);
  }
  return uniqueSorted(names);
}

function renderKeyValueTable(rows) {
  const body = rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.key)}</td><td><code>${escapeHtml(row.value)}</code></td></tr>`
    )
    .join('\n');
  return `<table class="kv-table"><thead><tr><th>Comando</th><th>Descricao</th></tr></thead><tbody>${body}</tbody></table>`;
}

function renderList(items) {
  return `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
}

function renderRouteTable(routes) {
  const body = routes
    .map((route) => {
      const kind = route.dynamic ? 'dinamica' : 'estatica';
      return `<tr><td><code>${escapeHtml(route.route)}</code></td><td>${escapeHtml(
        route.group
      )}</td><td>${escapeHtml(route.area)}</td><td>${kind}</td><td><code>${escapeHtml(
        route.source
      )}</code></td></tr>`;
    })
    .join('\n');
  return `<table><thead><tr><th>Rota</th><th>Grupo</th><th>Area</th><th>Tipo</th><th>Arquivo fonte</th></tr></thead><tbody>${body}</tbody></table>`;
}

function renderScriptTable(items) {
  const body = items
    .map(
      (item) =>
        `<tr><td><code>${escapeHtml(item.name)}</code></td><td><code>${escapeHtml(
          item.command
        )}</code></td></tr>`
    )
    .join('\n');
  return `<table><thead><tr><th>Script</th><th>Comando</th></tr></thead><tbody>${body}</tbody></table>`;
}

function renderSimpleTable(titleA, titleB, values) {
  const body = values
    .map((value) => `<tr><td><code>${escapeHtml(value)}</code></td><td>definir no ambiente</td></tr>`)
    .join('\n');
  return `<table><thead><tr><th>${escapeHtml(titleA)}</th><th>${escapeHtml(
    titleB
  )}</th></tr></thead><tbody>${body}</tbody></table>`;
}

function main() {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const generatedAt = new Date();
  const generatedAtText = generatedAt.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const nextRoutes = listNextRoutes();
  const expoRoutes = listExpoRoutes();

  const webScripts = parsePackageScripts(path.join(root, 'web-next', 'package.json'));
  const rnScripts = parsePackageScripts(
    path.join(root, 'mh-personal-trainer-react-native', 'package.json')
  );

  const tabsScreens = extractNamesFromLayout(
    path.join(root, 'mh-personal-trainer-react-native', 'app', '(tabs)', '_layout.tsx'),
    'Tabs'
  );
  const authScreens = extractNamesFromLayout(
    path.join(root, 'mh-personal-trainer-react-native', 'app', '(auth)', '_layout.tsx'),
    'Stack'
  );

  const webEnvVars = extractEnvVars(
    path.join(root, 'web-next'),
    /process\.env\.(NEXT_PUBLIC_[A-Z0-9_]+)/g
  );
  const expoEnvVars = extractEnvVars(
    path.join(root, 'mh-personal-trainer-react-native'),
    /process\.env\.(EXPO_PUBLIC_[A-Z0-9_]+)/g
  );
  const cloudEnvVars = extractEnvVars(
    path.join(root, 'firebase'),
    /process\.env\.([A-Z0-9_]+)/g
  );

  const customCloudExports = parseCloudFunctionExports(
    path.join(root, 'firebase', 'custom_cloud_functions', 'index.js')
  );
  const firebaseFunctionsExports = parseCloudFunctionExports(
    path.join(root, 'firebase', 'functions', 'index.js')
  );

  const webTree = buildTreeLines(path.join(root, 'web-next'), 2);
  const rnTree = buildTreeLines(path.join(root, 'mh-personal-trainer-react-native'), 2);
  const firebaseTree = buildTreeLines(path.join(root, 'firebase'), 2);

  const commandRows = [
    { key: 'Abrir raiz', value: 'cd C:\\Users\\isabe\\Downloads\\mhpersonaltrainer-main\\mhpersonaltrainer-main' },
    { key: 'Entrar no Web (Next)', value: 'cd web-next' },
    { key: 'Entrar no Mobile (React Native)', value: 'cd mh-personal-trainer-react-native' },
    { key: 'Entrar em cloud functions custom', value: 'cd firebase\\custom_cloud_functions' },
    { key: 'Entrar em cloud functions padrao', value: 'cd firebase\\functions' },
    { key: 'Voltar um nivel', value: 'cd ..' },
    { key: 'Listar pastas/arquivos', value: 'Get-ChildItem' },
    { key: 'Listar rotas web', value: "Get-ChildItem 'web-next\\app' -Recurse -Filter page.tsx" },
    {
      key: 'Listar rotas mobile',
      value: "Get-ChildItem 'mh-personal-trainer-react-native\\app' -Recurse -Filter *.tsx",
    },
  ];

  const webRoleNav = [
    'Personal/Professor: /app, /workouts, /students, /profile, /schedule, /evaluations, /documents, /financeiro, /notifications, /ai, /support',
    'Academia: /academy, /academy/students, /academy/personals, /academy/ai, /academy/agenda, /academy/billing, /academy/linking, /academy/checkins, /academy/access, /support, /profile',
    'Aluno: /app, /workouts, /evaluations, /progress, /chat, /financeiro, /documents/aluno, /profile',
    'Admin: /admin, /admin/users, /admin/support, /admin/instagram, /admin/emails, /notifications/admin, /admin/treinors',
    'Bottom nav aluno (web): /app, /workouts, /evaluations, /chat, /profile',
    'Bottom nav personal (web): /app, /workouts, /students, /schedule, /profile',
  ];

  const mobileFlow = [
    'Entrada: app/index.tsx (splash) decide entre /(auth)/login e /(tabs).',
    'Tabs principais: index, workouts, nutrition, evaluations, chat, profile.',
    'Rotas autenticacao: login, register, forgot-password (stack em app/(auth)/_layout.tsx).',
    'Rotas adicionais fora das tabs: admin/*, ai/*, chat/*, documents/*, evaluations/*, financeiro/*, profile/*, schedule/*, workout/*.',
  ];

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MH Personal Trainer - Guia Completo</title>
  <style>
    :root {
      --bg: #f5f7fb;
      --paper: #ffffff;
      --ink: #10203a;
      --muted: #4f607a;
      --line: #d7deeb;
      --brand: #0a5cc6;
      --brand-soft: #e8f0fe;
      --code-bg: #eff3fa;
      --ok: #0f8a5f;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", "Calibri", Arial, sans-serif;
      background: linear-gradient(180deg, #edf2fa 0%, #f7f9fc 45%, #f5f7fb 100%);
      color: var(--ink);
      line-height: 1.5;
      font-size: 11pt;
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      padding: 16mm 14mm 16mm 14mm;
      background: var(--paper);
    }
    .cover {
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 24px;
      background: radial-gradient(circle at top right, #f0f6ff 0%, #ffffff 58%);
      margin-bottom: 22px;
    }
    .eyebrow {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      background: var(--brand-soft);
      color: var(--brand);
      font-size: 9pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    h1 {
      margin: 10px 0 8px 0;
      font-size: 25pt;
      line-height: 1.2;
      color: #083f8a;
    }
    .subtitle {
      color: var(--muted);
      margin: 0;
      font-size: 11pt;
    }
    .meta-grid {
      margin-top: 16px;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
    .meta-card {
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 10px 12px;
      background: #fff;
    }
    .meta-card .k {
      color: var(--muted);
      font-size: 9pt;
    }
    .meta-card .v {
      margin-top: 2px;
      font-weight: 700;
      color: #093b7a;
      word-break: break-word;
    }
    h2 {
      margin: 18px 0 8px 0;
      color: #0b3c80;
      font-size: 15pt;
      border-bottom: 2px solid #e8eef8;
      padding-bottom: 4px;
    }
    h3 {
      margin: 14px 0 6px 0;
      color: #154c95;
      font-size: 12.5pt;
    }
    p { margin: 0 0 8px 0; }
    ul { margin: 0 0 10px 18px; padding: 0; }
    li { margin: 3px 0; }
    code {
      background: var(--code-bg);
      border: 1px solid #d9e2f2;
      border-radius: 5px;
      padding: 1px 5px;
      font-family: Consolas, "Courier New", monospace;
      font-size: 9.2pt;
    }
    pre {
      margin: 7px 0 12px 0;
      padding: 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fbfdff;
      overflow: auto;
      font-size: 9pt;
      line-height: 1.4;
      white-space: pre;
    }
    .pill {
      display: inline-block;
      padding: 2px 8px;
      margin-right: 6px;
      border-radius: 999px;
      background: #edf4ff;
      border: 1px solid #d5e6ff;
      color: #0b58bf;
      font-size: 8.5pt;
      font-weight: 700;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0 14px 0;
      table-layout: fixed;
    }
    th, td {
      border: 1px solid var(--line);
      padding: 6px 7px;
      vertical-align: top;
      word-wrap: break-word;
      overflow-wrap: anywhere;
      font-size: 9.2pt;
    }
    th {
      background: #f0f4fb;
      color: #0f3f85;
      text-align: left;
      font-weight: 700;
    }
    .kv-table th:nth-child(1), .kv-table td:nth-child(1) { width: 30%; }
    .ok {
      color: var(--ok);
      font-weight: 700;
    }
    .grid-two {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .note {
      padding: 10px 12px;
      border: 1px dashed #c5d2e6;
      background: #f8fbff;
      border-radius: 9px;
      color: #2e3f5f;
      margin-bottom: 10px;
    }
    .footer {
      margin-top: 18px;
      font-size: 8.8pt;
      color: #5a6c88;
      border-top: 1px solid #dce4f2;
      padding-top: 8px;
    }
    .break-before {
      page-break-before: always;
      break-before: page;
    }
    @page {
      size: A4;
      margin: 10mm;
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="cover">
      <span class="eyebrow">Documentacao Tecnica Completa</span>
      <h1>MH Personal Trainer</h1>
      <p class="subtitle">Guia completo dos projetos <code>web-next</code> e <code>mh-personal-trainer-react-native</code>, com comandos, navegacao de paginas, estrutura e backend.</p>
      <div class="meta-grid">
        <div class="meta-card">
          <div class="k">Gerado em</div>
          <div class="v">${escapeHtml(generatedAtText)}</div>
        </div>
        <div class="meta-card">
          <div class="k">Rotas Web mapeadas</div>
          <div class="v">${nextRoutes.length}</div>
        </div>
        <div class="meta-card">
          <div class="k">Rotas Mobile mapeadas</div>
          <div class="v">${expoRoutes.length}</div>
        </div>
      </div>
    </section>

    <h2>1. Visao Geral</h2>
    <p>Este documento cobre as duas frentes principais do MH Personal Trainer: <strong>Web (Next.js)</strong> e <strong>Mobile (React Native + Expo Router)</strong>, alem dos servicos de <strong>Firebase Cloud Functions</strong>.</p>
    <p>Objetivo: permitir que qualquer pessoa da equipe entenda rapido <strong>como entrar no projeto</strong>, <strong>como navegar nas paginas</strong>, <strong>como rodar localmente</strong> e <strong>onde cada funcionalidade esta no codigo</strong>.</p>
    <div class="note">
      Perfis principais suportados no produto: <span class="pill">aluno</span><span class="pill">personal/professor</span><span class="pill">admin</span><span class="pill">academia</span>
    </div>

    <h2>2. Comandos Basicos (cd e navegacao)</h2>
    ${renderKeyValueTable(commandRows)}

    <h2>3. Estrutura de Pastas</h2>
    <h3>3.1 web-next</h3>
    <pre>${escapeHtml(webTree.join('\n'))}</pre>
    <h3>3.2 mh-personal-trainer-react-native</h3>
    <pre>${escapeHtml(rnTree.join('\n'))}</pre>
    <h3>3.3 firebase</h3>
    <pre>${escapeHtml(firebaseTree.join('\n'))}</pre>

    <h2>4. Como Rodar Cada Projeto</h2>
    <div class="grid-two">
      <div>
        <h3>Web (Next.js)</h3>
        <pre>cd web-next
npm install
npm run dev
# abre normalmente em http://localhost:3000</pre>
      </div>
      <div>
        <h3>Mobile (Expo)</h3>
        <pre>cd mh-personal-trainer-react-native
npm install
npm run start
# Android
npm run android
# iOS
npm run ios
# Web (Expo web)
npm run web</pre>
      </div>
    </div>

    <h3>4.1 Scripts disponiveis - Web</h3>
    ${renderScriptTable(webScripts)}
    <h3>4.2 Scripts disponiveis - Mobile</h3>
    ${renderScriptTable(rnScripts)}

    <h2>5. Navegacao da Aplicacao Web</h2>
    <p>No web, as paginas ficam em <code>web-next/app</code> (Next App Router). Grupos de rota usados: <code>(marketing)</code>, <code>(auth)</code>, <code>(app)</code>.</p>
    <h3>5.1 Navegacao por perfil (AppSidebar / BottomNav)</h3>
    ${renderList(webRoleNav)}

    <h3>5.2 Rotas Web completas</h3>
    <p>Total mapeado: <strong>${nextRoutes.length}</strong>.</p>
    ${renderRouteTable(nextRoutes)}

    <h2 class="break-before">6. Navegacao da Aplicacao Mobile (React Native)</h2>
    <p>No mobile, as telas ficam em <code>mh-personal-trainer-react-native/app</code>, usando Expo Router.</p>
    <h3>6.1 Fluxo principal de navegacao</h3>
    ${renderList(mobileFlow)}
    <h3>6.2 Tabs principais detectadas em <code>app/(tabs)/_layout.tsx</code></h3>
    ${renderList(tabsScreens.map((screen) => `<code>${escapeHtml(screen)}</code>`))}
    <h3>6.3 Telas de auth detectadas em <code>app/(auth)/_layout.tsx</code></h3>
    ${renderList(authScreens.map((screen) => `<code>${escapeHtml(screen)}</code>`))}
    <h3>6.4 Rotas Mobile completas</h3>
    <p>Total mapeado: <strong>${expoRoutes.length}</strong>.</p>
    ${renderRouteTable(expoRoutes)}

    <h2 class="break-before">7. Backend e Integracoes</h2>
    <h3>7.1 Cloud Functions custom (<code>firebase/custom_cloud_functions</code>)</h3>
    ${renderList(customCloudExports.map((name) => `<code>${escapeHtml(name)}</code>`))}
    <h3>7.2 Cloud Functions padrao (<code>firebase/functions</code>)</h3>
    ${renderList(firebaseFunctionsExports.map((name) => `<code>${escapeHtml(name)}</code>`))}

    <h2>8. Variaveis de Ambiente</h2>
    <h3>8.1 Web (NEXT_PUBLIC_*)</h3>
    ${renderSimpleTable('Variavel', 'Uso', webEnvVars)}
    <h3>8.2 Mobile (EXPO_PUBLIC_*)</h3>
    ${renderSimpleTable('Variavel', 'Uso', expoEnvVars)}
    <h3>8.3 Backend Firebase (process.env.*)</h3>
    ${renderSimpleTable('Variavel', 'Uso', cloudEnvVars)}

    <h2>9. Guia Rapido de Navegacao no Codigo (cd)</h2>
    <pre>cd web-next\\app\\(app)\\admin
Get-ChildItem

cd ..\\..\\..\\mh-personal-trainer-react-native\\app\\admin
Get-ChildItem

cd ..\\..\\firebase\\custom_cloud_functions
Get-ChildItem</pre>
    <p>Padrao pratico: entre no modulo, desca por area e abra <code>page.tsx</code> (web) ou <code>*.tsx</code> (mobile).</p>

    <h2>10. Checklist de Entendimento Rapido</h2>
    ${renderList([
      '<span class="ok">[OK]</span> Entendeu estrutura macro de pastas.',
      '<span class="ok">[OK]</span> Sabe os comandos de cd para cada modulo.',
      '<span class="ok">[OK]</span> Sabe como rodar web e mobile localmente.',
      `<span class="ok">[OK]</span> Tem mapa completo das rotas web (${nextRoutes.length}).`,
      `<span class="ok">[OK]</span> Tem mapa completo das rotas mobile (${expoRoutes.length}).`,
      '<span class="ok">[OK]</span> Tem lista de cloud functions e env vars.',
    ])}

    <div class="footer">
      Documento gerado automaticamente a partir do codigo-fonte do repositorio.<br/>
      Arquivo fonte HTML: <code>docs/mh-personal-trainer-guia-completo.html</code>
    </div>
  </main>
</body>
</html>`;

  fs.writeFileSync(outHtml, html, 'utf8');
  console.log(`HTML criado em: ${outHtml}`);
  console.log(`Rotas Web: ${nextRoutes.length}`);
  console.log(`Rotas Mobile: ${expoRoutes.length}`);
}

main();
