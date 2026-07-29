# Upload de imagens: logo e banner do negócio, avatar de colaborador

Data: 2026-07-29

## Problema

O produto não tem imagem nenhuma. A página pública `/{slug}` mostra o nome do
negócio em texto e a equipe com iniciais em círculo; o dashboard idem. Um
negócio de serviço vende aparência — a vitrine sem foto do lugar e sem rosto do
profissional é a vitrine de um concorrente.

Falta o mais básico: dono sobe a logo e um banner do estabelecimento,
colaborador ganha uma foto.

## Escopo

Três imagens, cada uma opcional:

| Imagem | Dono | Onde aparece |
| --- | --- | --- |
| Logo | `Business` | vitrine pública, header do dashboard |
| Banner | `Business` | topo da vitrine pública |
| Avatar | `User` | seleção de profissional na reserva, equipe pública, tabela de equipe, perfil |

Fora de escopo: galeria de fotos do estabelecimento, imagem por serviço, corte
manual (crop) pelo usuário, CDN próprio com transformação sob demanda.

## Modelo de dados

```prisma
model Business {
  logoKey   String?
  bannerKey String?
}

model User {
  avatarKey String?
}
```

Nullable porque todo registro existente nasce sem imagem, e ter imagem nunca
vira obrigação.

**Guarda-se a key do objeto, não a URL.** A URL pública é `R2_PUBLIC_URL + "/" +
key`, montada na camada de service, e sai pronta no JSON como `logoUrl`,
`bannerUrl` e `avatarUrl`. Trocar de bucket, de domínio ou de provedor vira uma
variável de ambiente em vez de um UPDATE em massa, e o front nunca concatena
URL — ele recebe uma pronta ou `null`.

## Armazenamento

Cloudflare R2: free tier de 10 GB e egress zero, API S3-compatível. O arquivo
sobe pelo servidor (não direto do browser): o servidor é o único lugar que pode
validar o conteúdo antes de gravar, e as imagens aqui são pequenas.

A escolha fica atrás de uma interface, em `server/src/lib/storage/`:

```ts
export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;
}
```

Duas implementações:

- **`r2Storage.ts`** — `@aws-sdk/client-s3` apontado para o endpoint do R2.
  Usada quando as credenciais existem.
- **`diskStorage.ts`** — grava em `server/uploads/`, servido por
  `@fastify/static` na rota `/uploads`. Usada em desenvolvimento, sem conta
  Cloudflare. O `publicUrl` dela devolve a própria URL da API mais
  `/uploads/{key}`, então `R2_PUBLIC_URL` não é necessária em desenvolvimento.

A seleção é por presença de credencial, o mesmo padrão já usado no mailer (sem
`RESEND_API_KEY` ele cai em modo console). `server/uploads/` entra no
`.gitignore`.

Variáveis novas, todas opcionais em desenvolvimento:

```
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
R2_PUBLIC_URL
```

Em produção elas andam juntas: se alguma existir e as outras não, o servidor
falha ao subir em vez de silenciosamente gravar em disco efêmero — o container
do Railway perde o disco a cada deploy, e a falha ficaria invisível até o
primeiro redeploy apagar as fotos de todo mundo.

## Rotas

```
POST   /businesses/:id/logo       ADMIN do próprio negócio
DELETE /businesses/:id/logo       ADMIN do próprio negócio
POST   /businesses/:id/banner     ADMIN do próprio negócio
DELETE /businesses/:id/banner     ADMIN do próprio negócio
POST   /employees/:id/avatar      ADMIN do mesmo negócio, ou o próprio EMPLOYEE
DELETE /employees/:id/avatar      ADMIN do mesmo negócio, ou o próprio EMPLOYEE
```

Rotas por recurso em vez de um `/uploads` genérico: a autorização já mora no
recurso, e um endpoint genérico precisaria reinventar "quem pode escrever
neste alvo" no corpo da requisição.

Corpo em `multipart/form-data` via `@fastify/multipart`, um campo `file`,
limite de 2 MB configurado no plugin — o limite do plugin corta o stream, então
um arquivo grande nunca chega a virar Buffer na memória.

A regra de "ADMIN do mesmo negócio ou o próprio" não cabe em `authorize()`, que
só olha papel. Ela vira uma checagem no service do avatar: carrega o alvo,
compara `businessId` com o do token e, quando o papel é `EMPLOYEE`, exige
`targetId === user.id`. Falha vira `ForbiddenError`.

Todas as rotas respondem com o recurso atualizado, incluindo a URL nova — a tela
troca a imagem com a resposta, sem refetch.

## Validação

Parte pura em `server/src/services/imageRules.ts`, no padrão `*Rules.ts` que os
testes cobrem:

- **Tipo por magic bytes, não por `Content-Type`.** O header vem do cliente e
  mente. Aceitos: JPEG (`FF D8 FF`), PNG (`89 50 4E 47 0D 0A 1A 0A`) e WebP
  (`RIFF` nos bytes 0–3 e `WEBP` nos 8–11). Qualquer outra assinatura é
  rejeitada com `ValidationError`.
- **Tamanho.** Limite de 2 MB, checado também aqui e não só no plugin: a regra
  pura é o que o teste consegue exercitar.
- **Montagem da key.** `businesses/{businessId}/logo-{random}.{ext}`,
  `businesses/{businessId}/banner-{random}.{ext}`,
  `employees/{userId}/avatar-{random}.{ext}`. A extensão vem do tipo detectado
  nos magic bytes, não do nome que o cliente enviou — na prática quase sempre
  `.webp`, porque o cliente converte antes de subir, mas o servidor não confia
  nisso. O sufixo aleatório serve a duas
  coisas: impede adivinhar a imagem de outro negócio pela URL e garante que a
  troca de imagem não seja servida do cache com a foto antiga.

Trocar ou remover uma imagem apaga o objeto anterior em best-effort: uma falha
no `delete` é logada e não derruba a requisição. Objeto órfão no bucket custa
centavos; upload perdido custa a confiança do usuário.

## Redimensionamento no cliente

O browser converte a imagem para WebP num `<canvas>` antes de subir:

| Imagem | Dimensão | Ajuste |
| --- | --- | --- |
| Logo | 512×512 | cover |
| Avatar | 400×400 | cover |
| Banner | 1600×600 | cover |

Assim o servidor não precisa de `sharp` — binário nativo, mais uma peça para
quebrar no build do Railway — e a banda de upload cai de vários MB para dezenas
de KB. A conta de fit/cover (calcular a área de origem que preenche o destino
sem distorcer) vai para `web/lib/image.ts`, pura e com teste em `node:test`; o
canvas fica no componente, onde não há o que testar em Node.

O servidor continua validando tamanho e assinatura: o redimensionamento é uma
conveniência do cliente, não uma garantia.

## Front

Um componente `ImageUploadField` (preview, botão de trocar, botão de remover,
estado de envio e erro), reusado em:

- `dashboard/settings/business-card` — logo e banner
- `dashboard/settings/profile-card` — o colaborador trocando o próprio avatar
- `dashboard/team/employee-card` — o dono trocando o avatar de qualquer um
- vitrine pública: `showcase-hero` (banner e logo), `team-section` e
  `employee-picker` (avatar)
- `dashboard/layout` — logo no header

Sem imagem, cada lugar cai no fallback de iniciais que a UI já usa hoje. Nenhuma
tela ganha estado vazio novo.

## Testes

- `imageRules.test.ts` — assinatura reconhecida por tipo, assinatura recusada
  (arquivo de texto renomeado para `.jpg`), limite de tamanho, formato da key.
- `image.test.ts` no web — matemática de cover para origem mais larga, mais
  alta e já na proporção certa.
- Integração — upload em uma rota com um `ObjectStorage` falso: grava a key,
  responde a URL, e o ADMIN de outro negócio recebe 403.

## Erros

| Situação | Resposta |
| --- | --- |
| Arquivo não é imagem aceita | 400 `ValidationError` |
| Arquivo acima de 2 MB | 400 `ValidationError` |
| Alvo de outro negócio, ou EMPLOYEE mexendo em avatar alheio | 403 `ForbiddenError` |
| Negócio ou colaborador inexistente | 404 `NotFoundError` |
| Falha ao gravar no bucket | 500, imagem não trocada no banco |

A gravação no banco só acontece depois do `put` no storage. A ordem inversa
deixaria o registro apontando para um objeto que não existe.
