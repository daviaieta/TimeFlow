import { createBookingForBusiness, CreateBookingInput } from "./bookingService";

export const internalBookingService = {
  createBooking(businessId: number, input: CreateBookingInput, now: Date) {
    return createBookingForBusiness(businessId, input, now, "INTERNAL").then((result) => ({
      id: result.booking.id,
      clientName: result.clientName,
      clientPhone: result.booking.clientPhone,
      clientEmail: result.booking.clientEmail,
      service: { id: result.service.id, name: result.service.name },
      employeeName: result.employeeName,
      date: result.slot.date.toISOString(),
      startTime: result.slot.startTime,
    }));
  },
};
