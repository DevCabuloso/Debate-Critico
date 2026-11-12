# Documento: análise crítica da plataforma de debates

## Resumo executivo
O documento descreve uma plataforma de educação e análise crítica de debates públicos. A proposta vai além de um simples player de vídeo: ela organiza uma jornada em etapas, combina video pedagógico com questionários, rastreia progresso e exige revisão humana antes de publicizar qualquer conteúdo de IA.

## Objetivo do produto
A plataforma deve ajudar estudantes, públicos gerais e equipes de conteúdo a:
- entender melhor argumentos e falácias presentes em debates;
- comparar posições com critérios estruturados;
- aprender em ciclos, não apenas responder uma vez;
- validar a qualidade das avaliações com revisão administrativa;
- manter transparência sobre origem, direitos e qualidade da IA.

## Principais módulos da solução
### 1. Autenticação e perfil
- registro com consentimento e verificação de idade mínima;
- login e recuperação via Supabase Auth;
- perfis USER e ADMIN;
- exportação e exclusão de dados pessoais.

### 2. Vídeos e debates
- cadastro de debates, categorias e direitos autorais;
- player incorporado com rastreio de progresso;
- validação do critério de visualização para liberar etapas.

### 3. Ciclos e aprendizagem
- cada usuário pode iniciar um ciclo por debate;
- há avaliação inicial, aulas obrigatórias e segunda visualização;
- a plataforma registra estado, ordem e resultados;
- transições de estado devem ser validadas no backend.

### 4. Questionários
- versão aprovada e estável;
- alternativas embaralhadas por tentativa;
- gabarito retido até a etapa correta;
- respostas enviadas por identificador da alternativa.

### 5. Relatórios
- relatório do usuário por ciclo e por debate;
- métricas de ganho normalizado e taxa de abandono;
- visão administrativa com indicadores agregados.

### 6. IA e processamento assíncrono
- jobs para geração de transcrição e análise;
- fila com lease, retry e idempotência;
- revisão humana da IA antes da publicação do questionário.

## Decisões metodológicas relevantes
O documento corrige inconsistências da versão inicial, sobretudo em:
- autenticação (Supabase Auth no frontend e validação JWT no backend);
- gabarito em tabela separada, sem acesso do papel USER;
- persistência do embaralhamento por tentativa;
- versionamento de questionários por vídeo e versão;
- política de privacidade e consentimento;
- localização de direitos de conteúdo e definição de transcrição autorizada.

## Riscos principais identificados
- uso inadequado de conteúdo de terceiros;
- risco jurídico em debates com pessoas reais;
- prompt injection em arquivos de transcrição;
- fraude de progresso via eventos manipulados;
- custo operacional e dependência de fornecedores externos.

## Conclusão
A especificação oferece uma base sólida para construir um produto com visão pedagógica, rigor metodológico e preocupação com segurança e privacidade. O protótipo desenvolvido neste repositório reproduz a estrutura do funcionamento principal da plataforma e serve como base para evolução para uma solução de produção.

## Implementação atual
- Frontend em Vue 3 com Vue Router e Tailwind CSS 4, organizado por telas em `frontend/src/views/`.
- API Express modularizada para autenticação/cadastro (`backend/routes/registration.js`) e conteúdo/convites administrativos (`backend/routes/admin-content.js`).
- O conteúdo audiovisual é cadastrado por links de plataformas hospedadas; upload de arquivos para storage não faz parte desta versão.
- Convites de administrador são enviados por e-mail a partir de uma sessão ADMIN; o cadastro público cria somente perfis USER.
- Confirmação de e-mail e entrega de convites dependem da configuração de Auth/SMTP do Supabase.

O fluxo da plataforma continua sendo um protótipo: validação antifraude do progresso audiovisual, transições completas dos ciclos e execução efetiva da fila de IA ainda precisam ser concluídas antes do uso público.
