"use client";

import { useParams } from "next/navigation";
import { BookingWizard } from "./booking-wizard";

export default function PublicBookingPage() {
  const params = useParams<{ slug: string }>();

  return <BookingWizard slug={params.slug} />;
}
