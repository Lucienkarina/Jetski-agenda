# 🌊 Agenda Jet Skis — PWA compartilhado

PWA único, instalável em iPhone, Android e computador, para até **10 proprietários**
organizarem a disponibilidade e os agendamentos de seus jet skis em uma **única agenda
compartilhada**. Não é um sistema de pagamento/venda — só controle de horários.

Todos os usuários acessam o **mesmo link** e enxergam o **mesmo banco de dados**, com
atualização em tempo real.

## Como o sistema resolve as regras principais do briefing

- **Nunca duas reservas conflitantes**: a checagem não fica só no frontend. A tabela
  `bookings` tem uma *exclusion constraint* no Postgres (`no_overlapping_bookings`) que
  torna fisicamente impossível salvar dois horários sobrepostos para o mesmo jet ski.
- **Concorrência (dois cliques ao mesmo tempo)**: como a trava é no banco, se João e
  Carlos confirmarem o mesmo horário quase simultaneamente, o banco aceita a primeira
  transação e rejeita a segunda com um erro de exclusão — o app mostra então "Este
  horário acabou de ser reservado por outro usuário."
- **Tempo real**: o app usa Supabase Realtime (`postgres_changes`) nas tabelas
  `bookings` e `jetskis`. Quando alguém agenda/cancela, todos os outros usuários com o
  app aberto veem a mudança na hora, sem precisar fechar e abrir.
- **Permissões no backend**: além de esconder botões no frontend, todas as regras
  (quem pode criar jet ski, quem pode cancelar reserva de outra pessoa, etc.) estão
  implementadas via Row Level Security (RLS) e triggers no `sql/schema.sql` — um
  usuário comum não consegue burlar isso mesmo chamando a API diretamente.
- **Offline**: o Service Worker cacheia só a interface (HTML/CSS/JS), nunca dados de
  agenda. Sem internet, o app mostra "Sem conexão" e bloqueia novos agendamentos —
  nunca cria reserva offline que possa gerar conflito depois.

## Stack usada

- **Frontend**: HTML + CSS + JavaScript puro (sem build step), PWA com
  `manifest.json` e Service Worker. Fácil de hospedar em qualquer lugar estático
  (Vercel, Netlify, GitHub Pages, ou o próprio Supabase Hosting/Storage).
- **Backend/banco**: [Supabase](https://supabase.com) (Postgres + Auth + Realtime +
  Storage), plano gratuito é suficiente para 10 usuários.
- **Autenticação**: login anônimo do Supabase (cada aparelho recebe uma identidade
  estável) + tabela `profiles` com o nome — sem senha, como pede o briefing, mas ainda
  assim com permissões reais no backend.

---

## 1. Criar e configurar o banco (Supabase)

1. Crie uma conta grátis em https://supabase.com e um novo projeto.
2. Vá em **Authentication → Providers** e confirme que **Anonymous Sign-ins** está
   habilitado (em projetos novos já vem habilitado; se não, ative).
3. Vá em **SQL Editor**, cole todo o conteúdo do arquivo [`sql/schema.sql`](sql/schema.sql)
   deste projeto e clique em **Run**. Isso cria as tabelas, os índices de proteção
   contra reservas duplicadas, as políticas de permissão (RLS) e o bucket de fotos.
4. Vá em **Project Settings → API** e copie:
   - **Project URL**
   - **anon public key**

## 2. Configurar o app com as credenciais do seu banco

Abra `js/config.js` e substitua:

```js
export const SUPABASE_URL = "https://SEU-PROJETO.supabase.co";
export const SUPABASE_ANON_KEY = "SUA-CHAVE-ANON-PUBLICA";
```

A chave `anon` é segura para deixar pública — todo o controle de acesso real está nas
regras (RLS) que você já criou no passo 1.

## 3. Testar localmente

Como o app usa módulos JavaScript (`type="module"`), abra por um servidor local, não
direto pelo `file://`. Duas opções simples:

```bash
# opção 1: Python
cd jetski-pwa
python3 -m http.server 8080

# opção 2: Node
npx serve jetski-pwa
```

Depois acesse `http://localhost:8080` no navegador.

## 4. Criar o primeiro administrador

1. Abra o app e cadastre-se normalmente (digite seu nome na tela de boas-vindas).
2. No Supabase, vá em **SQL Editor** e rode (trocando pelo seu nome exato):

```sql
update profiles set is_admin = true where name = 'Seu Nome';
```

3. Recarregue o app. Na aba **Perfil**, o **Painel do administrador** vai aparecer.

## 5. Cadastrar os primeiros proprietários

Cada proprietário só precisa:
1. Abrir o mesmo link do PWA no próprio celular/computador.
2. Digitar o nome na tela de boas-vindas e tocar em "Salvar e entrar".

Isso já cria o cadastro dele. O sistema aceita no máximo 10 proprietários (a 11ª
tentativa de cadastro é bloqueada com uma mensagem).

## 6. Cadastrar os jet skis

Como administrador, vá em **Perfil → Painel do administrador → Jet skis → + Novo jet
ski**, defina nome, proprietário e status, e opcionalmente já envie uma foto (pode
adicionar/trocar a foto depois também).

## 7. Configurar o armazenamento das fotos

Já está pronto: o passo 1 (`sql/schema.sql`) cria o bucket `jetski-photos` público no
Supabase Storage e as permissões para qualquer proprietário autenticado enviar ou
trocar a foto de um jet ski. Nenhuma configuração extra é necessária.

## 8. Configurar horário de funcionamento

Em **Perfil → Painel do administrador → Horário de funcionamento**, defina o horário
de abertura, fechamento e a duração padrão de cada horário (ex.: 1 hora). O app gera
os horários da agenda automaticamente a partir dessa configuração.

## 9. Publicar o PWA

Qualquer hospedagem de site estático funciona. Sugestões simples e gratuitas:

**Vercel / Netlify (arrastar e soltar a pasta)**
1. Crie uma conta gratuita.
2. Arraste a pasta `jetski-pwa` (com `js/config.js` já preenchido) para o painel.
3. Copie o link gerado (ex.: `https://sua-agenda.vercel.app`) e compartilhe com os
   proprietários.

**GitHub Pages**
1. Suba os arquivos deste projeto para um repositório no GitHub.
2. Vá em **Settings → Pages** e aponte para a branch/pasta do projeto.

Depois de publicado, qualquer proprietário pode "Adicionar à Tela de Início" (iPhone)
ou "Instalar app" (Android/Chrome) para usar como um aplicativo nativo.

## 10. Como atualizar o sistema

- **Mudanças de interface/lógica**: edite os arquivos em `js/`, `css/` ou
  `index.html` e publique novamente (novo deploy). O Service Worker troca a versão do
  cache automaticamente a cada novo deploy (os usuários recebem a atualização na
  próxima vez que abrirem o app com internet).
- **Mudanças no banco**: edite/adicione comandos SQL e rode no **SQL Editor** do
  Supabase. Nunca apague a constraint `no_overlapping_bookings` — ela é a proteção
  contra reservas duplicadas.

---

## Estrutura do projeto

```
jetski-pwa/
├── index.html          # Estrutura de todas as telas
├── manifest.json        # Configuração do PWA (ícones, nome, cores)
├── sw.js                 # Service worker (cache do app, nunca da agenda)
├── offline.html          # Tela mostrada quando não há internet
├── css/style.css         # Todo o visual (tema praia/mar)
├── js/
│   ├── config.js          # Credenciais do Supabase (preencher)
│   ├── supabaseClient.js  # Conexão + login anônimo
│   ├── state.js            # Estado do app + utilitários de data/horário
│   ├── api.js               # Todas as chamadas ao banco (perfis, jet skis, reservas)
│   ├── ui.js                 # Funções de renderização (HTML dinâmico)
│   └── app.js                 # Navegação, eventos, tempo real
├── sql/schema.sql        # Tabelas, RLS, constraint anti-conflito, storage
└── icons/                 # Ícones do PWA (gerados; troque pelos seus se quiser)
```

## Checklist de testes (equivalente à seção 32 do briefing)

Depois de configurar, valide manualmente:

- [ ] Cadastro do 1º ao 10º proprietário (o 11º deve ser bloqueado)
- [ ] Cadastro de jet ski, associação a um proprietário, envio e troca de foto
- [ ] Edição do próprio nome
- [ ] Criar uma reserva e ver ela aparecer em outro navegador/aparelho aberto ao mesmo
      tempo (tempo real)
- [ ] Tentar reservar o mesmo horário, um horário parcialmente sobreposto, e os
      horários imediatamente antes/depois de uma reserva existente
- [ ] Dois dispositivos tentando reservar o mesmo horário ao mesmo tempo — só um deve
      ganhar
- [ ] Cancelar uma reserva e ver o horário voltar a ficar disponível para todos
- [ ] Marcar um jet ski como indisponível e confirmar que não é possível reservá-lo
- [ ] Bloquear um horário manualmente (manutenção) pelo painel do administrador
- [ ] Confirmar que um usuário comum não vê/usa as ações administrativas
- [ ] Instalar o PWA na tela inicial do iPhone e do Android
- [ ] Abrir sem internet e confirmar que a mensagem de "sem conexão" aparece ao tentar
      agendar

## Sobre os ícones

Os ícones em `icons/` foram gerados automaticamente com um visual simples (onda +
jet ski). Troque pelos arquivos do seu clube/marca quando quiser — basta manter os
mesmos nomes de arquivo e tamanhos (192×192, 512×512, mais as versões "maskable" e o
`apple-touch-icon.png` de 180×180).
