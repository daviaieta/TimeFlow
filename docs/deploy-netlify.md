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
   raiz já define `base = "web"` e `publish = ".next"`. O `publish` é relativo
   ao `base` — por isso `.next`, e não `web/.next`. Sem essa linha a Netlify
   publica o código-fonte de `web/` e o site responde 404 em todas as rotas.
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

## 4. Conferir depois do primeiro deploy

- `/` carrega a landing.
- `/login` autentica e cai no painel — prova que o CORS está certo.
- `/{slug}` mostra a vitrine pública do negócio.
- Painel aberto no celular: a navegação inferior aparece e não cobre conteúdo.

## Quando a cobrança entrar

`WEB_ORIGIN` precisa ser o domínio final antes de ligar `BILLING_ENABLED`: as
URLs de retorno do checkout do Stripe são montadas a partir dele, e um domínio
de preview manda o cliente pago de volta para o lugar errado.
