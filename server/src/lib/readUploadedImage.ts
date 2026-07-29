import { FastifyRequest } from "fastify";
import { BadRequestError } from "./errors";

// Compartilhado entre businessController e employeeController: os dois
// controllers não importam um do outro, mas ambos precisam do mesmo
// contrato de leitura de upload — então a função mora aqui, não em nenhum
// dos dois.
export async function readUploadedImage(request: FastifyRequest): Promise<Buffer> {
  const file = await request.file();
  if (!file) {
    throw new BadRequestError('Envie a imagem no campo "file".');
  }

  try {
    // O plugin corta o stream em MAX_IMAGE_BYTES e toBuffer lança antes de
    // devolver qualquer conteúdo — nunca chega a existir um Buffer maior
    // que o limite para checar depois.
    return await file.toBuffer();
  } catch (error) {
    if ((error as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE") {
      throw new BadRequestError("A imagem precisa ter no máximo 2 MB.");
    }

    throw error;
  }
}
