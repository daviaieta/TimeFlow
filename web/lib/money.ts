// `<input type="number">` recusa vírgula: no teclado pt-BR do celular, quem
// digita "45,90" vê o campo ficar vazio sem nenhuma mensagem, e o formulário
// vai com o preço errado. Daí o campo virar texto e a conversão vir para cá.

const CENTS = /^\d+(?:[.,]\d{1,2})?$/;

// Devolve null em vez de NaN: quem chama tem que decidir o que dizer ao
// usuário, e NaN silenciosamente vira 0 em qualquer soma.
export function parsePrice(input: string): number | null {
  const trimmed = input.trim();
  if (!CENTS.test(trimmed)) return null;

  return Number(trimmed.replace(",", "."));
}

// Caminho inverso, para abrir o formulário de edição com o valor que a API
// devolve ("45.00") no formato que o usuário reconhece ("45,00").
export function formatPriceInput(price: string): string {
  return price.replace(".", ",");
}
