# MH Personal Trainer

Monorepo da plataforma MH Personal Trainer. Hoje o repositorio reune quatro camadas principais sobre o mesmo projeto Firebase `profissions-2746d`:

- app Flutter/FlutterFlow legado na raiz (`lib/`)
- app mobile atual em Expo/React Native (`mh-personal-trainer-react-native/`)
- app web atual em Next.js (`web-next/`)
- backend/serverless com Firebase Hosting, Firestore, Storage e Cloud Functions (`firebase/`)

Este README foi reescrito para servir como documento de entrada do projeto e apontar para a analise tecnica completa em [docs/ANALISE-ARQUITETURA.md](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/docs/ANALISE-ARQUITETURA.md).

## Visao Geral

O produto atende pelo menos quatro perfis:

- alunos
- personais
- administradores
- academias

Os principais dominios funcionais presentes no monorepo sao:

- autenticacao e cadastro
- vinculo aluno/personal por `codigoPersonal`
- treinos musculacao e aerobicos
- avaliacoes fisicas, posturais, online e personalizadas
- chat e recursos de IA
- notificacoes
- documentos
- agenda/agendamentos
- assinatura Stripe e repasses para personal
- paineis administrativos e de academia

## Mapa do Repositorio

```text
.
|-- lib/                                Flutter/FlutterFlow legado
|-- mh-personal-trainer-react-native/   App mobile atual em Expo Router
|-- web-next/                           App web atual em Next.js 14
|-- firebase/
|   |-- custom_cloud_functions/         Funcoes Node.js/Stripe/IA/notificacoes
|   `-- functions/                      Funcoes adicionais
|-- docs/                               PDFs/HTMLs existentes + analise nova em Markdown
|-- assets/                             Assets compartilhados do app Flutter
|-- android/ ios/                       Shells nativos do projeto Flutter raiz
|-- firestore.rules
|-- firestore.indexes.json
|-- storage.rules
|-- firebase.json                       Hosting publica web-next/out
`-- .firebaserc                         Projeto padrao: profissions-2746d
```

## Stack Atual

### Backend e infraestrutura

- Firebase Authentication
- Cloud Firestore
- Firebase Storage
- Firebase Hosting
- Firebase Cloud Functions
- Stripe
- OpenRouter/IA em funcoes e rotas web

### Frontend web

- Next.js 14 App Router
- React 18
- TypeScript
- Firebase Web SDK
- Recharts
- Tauri para empacotamento desktop

### Frontend mobile atual

- Expo 54
- React Native 0.81
- Expo Router
- TanStack Query
- React Native Paper
- Zustand
- Firebase JS SDK
- Stripe React Native

### Frontend legado

- Flutter
- FlutterFlow
- Firebase SDKs para Flutter
- Stripe Flutter

## Aplicacoes e Como Rodar

### 1. Web Next

Pasta: [web-next](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/web-next)

Comandos principais:

```bash
cd web-next
npm install
npm run dev
npm run build
npm run build:hosting
```

Observacoes:

- `npm run build:hosting` gera export estatico em `web-next/out`
- o `firebase.json` da raiz publica exatamente `web-next/out`
- em build de hosting o app usa `output = 'export'`
- rotas dinamicas criticas sao atendidas por placeholders/rewrite no Firebase Hosting

### 2. Mobile React Native

Pasta: [mh-personal-trainer-react-native](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/mh-personal-trainer-react-native)

Comandos principais:

```bash
cd mh-personal-trainer-react-native
npm install
npm run start
npm run android
npm run ios
npm run web
```

Observacoes:

- usa `expo-router`
- o layout raiz inicializa Firebase, Stripe, push notifications, i18n e stores globais
- ha logica explicita para restringir uso web a telas moveis/tablets

### 3. Flutter legado

Pasta base: raiz do repo

Comandos principais:

```bash
flutter pub get
flutter run
```

Observacoes:

- e um projeto grande gerado com FlutterFlow e depois customizado
- continua convivendo com as apps novas
- ainda concentra muito dominio em `lib/backend`, `lib/auth` e varias telas geradas

### 4. Firebase Functions

Pasta: [firebase/custom_cloud_functions](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/firebase/custom_cloud_functions)

Comandos principais:

```bash
cd firebase/custom_cloud_functions
npm install
```

Deploy pela raiz:

```bash
firebase deploy --only functions
firebase deploy --only hosting
```

## Deploy Web

O fluxo atual do web no Firebase e:

1. build do `web-next` com `npm run build:hosting`
2. geracao do site estatico em `web-next/out`
3. deploy do Hosting pela raiz

Exemplo:

```bash
cd web-next
npm run build:hosting

cd ..
npx firebase-tools deploy --only hosting --project profissions-2746d --non-interactive
```

## Principais Arquivos de Configuracao

- [firebase.json](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/firebase.json)
- [.firebaserc](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/.firebaserc)
- [pubspec.yaml](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/pubspec.yaml)
- [package.json](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/package.json)
- [mh-personal-trainer-react-native/package.json](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/mh-personal-trainer-react-native/package.json)
- [mh-personal-trainer-react-native/app.json](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/mh-personal-trainer-react-native/app.json)
- [web-next/package.json](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/web-next/package.json)
- [web-next/next.config.js](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/web-next/next.config.js)
- [firebase/custom_cloud_functions/index.js](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/firebase/custom_cloud_functions/index.js)

## Arquitetura Resumida

### Dados

- `users` e a colecao central
- subcolecoes como `createTreinos` e `personalAccount` carregam boa parte do dominio
- existem tambem dados em `professorAccount`, `notificacao` e outras colecoes transversais

### Integracoes

- Firebase Auth centraliza login
- Firestore concentra leitura e escrita operacional
- Storage guarda documentos e midia
- Stripe cobre assinatura de aluno, onboarding/connect e checkout
- IA aparece tanto em funcoes Firebase quanto em rotas/servicos web/mobile

### Entrega

- web: Firebase Hosting + rewrites para functions + fallback estatico
- mobile: Expo / builds nativas
- legado: Flutter/FlutterFlow ainda compila como aplicacao propria

## Riscos Tecnicos Mais Importantes

- coexistencia de tres frontends com regra de dominio duplicada
- forte acoplamento ao formato atual do Firestore
- varias leituras fazem fallback em colecoes/subcolecoes diferentes para achar o mesmo dado
- parte da configuracao sensivel aparece em defaults/client config
- o modo `next export` exige placeholders e rewrites para simular rotas dinamicas
- worktree atual esta bastante modificado, entao qualquer refactor precisa ser incremental

Esses pontos estao detalhados em [docs/ANALISE-ARQUITETURA.md](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/docs/ANALISE-ARQUITETURA.md).

## Ordem Recomendada Para Entender o Sistema

1. Ler este README.
2. Ler [docs/ANALISE-ARQUITETURA.md](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/docs/ANALISE-ARQUITETURA.md).
3. Abrir [firebase.json](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/firebase.json) para entender o deploy e os rewrites.
4. Abrir [mh-personal-trainer-react-native/app/_layout.tsx](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/mh-personal-trainer-react-native/app/_layout.tsx).
5. Abrir [web-next/app/layout.tsx](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/web-next/app/layout.tsx).
6. Abrir os dois `firestoreService` para comparar regras e divergencias.

## Estado Atual do Monorepo

- o repositorio esta com muitas mudancas locais nao relacionadas a esta documentacao
- esta atualizacao de docs nao remove nem reverte trabalho existente
- qualquer migracao maior deve partir do principio de que Flutter legado, React Native e Next.js ainda compartilham o mesmo backend

## Documento Complementar

- analise completa: [docs/ANALISE-ARQUITETURA.md](/C:/Users/wende/Projects/mhpersonaltrainer-main-main/docs/ANALISE-ARQUITETURA.md)
