import { FastifyReply, FastifyRequest } from "fastify";
import { requireBusinessId } from "../lib/requireBusinessId";
import { crmService, NoteApi } from "../services/crmService";
import { NotFoundError, BadRequestError, ForbiddenError } from "../lib/errors";

export interface NoteParams {
  publicId: string;
  id: string; // note id as string, but we'll convert to number
}

export interface CreateNoteBody {
  body: string;
}

export async function getNotes(
  request: FastifyRequest<{ Params: NoteParams }>,
  reply: FastifyReply
): Promise<void> {
  const businessId = requireBusinessId(request);
  const { publicId } = request.params;

  const notes = await crmService.listNotes(businessId, publicId);
  reply.send({ notes });
}

export async function createNote(
  request: FastifyRequest<{ Params: NoteParams; Body: CreateNoteBody }>,
  reply: FastifyReply
): Promise<void> {
  const businessId = requireBusinessId(request);
  const { publicId } = request.params;
  const { body } = request.body;

  if (!body || body.trim() === "") {
    throw new BadRequestError("Note body cannot be empty");
  }

  const userId = request.user.sub as number; // assuming sub is the user ID
  const note = await crmService.createNote(businessId, publicId, userId, body);
  reply.status(201).send({ note });
}

export async function updateNote(
  request: FastifyRequest<{
    Params: NoteParams;
    Body: { body: string };
  }>,
  reply: FastifyReply
): Promise<void> {
  const businessId = requireBusinessId(request);
  const { publicId, id } = request.params;
  const noteId = parseInt(id, 10);
  if (isNaN(noteId)) {
    throw new BadRequestError("Invalid note ID");
  }

  const { body } = request.body;
  if (!body || body.trim() === "") {
    throw new BadRequestError("Note body cannot be empty");
  }

  const userId = request.user.sub as number;
  const userRole = request.user.role as import("@prisma/client").Role;
  const note = await crmService.updateNote(businessId, publicId, noteId, userId, userRole, body);
  reply.send({ note });
}

export async function deleteNote(
  request: FastifyRequest<{ Params: NoteParams }>,
  reply: FastifyReply
): Promise<void> {
  const businessId = requireBusinessId(request);
  const { publicId, id } = request.params;
  const noteId = parseInt(id, 10);
  if (isNaN(noteId)) {
    throw new BadRequestError("Invalid note ID");
  }

  const userId = request.user.sub as number;
  const userRole = request.user.role as import("@prisma/client").Role;
  await crmService.deleteNote(businessId, publicId, noteId, userId, userRole);
  reply.send({ success: true });
}