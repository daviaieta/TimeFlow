// Liga o CRM ANTES de `config/env` ser avaliado — o módulo lê process.env uma
// vez, no import, então trocar a variável dentro do teste não teria efeito.
// Importar este arquivo antes de `../app` é o que faz a flag valer.
//
// Espelho de disableBilling.ts, e no sentido oposto de propósito: o default do
// CRM é desligado, então quem quer o comportamento novo pede por ele. Os
// arquivos de teste que NÃO importam isto exercitam o caminho de sempre, o que
// é exatamente a garantia de compatibilidade que a fase 2 precisa manter.
process.env.CRM_ENABLED = "true";
