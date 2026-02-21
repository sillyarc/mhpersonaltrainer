const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outDir = path.join(root, 'docs');
const outHtml = path.join(outDir, 'mh-personal-trainer-arquitetura-integrada.html');

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
  '.dart_tool',
  '.idea',
  '.vscode',
]);

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function walkFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.git')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      walkFiles(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function listNextRoutes() {
  const appDir = path.join(root, 'web-next', 'app');
  const files = walkFiles(appDir).filter((file) => file.endsWith(`${path.sep}page.tsx`));
  const routes = files.map((file) => {
    const relative = path.relative(appDir, file).split(path.sep);
    const cleaned = relative.slice(0, -1).filter((segment) => !/^\(.*\)$/.test(segment));
    const route = cleaned.length ? `/${cleaned.join('/')}` : '/';
    return { route, source: `web-next/app/${relative.join('/')}` };
  });
  routes.sort((a, b) => a.route.localeCompare(b.route));
  return routes;
}

function listExpoRoutes() {
  const appDir = path.join(root, 'mh-personal-trainer-react-native', 'app');
  const files = walkFiles(appDir)
    .filter((file) => file.endsWith('.tsx'))
    .filter((file) => !file.endsWith(`${path.sep}_layout.tsx`));
  const routes = files.map((file) => {
    const relative = path.relative(appDir, file).split(path.sep);
    const fileName = relative[relative.length - 1].replace(/\.tsx$/i, '');
    const cleaned = relative
      .slice(0, -1)
      .filter((segment) => !/^\(.*\)$/.test(segment));
    if (fileName !== 'index') cleaned.push(fileName);
    const route = cleaned.length ? `/${cleaned.join('/')}` : '/';
    return { route, source: `mh-personal-trainer-react-native/app/${relative.join('/')}` };
  });
  routes.sort((a, b) => a.route.localeCompare(b.route));
  return routes;
}

function firstSegment(route) {
  if (route === '/') return 'home';
  const raw = route.replace(/^\//, '');
  return raw.split('/')[0] || 'home';
}

function countByArea(routes) {
  const map = new Map();
  for (const route of routes) {
    const area = firstSegment(route.route);
    map.set(area, (map.get(area) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([area, count]) => ({ area, count }))
    .sort((a, b) => a.area.localeCompare(b.area));
}

function renderTable(headers, rows) {
  const thead = `<thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${rows
    .map(
      (row) =>
        `<tr>${row.map((col) => `<td>${typeof col === 'string' ? col : String(col)}</td>`).join('')}</tr>`
    )
    .join('')}</tbody>`;
  return `<table>${thead}${tbody}</table>`;
}

function renderList(items) {
  return `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
}

function formatDateTimePt(date) {
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function routeSlice(routes, prefix, max = 8) {
  return routes
    .map((item) => item.route)
    .filter((route) => route === prefix || route.startsWith(`${prefix}/`))
    .slice(0, max);
}

function joinCodeList(items) {
  return items.map((item) => `<code>${escapeHtml(item)}</code>`).join(', ');
}

function main() {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const generatedAt = new Date();
  const generatedAtText = formatDateTimePt(generatedAt);

  const nextRoutes = listNextRoutes();
  const expoRoutes = listExpoRoutes();
  const webAreas = countByArea(nextRoutes);
  const mobileAreas = countByArea(expoRoutes);

  const webAreaMap = new Map(webAreas.map((item) => [item.area, item.count]));
  const mobileAreaMap = new Map(mobileAreas.map((item) => [item.area, item.count]));
  const allAreas = Array.from(new Set([...webAreaMap.keys(), ...mobileAreaMap.keys()])).sort();

  const parityRows = allAreas.map((area) => [
    `<code>${escapeHtml(area)}</code>`,
    String(webAreaMap.get(area) || 0),
    String(mobileAreaMap.get(area) || 0),
    webAreaMap.get(area) && mobileAreaMap.get(area)
      ? 'Compartilhado'
      : webAreaMap.get(area)
      ? 'Somente Web'
      : 'Somente Mobile',
  ]);

  const keyFlows = [
    {
      title: 'Personal cria treino no Web -> Aluno executa no Mobile',
      steps: [
        'Personal/professor autenticado no WebNext cria rotina em rotas de treino.',
        'Dados sao salvos no Firestore (subcolecoes de usuario, como <code>createTreinos</code>).',
        'Aluno faz login no React Native e carrega os treinos vinculados no mesmo backend.',
        'Conclusoes do aluno atualizam campos de progresso/ultimo treino.',
        'Painel do personal (web) consegue refletir status e evolucao.',
      ],
    },
    {
      title: 'Academia gerencia vinculacoes no Web',
      steps: [
        'Conta com <code>academyAccount</code> usa rotas <code>/academy/*</code>.',
        'Academia vincula alunos e personais por codigos e metadados no Firestore.',
        'Esse vinculo impacta quais dados aparecem para personal e aluno nos apps.',
      ],
    },
    {
      title: 'Aluno principal no React Native',
      steps: [
        'Aluno entra por <code>/(auth)/login</code> e segue para <code>/(tabs)</code>.',
        'Tela inicial, treinos, avaliacoes, financeiro e chat leem os mesmos documentos do Firebase.',
        'No WebNext, aluno existe, mas o acesso no browser e propositalmente limitado para viewport menor.',
      ],
    },
    {
      title: 'Admin opera no WebNext',
      steps: [
        'Admin (papel <code>admin</code>) acessa rotas <code>/admin/*</code> e monitora usuarios/suporte.',
        'Cloud Functions e notificacoes de seguranca alimentam o painel admin.',
        'Existe suporte administrativo no mobile, mas o centro operacional principal esta no WebNext.',
      ],
    },
  ];

  const webPersonalSample = routeSlice(nextRoutes, '/app', 1)
    .concat(routeSlice(nextRoutes, '/workouts', 2))
    .concat(routeSlice(nextRoutes, '/students', 2))
    .concat(routeSlice(nextRoutes, '/schedule', 2))
    .concat(routeSlice(nextRoutes, '/evaluations', 3))
    .slice(0, 12);
  const mobilePersonalSample = routeSlice(expoRoutes, '/workouts', 2)
    .concat(routeSlice(expoRoutes, '/students', 2))
    .concat(routeSlice(expoRoutes, '/schedule', 2))
    .concat(routeSlice(expoRoutes, '/evaluations', 2))
    .slice(0, 10);

  const academySample = routeSlice(nextRoutes, '/academy', 12);
  const alunoMobileSample = routeSlice(expoRoutes, '/workouts', 2)
    .concat(routeSlice(expoRoutes, '/evaluations', 2))
    .concat(routeSlice(expoRoutes, '/chat', 2))
    .concat(routeSlice(expoRoutes, '/profile', 2))
    .slice(0, 10);
  const adminWebSample = routeSlice(nextRoutes, '/admin', 12);

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MH Personal Trainer - Arquitetura Integrada</title>
  <style>
    :root {
      --ink: #13233f;
      --muted: #4e6182;
      --line: #d8e1ef;
      --brand: #0b57c0;
      --soft: #ecf3ff;
      --paper: #ffffff;
      --bg: #f5f8fc;
      --code-bg: #f0f5fd;
      --ok: #0a8f63;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", Calibri, Arial, sans-serif;
      background: linear-gradient(180deg, #eef4fd 0%, #f8faff 40%, #f5f8fc 100%);
      color: var(--ink);
      line-height: 1.5;
      font-size: 11pt;
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      background: var(--paper);
      padding: 16mm 14mm;
    }
    .cover {
      border: 1px solid var(--line);
      border-radius: 16px;
      background: radial-gradient(circle at top right, #eef5ff 0%, #ffffff 60%);
      padding: 22px;
      margin-bottom: 20px;
    }
    .chip {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      border: 1px solid #d5e4ff;
      background: var(--soft);
      color: var(--brand);
      font-size: 9pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    h1 {
      margin: 10px 0 8px;
      font-size: 25pt;
      line-height: 1.2;
      color: #0b438f;
    }
    h2 {
      margin: 18px 0 8px;
      font-size: 15pt;
      color: #0f3f83;
      border-bottom: 2px solid #e8eef8;
      padding-bottom: 4px;
    }
    h3 {
      margin: 14px 0 6px;
      font-size: 12.2pt;
      color: #184e94;
    }
    p { margin: 0 0 8px; }
    ul { margin: 0 0 10px 18px; padding: 0; }
    li { margin: 3px 0; }
    code {
      background: var(--code-bg);
      border: 1px solid #d7e1f2;
      border-radius: 5px;
      padding: 1px 5px;
      font-family: Consolas, "Courier New", monospace;
      font-size: 9.2pt;
    }
    pre {
      margin: 8px 0 12px;
      border: 1px solid var(--line);
      background: #fafcff;
      border-radius: 8px;
      padding: 10px;
      white-space: pre-wrap;
      font-size: 9pt;
      line-height: 1.4;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0 14px;
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
      background: #eff4fc;
      color: #104183;
      text-align: left;
      font-weight: 700;
    }
    .meta {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin-top: 14px;
    }
    .meta-card {
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 9px 11px;
      background: #fff;
    }
    .meta-card .k { color: var(--muted); font-size: 9pt; }
    .meta-card .v { color: #0d427f; font-weight: 700; margin-top: 2px; }
    .note {
      border: 1px dashed #bfd0ea;
      background: #f6faff;
      border-radius: 9px;
      padding: 10px 12px;
      margin: 8px 0 12px;
      color: #2a3e61;
    }
    .ok { color: var(--ok); font-weight: 700; }
    .break {
      page-break-before: always;
      break-before: page;
    }
    .footer {
      margin-top: 16px;
      border-top: 1px solid #dce5f4;
      padding-top: 8px;
      color: #5c6f8d;
      font-size: 8.8pt;
    }
    @page { size: A4; margin: 10mm; }
  </style>
</head>
<body>
  <main class="page">
    <section class="cover">
      <span class="chip">Arquitetura Integrada</span>
      <h1>MH Personal Trainer<br/>WebNext + React Native</h1>
      <p>Explicacao completa de como o ecossistema funciona junto, com foco por perfil: <strong>Personal</strong>, <strong>Academia</strong>, <strong>Aluno</strong> e <strong>Admin</strong>.</p>
      <div class="meta">
        <div class="meta-card"><div class="k">Gerado em</div><div class="v">${escapeHtml(generatedAtText)}</div></div>
        <div class="meta-card"><div class="k">Rotas Web</div><div class="v">${nextRoutes.length}</div></div>
        <div class="meta-card"><div class="k">Rotas Mobile</div><div class="v">${expoRoutes.length}</div></div>
      </div>
    </section>

    <h2>1. Resumo Executivo</h2>
    <p>O produto e um ecossistema unico com duas interfaces principais: <code>web-next</code> e <code>mh-personal-trainer-react-native</code>. As duas apps usam o mesmo backend (Firebase + servicos auxiliares), entao dados de treino, avaliacao, perfil, assinatura e notificacao se cruzam entre plataformas.</p>
    <div class="note">
      Mapa de operacao principal solicitado:<br/>
      <strong>Personal:</strong> WebNext + React Native<br/>
      <strong>Academia:</strong> WebNext<br/>
      <strong>Aluno:</strong> React Native (com acesso web limitado)<br/>
      <strong>Admin:</strong> WebNext (com suporte mobile secundario)
    </div>

    <h2>2. Como os Apps se Juntam</h2>
    <pre>[WebNext] --------------------\\
                               > [Firebase Auth + Firestore + Storage] --- [Cloud Functions + Stripe + IA]
[React Native/Expo] ----------/

Ambos os frontends leem/escrevem nos mesmos documentos de usuarios e modulos de negocio.
Nao sao dois sistemas separados: sao duas "faces" do mesmo produto.</pre>

    <h2>3. Matriz por Perfil</h2>
    ${renderTable(
      ['Perfil', 'Interface principal', 'Onde autentica', 'Onde opera', 'Dados compartilhados'],
      [
        [
          '<strong>Personal/Professor</strong>',
          'WebNext + React Native',
          '<code>users/{uid}</code> com <code>professorAccount=true</code>',
          'Treinos, alunos, agenda, avaliacoes, financeiro, IA',
          'Mesmo cadastro, mesmo codigoPersonal, mesmos alunos/treinos',
        ],
        [
          '<strong>Academia</strong>',
          'WebNext',
          '<code>users/{uid}</code> com <code>academyAccount=true</code>',
          'Painel academy, vinculacoes, billing, checkins, acesso',
          'Impacta visibilidade e vinculo entre aluno/personal',
        ],
        [
          '<strong>Aluno</strong>',
          'React Native',
          '<code>users/{uid}</code> padrao aluno',
          'Treino, chat, progresso, avaliacoes, financeiro, perfil',
          'Consome treinos/avaliacoes criados por personal/academia',
        ],
        [
          '<strong>Admin</strong>',
          'WebNext',
          '<code>users/{uid}</code> com <code>admin=true</code>',
          'Resumo admin, usuarios, suporte, email, notificacoes',
          'Monitora dados consolidados do mesmo backend',
        ],
      ]
    )}

    <h2>4. Auth e Role Resolution</h2>
    <h3>4.1 WebNext</h3>
    ${renderList([
      'Auth central em <code>web-next/lib/auth.tsx</code>.',
      'Role suportadas no web: <code>aluno</code>, <code>personal</code>, <code>professor</code>, <code>academy</code>, <code>admin</code>.',
      'Rotas protegidas por <code>AuthGate</code> e gates especificos (<code>AdminGate</code>, <code>AcademyGate</code>).',
      'No web, aluno e propositalmente limitado a viewport pequena (regra no <code>AuthGate</code>).',
    ])}
    <h3>4.2 React Native</h3>
    ${renderList([
      'Auth principal em <code>mh-personal-trainer-react-native/src/hooks/useAuth.ts</code> + store em <code>src/store/authStore.ts</code>.',
      'Role no mobile: <code>admin</code>, <code>professor</code>, <code>aluno</code>.',
      'Fluxo inicial: splash (<code>app/index.tsx</code>) decide <code>/(auth)/login</code> ou <code>/(tabs)</code>.',
      'Firebase inicializa em <code>src/services/firebase.ts</code> com persistencia e fallback por plataforma.',
    ])}

    <h2>5. Arquitetura de Dados Compartilhados</h2>
    ${renderList([
      'Documento base do usuario: <code>users/{uid}</code> (nome, papel, assinatura, codigos, metadados).',
      'Subcolecoes e colecoes de dominio para treinos, avaliacoes, agenda, notificacoes e financeiro.',
      'Relacao personal-aluno por <code>codigoPersonal</code> e referencias no usuario/aluno.',
      'Relacao academia por <code>codigoAcademia</code> e flags de vinculo.',
      'Servicos de leitura/escrita paralelos em web e mobile (arquivos <code>firestoreService.ts</code> em ambos os projetos).',
    ])}

    <h2 class="break">6. Fluxos Integrados por Papel</h2>
    ${keyFlows
      .map(
        (flow) => `<h3>${escapeHtml(flow.title)}</h3>${renderList(flow.steps)}`
      )
      .join('')}

    <h2>7. Mapeamento de Modulos (Web x Mobile)</h2>
    <p>Contagem por area de rota (primeiro segmento), extraida automaticamente do codigo.</p>
    ${renderTable(['Area', 'WebNext', 'React Native', 'Status'], parityRows)}
    <div class="note">
      Leitura pratica da paridade:<br/>
      <span class="ok">Compartilhado</span> = existe nos dois lados (ex.: <code>ai</code>, <code>chat</code>, <code>evaluations</code>, <code>financeiro</code>, <code>profile</code>, <code>workout</code>).<br/>
      <span class="ok">Somente Web</span> = foco operacional web (ex.: <code>academy</code>, maior parte de <code>admin</code>).<br/>
      <span class="ok">Somente Mobile</span> = experiencia nativa especifica.
    </div>

    <h3>7.1 Personal (amostra de rotas Web)</h3>
    <p>${joinCodeList(webPersonalSample)}</p>
    <h3>7.2 Personal (amostra de rotas Mobile)</h3>
    <p>${joinCodeList(mobilePersonalSample)}</p>
    <h3>7.3 Academia (Web)</h3>
    <p>${joinCodeList(academySample)}</p>
    <h3>7.4 Aluno (Mobile)</h3>
    <p>${joinCodeList(alunoMobileSample)}</p>
    <h3>7.5 Admin (Web)</h3>
    <p>${joinCodeList(adminWebSample)}</p>

    <h2>8. Integracao de IA, Pagamentos e Notificacoes</h2>
    <h3>8.1 IA (OpenRouter)</h3>
    ${renderList([
      'Web: <code>web-next/lib/services/ai.ts</code>.',
      'Mobile: <code>mh-personal-trainer-react-native/src/services/ai.ts</code>.',
      'Ambos usam modelo/endpoint configuravel por variaveis de ambiente.',
      'Controle de creditos diarios para plano gratuito com bypass para premium.',
    ])}
    <h3>8.2 Pagamentos (Stripe + Functions)</h3>
    ${renderList([
      'Web: <code>web-next/lib/services/payments.ts</code>.',
      'Mobile: <code>mh-personal-trainer-react-native/src/services/payments.ts</code>.',
      'Fluxos usam endpoints de Cloud Functions (<code>createInscricao</code>, <code>createSetupIntent</code>, <code>createCheckoutSession</code>, etc.).',
      'Dados de assinatura refletem no documento de usuario e impactam IA/limites.',
    ])}
    <h3>8.3 Notificacoes</h3>
    ${renderList([
      'Mobile registra token e envia para <code>users/{uid}</code> (<code>fcm_tokens</code>, <code>pushToken</code>).',
      'Web tambem escreve token (fallback web) e gerencia alertas locais.',
      'Colecao <code>notificacao</code> e compartilhada para feed e alertas de seguranca.',
      'Cloud Functions em <code>firebase/functions/index.js</code> tratam dispatch de push em escala.',
    ])}

    <h2>9. O que isso significa na pratica</h2>
    ${renderList([
      '<strong>Nao ha separacao de produto por plataforma.</strong> Existe um unico dominio de negocio e dois clientes.',
      '<strong>Personal e o elo cross-platform.</strong> Pode operar no web e no app sem duplicar conta ou dados.',
      '<strong>Academia e governanca via web.</strong> Organiza vinculacoes e operacao institucional.',
      '<strong>Aluno e experiencia nativa.</strong> Consumo diario de treino/progresso no mobile.',
      '<strong>Admin e controle central no web.</strong> Visao global, suporte, seguranca e operacao.',
    ])}

    <h2>10. Checklist de Coerencia da Arquitetura</h2>
    ${renderList([
      `<span class="ok">[OK]</span> Web e Mobile autenticam no mesmo Firebase Auth.`,
      `<span class="ok">[OK]</span> Ambos leem/escrevem no mesmo Firestore.`,
      `<span class="ok">[OK]</span> Modulos de negocio possuem servicos espelhados nos dois clientes.`,
      `<span class="ok">[OK]</span> Fluxos de assinatura/IA/notificacao atravessam plataformas.`,
      `<span class="ok">[OK]</span> Distribuicao por perfil bate com seu modelo: Personal (web+mobile), Academia (web), Aluno (mobile), Admin (web).`,
    ])}

    <div class="footer">
      Arquivo fonte: <code>docs/mh-personal-trainer-arquitetura-integrada.html</code><br/>
      Gerado automaticamente a partir do repositorio atual.
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
