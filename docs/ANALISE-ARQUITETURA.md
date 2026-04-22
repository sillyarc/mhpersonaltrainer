# Analise Arquitetural do Monorepo MH Personal Trainer

## Objetivo deste documento

Este arquivo consolida uma leitura tecnica ampla do monorepo, cobrindo:

- `lib/` do projeto Flutter legado
- `mh-personal-trainer-react-native/`
- `web-next/`
- `firebase/`
- integracoes compartilhadas com Firebase, Stripe e IA
- pontos de convergencia, duplicacao e risco

Ele nao substitui leitura de codigo, mas reduz bastante o tempo de onboarding.

## Sumario Executivo

O sistema evoluiu em camadas, nao em substituicao limpa. O resultado atual e uma plataforma funcional, porem composta por tres frentes de UI diferentes sobre o mesmo backend:

1. um app Flutter/FlutterFlow muito grande e ainda relevante
2. um app mobile moderno em Expo/React Native
3. um app web moderno em Next.js, exportado estaticamente para Firebase Hosting

O backend e essencialmente o verdadeiro centro do produto:

- Firestore como banco operacional
- Firebase Auth como identidade
- Cloud Functions como camada de integracao e automacao
- Stripe como cobranca e pagamentos
- Hosting como entrega do web

A principal caracteristica do repositorio hoje nao e "microservicos" nem "monorepo organizado por pacote", e sim "multi-cliente evoluindo sobre um mesmo esquema de dados".

## Leitura por Camada

## 1. Flutter legado (`lib/`)

### O que e

`lib/` guarda o app original, fortemente influenciado por FlutterFlow. A estrutura tem dezenas de paginas geradas com nomes descritivos em portugues, alem de blocos customizados em:

- `lib/auth`
- `lib/backend`
- `lib/custom_code`
- `lib/components`
- `lib/flutter_flow`

### Sinais observados

- [lib/main.dart](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/lib/main.dart) ainda inicializa Firebase, App Check, Crashlytics, localizacoes, Stripe e roteamento.
- O projeto continua com `android/`, `ios/`, `pubspec.yaml` e dependencias Flutter completas.
- Ha integracao direta com Firebase Auth, Firestore, Storage, notificacoes push e Stripe.
- Existem plugins locais sobrescritos por path em `pubspec.yaml`, indicando customizacoes fora do padrao.

### Como pensar esse modulo

O Flutter legado nao e so "codigo antigo". Ele parece ser:

- base historica do produto
- repositorio de regras de negocio antigas
- referencia de telas/fluxos que foram parcialmente reescritos no RN e no Next

### Forcas

- cobertura funcional muito ampla
- ja integrado com praticamente todas as capacidades de produto
- guarda conhecimento historico do dominio

### Fraquezas

- naming e estrutura dificultam descoberta
- forte volume de codigo gerado
- risco alto de regras de negocio ficarem escondidas em paginas/widgets e nao em servicos claros
- manutencao mais lenta para times que hoje trabalham majoritariamente com TS/React

### Diagnostico

O `lib/` age hoje como legado operacional, nao como biblioteca de dominio reutilizavel. O valor dele e historico e funcional, mas sua ergonomia para evolucao e baixa.

## 2. Mobile atual (`mh-personal-trainer-react-native/`)

### O que e

Este e o cliente mobile moderno. Usa Expo Router, Firebase JS SDK, Stripe React Native, TanStack Query, Zustand, i18n e componentes proprios.

### Estrutura

Arquitetura principal:

- `app/`: rotas e telas
- `src/services/`: acesso a backend/dados
- `src/store/`: estado global
- `src/components/`: UI reutilizavel
- `src/types/`: contratos TS
- `src/hooks/`: hooks de composicao
- `src/theme/`: tokens visuais
- `src/i18n/`: internacionalizacao

### Entrada principal

[mh-personal-trainer-react-native/app/_layout.tsx](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/mh-personal-trainer-react-native/app/_layout.tsx) mostra bem a responsabilidade da shell:

- inicializa Firebase
- observa autenticacao
- carrega usuario do Firestore
- sincroniza idioma
- registra push notifications
- integra Stripe
- aplica ajustes de navegacao/barra no Android
- trata deep links de `invite` e `mobile-auth`

### Areas funcionais presentes em `app/`

- autenticacao
- tabs principais
- admin
- ai
- chat
- documents
- evaluations
- feedbacks
- financeiro
- help
- agenda
- notifications
- personal
- profile
- progress
- schedule
- settings
- support
- workout

### Servicos mais importantes

- [src/services/firebase.ts](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/mh-personal-trainer-react-native/src/services/firebase.ts)
- [src/services/firestoreService.ts](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/mh-personal-trainer-react-native/src/services/firestoreService.ts)
- [src/services/payments.ts](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/mh-personal-trainer-react-native/src/services/payments.ts)
- `notifications.ts`
- `notificationCenter.ts`
- `evaluations.ts`
- `workouts.ts`
- `chat.ts`
- `ai.ts`

### Padroes positivos

- separacao razoavel entre tela e servico
- tipagem mais clara que no legado Flutter
- organizacao por dominio dentro de `src`
- centralizacao de Firebase e pagamentos em servicos dedicados
- Expo Router facilita navegacao modular

### Padroes de atencao

- muita regra ainda depende do shape real do Firestore em tempo de execucao
- `firestoreService.ts` concentra bastante responsabilidade
- parte da config sensivel aparece em `app.json`/defaults
- alguns fallbacks e multiplas consultas mostram inconsistencias historicas do banco

### Diagnostico

O app React Native parece ser o frontend mais "aplicacao moderna" do repositorio. E a melhor base para evolucao mobile, mas ainda carrega forte acoplamento ao esquema legado do Firestore.

## 3. Web atual (`web-next/`)

### O que e

Cliente web em Next.js 14 App Router. Entrega:

- marketing publico
- autenticacao
- areas autenticadas de aluno/personal/admin/academy
- rotas API locais
- export estatico para Firebase Hosting
- possibilidade de build Tauri

### Estrutura

- `app/(marketing)`
- `app/(auth)`
- `app/(app)`
- `app/api`
- `components`
- `lib/services`
- `lib/types`
- `lib/hooks`
- `lib/server`
- `public`
- `scripts`
- `src-tauri`

### Entrada principal

[web-next/app/layout.tsx](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/web-next/app/layout.tsx) entrega:

- fontes customizadas
- metadata/SEO
- bootstrap de idioma
- bootstrap de tema
- PWA registrar
- providers globais

### Estrategia de build

[web-next/next.config.js](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/web-next/next.config.js) revela um ponto central:

- em desenvolvimento usa `.next-dev`
- em `HOSTING_BUILD` ou build Tauri de producao usa `output = 'export'`
- o hosting final depende de export estatico

Isso tem consequencia arquitetural forte: parte da experiencia dinamica precisa ser empurrada para:

- APIs client-side
- Cloud Functions
- placeholders HTML + rewrites no Hosting

### Dominios presentes nas rotas

O `app/` web cobre praticamente o mesmo dominio do mobile:

- academy
- admin
- ai
- chat
- documents
- evaluations
- feedbacks
- financeiro
- notifications
- profile
- schedule
- students
- support
- workout

Além disso, ha APIs locais para:

- openrouter chat
- biometria/session/submit
- entry register
- pagamentos
- turnstile

### Servicos centrais

- [web-next/lib/services/firebase.ts](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/web-next/lib/services/firebase.ts)
- [web-next/lib/services/firestoreService.ts](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/web-next/lib/services/firestoreService.ts)
- [web-next/lib/services/payments.ts](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/web-next/lib/services/payments.ts)
- `ai.ts`
- `aiAnalysis.ts`
- `chat.ts`
- `notificationCenter.ts`
- `workouts.ts`

### Padroes positivos

- separacao por route group melhora leitura
- API routes permitem encapsular integracoes web-only
- boa superficie para SEO/PWA
- design system e providers mais explicitos que no legado

### Padroes de atencao

- `next export` limita a ergonomia de rotas dinamicas e SSR real
- existencia de placeholders e rewrites e um sinal de adaptacao forcada ao hosting estatico
- logica de dominio volta a se repetir em relacao ao mobile
- coexistem duas estrategias de backend: `app/api` local e Cloud Functions

### Diagnostico

O `web-next` e uma camada web forte, mas opera com restricoes importantes por causa do modelo de export estatico. Funciona, porem exige mais disciplina para nao multiplicar caminhos paralelos de integracao.

## 4. Backend Firebase (`firebase/`)

### O que e

O backend pratico do produto esta aqui. Nao e um backend REST tradicional unico; e um conjunto de:

- Firestore
- Auth
- Storage
- Hosting
- Cloud Functions

### Functions customizadas

[firebase/custom_cloud_functions/index.js](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/firebase/custom_cloud_functions/index.js) exporta varios grupos:

- Stripe subscription e checkout
- setup intent
- Stripe Connect status/onboarding
- webhook Stripe
- IA/OpenRouter
- inbox/admin email
- planners de progresso com IA
- notificacoes para personal e aluno
- resolucao de convite
- mobile auth handoff
- dispatch de assistente por notificacao

### Leitura do runtime config

[firebase/custom_cloud_functions/runtime_config.js](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/firebase/custom_cloud_functions/runtime_config.js) tenta ler:

- `CLOUD_RUNTIME_CONFIG`
- fallback para `firebase-functions/v1`

Isso mostra preocupacao com compatibilidade entre ambientes, mas tambem sugere uma camada de configuracao que pode ficar opaca se nao estiver documentada fora do codigo.

### Hosting

[firebase.json](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/firebase.json) deixa clara a estrategia:

- publica `web-next/out`
- faz rewrites de `/api/...` para functions
- direciona rotas dinamicas web para arquivos placeholder

### Diagnostico

O backend e o ponto de maior coesao real do sistema. Quase tudo se encontra aqui, mesmo quando o codigo do cliente parece separado.

## Modelo de dominio observado

## Colecao `users` como centro

Pelos dois `firestoreService`, a colecao `users` concentra:

- identidade
- perfil
- papel do usuario
- flags de assinatura
- codigo do personal
- relacionamento com academia
- dados de localizacao
- dados de Stripe
- idioma
- arrays de alunos e treinos

Isso simplifica acesso inicial, mas concentra demais a semantica do sistema em um documento que vai crescendo ao longo do tempo.

## Relacionamentos importantes

- aluno <-> personal por `codigoPersonal`
- personal <-> alunos por arrays em `users.alunos`, `personalAccount.userList` e `professorAccount.userList`
- treinos por subcolecoes `createTreinos`
- avaliacoes por servicos que agregam multiplos tipos
- notificacoes em colecao transversal

## O que isso indica

Ha forte coexistencia de formas historicas de representar o mesmo relacionamento. Exemplo:

- busca por `codigoPersonal` no `users`
- busca em subcolecao `personalAccount`
- busca em colecao `professorAccount`

Isso aparece tanto no mobile quanto no web.

## Duplicacao de regras entre Web e React Native

Este e provavelmente o maior custo arquitetural atual.

### Exemplos claros

- `firestoreService.ts` existe nos dois clientes
- `payments.ts` existe nos dois clientes
- servicos de IA, chat, workouts, notifications e types tambem existem em paralelo
- ambos precisam conhecer regras de vinculo, papeis, campos do Firestore e endpoints Stripe

### Consequencias

- cada correcao de dominio pode precisar ser feita em dois lugares
- bugs de divergencia ficam mais provaveis
- refactors de schema do Firestore ficam caros
- onboarding exige comparar implementacoes em vez de depender de uma camada compartilhada

### Inferencia importante

O monorepo ainda nao esta organizado em "pacotes de dominio compartilhado". Ele esta organizado em "clientes separados que conhecem o mesmo backend".

## Stripe e pagamentos

## O que existe hoje

Nos dois clientes ha servicos completos para:

- criar assinatura
- criar checkout
- criar setup intent
- cancelar assinatura
- consultar status
- consultar faturas
- onboarding/connect para personal

No backend ha funcoes para suportar essa operacao.

## Ponto forte

O dominio de pagamentos esta relativamente explicito e encapsulado em servicos proprios.

## Ponto de atencao

Ha multiplos caminhos possiveis:

- API local web (`app/api/payments`)
- Cloud Functions
- fallback por `API_BASE_URL`

No web, o proprio codigo reconhece que o export estatico remove `app/api` em hosting, entao recorre a Cloud Functions. Isso e funcional, mas adiciona ramificacoes de execucao.

## Conclusao sobre Stripe

Pagamentos estao bem presentes na arquitetura, mas o caminho de execucao muda conforme runtime. Isso aumenta o esforco de teste e troubleshooting.

## IA e automacoes

O produto tem presenca forte de IA em varias camadas:

- paginas de IA no mobile e no web
- servicos `ai.ts` e `aiAnalysis.ts`
- funcao `openrouter_ai.js`
- planners automaticos de progresso
- dispatcher de assistente por notificacao

Isso mostra que IA nao e feature lateral; e parte do produto principal.

Risco principal:

- se prompts, gating de acesso e criterios de premium estiverem distribuidos entre cliente e funcao, a manutencao fica fragil

## Deploy e runtime web

## Estrategia atual

- Next build especial
- export estatico
- Hosting publica `out`
- Functions cobrem APIs e rotas server-like
- rewrites/placeholder compensam ausencia de SSR real

## Vantagens

- deploy simples no Firebase Hosting
- custo operacional menor que manter SSR dedicado

## Desvantagens

- rotas dinamicas ficam menos naturais
- necessidade de placeholders e um custo cognitivo
- APIs locais do Next nao sao a fonte primaria em producao estatica
- debugging pode variar entre local e producao

## Conclusao

Essa arquitetura entrega, mas nao e a mais simples para um app autenticado e altamente dinamico. Ela funciona por adaptacao cuidadosa.

## Configuracao e seguranca

Pontos observados:

- `mh-personal-trainer-react-native/app.json` contem chaves/configs embutidas
- `web-next/lib/services/firebase.ts` possui defaults do Firebase no cliente
- servicos de Stripe tambem carregam defaults e rotas conhecidas

Mesmo que parte disso seja publicamente aceitavel para SDK client, o conjunto sugere:

- pouca separacao entre config local, staging e prod
- maior chance de drift entre ambientes
- necessidade de revisar o que deve permanecer hardcoded e o que deve migrar para env/documentacao operacional

## Estado de maturidade por camada

### Flutter legado

- maturidade funcional: alta
- ergonomia de evolucao: baixa
- legibilidade para onboarding: baixa

### React Native

- maturidade funcional: media/alta
- ergonomia de evolucao: boa
- dependencia do schema legado: alta

### Web Next

- maturidade funcional: media/alta
- ergonomia de UI/rotas: boa
- complexidade de deploy: media/alta por causa do export estatico

### Firebase backend

- maturidade funcional: alta
- coesao operacional: alta
- documentacao implicita no codigo: alta demais

## Principais riscos arquiteturais

## 1. Duplicacao de dominio

Mesmo conceito implementado em multiplos clientes:

- vinculo aluno/personal
- acesso premium
- pagamentos
- leitura de perfil
- dashboard

Impacto:

- mais bugs por divergencia
- correcoes mais lentas

## 2. Esquema Firestore historicamente acumulado

Mesma informacao pode ser buscada em:

- `users`
- `users/{uid}/personalAccount`
- `professorAccount`

Impacto:

- logica defensiva demais
- custo de leitura/manutencao

## 3. Estrategia web com export estatico

Impacto:

- rotas dinamicas e APIs exigem camadas extras
- producao nao replica perfeitamente o runtime de desenvolvimento

## 4. Configuracao dispersa

Impacto:

- troubleshooting mais dificil
- maior acoplamento entre build e ambiente

## 5. Worktree muito ativo

O estado atual do repositorio mostra muitas mudancas locais. Isso indica duas coisas:

- o projeto esta em evolucao forte
- qualquer reorganizacao estrutural deve ser incremental e extremamente cuidadosa para nao atropelar trabalho em andamento

## Oportunidades de melhoria

## Curto prazo

- criar pacote compartilhado de tipos e regras de dominio entre `web-next` e `mh-personal-trainer-react-native`
- documentar esquema Firestore real por colecao/campo
- centralizar configuracao de Firebase/Stripe por ambiente
- reduzir `firestoreService` gigantes por modulos menores

## Medio prazo

- extrair camada shared para `users`, `payments`, `workouts`, `evaluations`
- padronizar uma unica fonte para relacionamento personal/aluno
- revisar se `web-next` precisa continuar em `next export` ou se vale migrar para runtime server de verdade

## Longo prazo

- decidir formalmente o papel do Flutter legado:
  - manter
  - congelar
  - migrar
  - decomissionar

Sem essa decisao, o monorepo tende a continuar acumulando duplicacao.

## Recomendacoes praticas de onboarding

Para alguem novo no projeto, a ordem mais eficiente e:

1. Ler [README.md](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/README.md).
2. Ler este documento inteiro.
3. Abrir [firebase.json](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/firebase.json).
4. Abrir [firebase/custom_cloud_functions/index.js](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/firebase/custom_cloud_functions/index.js).
5. Comparar:
   - [mh-personal-trainer-react-native/src/services/firestoreService.ts](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/mh-personal-trainer-react-native/src/services/firestoreService.ts)
   - [web-next/lib/services/firestoreService.ts](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/web-next/lib/services/firestoreService.ts)
6. Comparar:
   - [mh-personal-trainer-react-native/src/services/payments.ts](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/mh-personal-trainer-react-native/src/services/payments.ts)
   - [web-next/lib/services/payments.ts](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/web-next/lib/services/payments.ts)
7. So depois mergulhar nas telas especificas.

## Conclusao final

O monorepo MH Personal Trainer nao e pequeno nem simples, mas ele tem uma logica reconhecivel:

- produto real, ja operacional
- backend Firebase central
- clientes multiplos convivendo sobre o mesmo dominio
- forte presenca de Stripe e IA
- historico de evolucao que explica a duplicacao atual

Em termos de engenharia, o maior desafio nao parece ser "falta de feature", e sim "consolidar conhecimento de dominio sem quebrar a operacao". A documentacao nova ajuda nisso, mas o proximo salto de qualidade vira quando regras compartilhadas sairem dos clientes e virarem contratos reutilizaveis.
