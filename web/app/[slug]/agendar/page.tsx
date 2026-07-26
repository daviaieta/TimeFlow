"use client";

import { useParams, useSearchParams } from "next/navigation";
import { parseServiceParam } from "@/lib/showcase";
import { BookingWizard } from "../booking-wizard";

export default function BookingPage() {
  const params = useParams<{ slug: string }>();
  const search = useSearchParams();

  return (
    <BookingWizard
      slug={params.slug}
      initialServiceId={parseServiceParam(search.get("servico"))}
    />
  );
}
