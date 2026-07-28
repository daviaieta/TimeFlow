// Desliga a cobrança ANTES de `config/env` ser avaliado — o módulo lê
// process.env uma vez, no import, então trocar a variável dentro do teste não
// teria efeito nenhum. Importar este arquivo antes de `../app` é o que faz a
// flag valer.
process.env.BILLING_ENABLED = "false";
