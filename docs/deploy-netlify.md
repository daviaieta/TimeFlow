# Deploy do front na Netlify

A API e o Postgres ficam no Railway. Só o `web/` vai para a Netlify.

Por que Netlify e não Vercel: o plano Hobby da Vercel proíbe uso comercial, e
isso vale mesmo com o cliente usando de graça — a regra olha para o que o site
é, não para o que ele cobra. O plano gratuito da Netlify permite uso comercial
dentro dos limites (100 GB de banda e 300 minutos de build por mês); o que ele
não permite é revender a hospedagem.

## 1. Criar o site

1. Netlify → **Add new site** → **Import an existing project** → GitHub →
   `daviaieta/TimeFlow`.
2. Não mexa em build command nem publish directory na UI: o `netlify.toml` da
   raiz já define tudo. Duas linhas de lá não são opcionais, e as duas custaram
   um deploy 404 cada até serem descobertas:
   - `publish = ".next"` — o caminho é relativo ao `base`, por isso `.next` e
     não `web/.next`. Sem a linha, o default publica o próprio `base`, ou seja
     o código-fonte de `web/`, e toda rota responde 404.
   - `[[plugins]] package = "@netlify/plugin-nextjs"` — a Netlify instala esse
     adaptador sozinha *quando detecta Next.js*, mas a detecção do build
     procura `package.json` na raiz do repositório, e esta raiz não tem
     nenhum. Sem o adaptador o `.next` é servido como arquivo estático.
3. Branch de produção: `main`.

## 2. Variáveis de ambiente (Netlify → Site configuration → Environment variables)

| Variável | Valor |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | URL pública da API no Railway, sem barra no fim |

É a única. `NEXT_PUBLIC_*` é embutida no bundle **no build**: trocar o valor
exige um novo deploy, não basta salvar a variável.

## 3. Ajustar a API no Railway

Depois que a Netlify devolver o domínio do site:

| Variável | O que fazer |
| --- | --- |
| `WEB_ORIGIN` | Colocar o domínio da Netlify. Aceita lista separada por vírgula, e **a primeira da lista é a que vai nos links de convite por e-mail** — quando existir domínio próprio, ele tem que ser o primeiro. |
| `BILLING_ENABLED` | `false` durante o mês de cortesia do primeiro cliente. Tirar (ou `true`) quando a cobrança entrar. |

Sem o domínio da Netlify em `WEB_ORIGIN`, o navegador barra toda chamada à API
por CORS e a tela fica em branco sem erro visível no servidor.

## Armazenamento de imagens (Cloudflare R2)

As fotos não podem ficar no disco do container: o Railway o recria a cada
deploy e as imagens sumiriam sem nenhum erro no log.

1. Cloudflare → R2 → **Create bucket**. Nome: `timeflow`.
2. No bucket → **Settings** → **Public access** → habilitar o domínio
   `r2.dev` (ou ligar um domínio próprio, se houver). A URL que aparece é o
   valor de `R2_PUBLIC_URL`.
3. R2 → **Manage API tokens** → **Create API token**, permissão *Object Read &
   Write*, escopo só neste bucket. Ele mostra `Access Key ID` e
   `Secret Access Key` uma única vez.
4. Railway → variáveis do serviço da API:

| Variável | Valor |
| --- | --- |
| `R2_ACCOUNT_ID` | ID da conta Cloudflare (aparece na URL do painel do R2) |
| `R2_ACCESS_KEY_ID` | do token criado no passo 3 |
| `R2_SECRET_ACCESS_KEY` | do token criado no passo 3 |
| `R2_BUCKET` | `timeflow` |
| `R2_PUBLIC_URL` | URL pública do passo 2, sem barra no fim |

É tudo ou nada: com algumas dessas variáveis e não todas, a API recusa subir
com a mensagem dizendo quais faltam. Sem nenhuma, ela grava em disco — o que
só serve para desenvolvimento.

## 4. Conferir depois do primeiro deploy

Dá para diagnosticar quase tudo de fora, sem abrir o painel:

```sh
SITE=https://timeflowbr.netlify.app
API=https://api-production-a0ea.up.railway.app

# 200 na raiz e 404 em /BUILD_ID é o esperado. /BUILD_ID respondendo 200
# significa que o adaptador do Next não rodou e o .next virou site estático.
curl -s -o /dev/null -w "%{http_code}\n" $SITE/
curl -s -o /dev/null -w "%{http_code}\n" $SITE/BUILD_ID

# Sem `access-control-allow-origin` na resposta, a origem não está em
# WEB_ORIGIN e o navegador vai bloquear toda chamada à API.
curl -s -D- -o /dev/null -H "Origin: $SITE" $API/health | grep -i access-control

# Qual URL de API foi embutida no bundle. Se aparecer localhost, a variável
# NEXT_PUBLIC_API_URL não estava setada na hora do build.
curl -s $SITE/login | grep -oE '/_next/static/chunks/[a-zA-Z0-9._-]+\.js' | sort -u |
  while read c; do curl -s "$SITE$c"; done | grep -o 'localhost:3333' | head -1
```

Depois, no navegador:

- `/` carrega a landing.
- `/login` autentica e cai no painel — prova que o CORS está certo.
- `/{slug}` mostra a vitrine pública do negócio.
- Painel aberto no celular: a navegação inferior aparece e não cobre conteúdo.

## Quando a cobrança entrar

`WEB_ORIGIN` precisa ser o domínio final antes de ligar `BILLING_ENABLED`: as
URLs de retorno do checkout do Stripe são montadas a partir dele, e um domínio
de preview manda o cliente pago de volta para o lugar errado.
