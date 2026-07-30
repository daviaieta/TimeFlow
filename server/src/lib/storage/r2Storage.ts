import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { StorageConfig } from "./storageConfig";
import { ObjectStorage } from "./types";

type R2Config = Extract<StorageConfig, { mode: "r2" }>;

export function createR2Storage(config: R2Config): ObjectStorage {
  const client = new S3Client({
    // O R2 não tem regiões no sentido da AWS, mas o SDK exige o campo.
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return {
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          // A key já carrega um sufixo aleatório novo a cada troca, então o
          // objeto nunca é sobrescrito: cache longo é seguro.
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
    },

    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },

    publicUrl(key) {
      return `${config.publicUrl}/${key}`;
    },
  };
}
