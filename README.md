# Plataforma de Análise Crítica de Debates

Aplicação educacional para acompanhar debates, questionários, videoaulas e revisão administrativa.

## Tecnologias e estrutura

- `frontend/`: aplicação Vue 3, Vue Router e Tailwind CSS 4, compilada pelo Vite.
- `backend/server.js`: servidor Express e API REST.
- `backend/routes/registration.js`: cadastro de usuários e registro de consentimentos.
- `backend/routes/admin-content.js`: convites de administradores e gerenciamento de módulos e aulas.
- `backend/database/schema.sql`: esquema PostgreSQL para Supabase.
- `.env`: credenciais locais; nunca compartilhe nem envie esse arquivo ao Git.

## Executar

Instale as dependências:

```bash
npm install
```

Para desenvolvimento, rode o frontend e a API juntos:

```bash
npm run dev
```

O Vite abre em `http://localhost:5173` e encaminha `/api` para o Express de desenvolvimento em `http://localhost:3002`. A API de produção continua usando a porta `3001` por padrão.

Para compilar e executar a versão de produção local:

```bash
npm start
```

O comando compila o Vue/Tailwind e serve a aplicação e a API em `http://localhost:3001`.

## Supabase

1. Crie um projeto Supabase.
2. No **SQL Editor**, execute [backend/database/schema.sql](./backend/database/schema.sql).
   - Se o projeto já tinha o esquema instalado, execute também [backend/database/migrations/001_profiles_management.sql](./backend/database/migrations/001_profiles_management.sql) para habilitar as configurações de cadastro usadas pela página Perfis.
3. Configure no `.env` as variáveis de [`.env.example`](./.env.example). A chave `SUPABASE_SECRET_KEY` fica exclusivamente no servidor.
4. Em **Authentication → Providers → Email**, habilite a confirmação de e-mail e configure SMTP para envio das mensagens em produção.
5. Em **Authentication → URL Configuration**, permita os endereços de retorno locais e de produção. Defina `APP_BASE_URL` como a origem aberta no navegador (no desenvolvimento, `http://localhost:5173`; em produção, a URL publicada). Essa origem é usada para os links de confirmação e de convite.
6. Crie a primeira conta normalmente, confirme o e-mail e promova-a uma única vez pelo SQL Editor:

```sql
update public.profiles
set role = 'ADMIN'
where email = 'email-do-admin@exemplo.com';
```

Depois disso, administradores autenticados podem convidar outras pessoas na seção **Usuários** do painel. A pessoa recebe um e-mail, abre o link e define a senha em `/admin/accept-invite`; o servidor só finaliza um convite válido vinculado a um perfil ADMIN. Não existe cadastro público de administradores.

## Cadastro e conteúdo

- O cadastro de usuários fica em `/register`; a API registra aceite dos termos. Em `/admin/profiles`, o administrador escolhe se os novos cadastros precisam confirmar o e-mail. Quando a confirmação está desativada, o servidor cria contas já confirmadas e limita tentativas por endereço.
- O painel administrativo `/admin` contém indicadores, revisão de questionários, jobs e auditoria. A página `/admin/profiles` permite convidar, editar, suspender e excluir perfis.
- A exclusão de perfil é lógica: bloqueia o acesso sem apagar os dados históricos. A mesma página permite habilitar/desabilitar o cadastro público; convites de administradores continuam disponíveis.
- Quando a confirmação está exigida, ela também precisa estar habilitada em **Supabase → Authentication → Providers → Email**. Quando está desativada, a criação de contas confirmadas é feita pela API administrativa no servidor; a chave secreta nunca é exposta ao navegador.
- A página `/admin/content` permite cadastrar debates do YouTube, módulos e aulas com links de vídeos hospedados. Os registros começam como rascunho e podem ser publicados pelo administrador.
- A página de conteúdo **não envia arquivos de vídeo**: ela registra URLs de plataformas externas, conforme definido para esta versão.

## Escopo e limites

O projeto mantém os fluxos atuais de debates, avaliações, relatórios e revisão administrativa, mas ainda é um protótipo. A especificação prevê regras que precisam de implementação adicional antes do uso público, especialmente validação confiável do progresso de reprodução/aulas, transações atômicas de tentativas, processamento real da fila de IA e atendimento completo a solicitações LGPD.
