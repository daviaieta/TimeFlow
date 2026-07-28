import assert from "node:assert/strict";
import { test } from "node:test";
import { bookingTimeRange, formatBookingDate } from "./bookingConfirmation";

// As datas de slot são gravadas em UTC à meia-noite. Formatar com fuso local
// deslocaria o dia para trás no Brasil — por isso a leitura é feita em UTC.
test("formatBookingDate mostra dia da semana e data em pt-BR", () => {
  assert.equal(
    formatBookingDate(new Date("2026-08-03T00:00:00.000Z")),
    "segunda-feira, 03/08/2026",
  );
});

test("bookingTimeRange soma a duração ao início", () => {
  assert.equal(bookingTimeRange("14:00", 45), "14:00 às 14:45");
  assert.equal(bookingTimeRange("23:30", 45), "23:30 às 00:15");
});
