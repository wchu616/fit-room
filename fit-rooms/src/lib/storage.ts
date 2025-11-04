import { createSupabaseServiceRoleClient } from "@/lib/supabase";
import { randomUUID } from "crypto";

const CHECKINS_BUCKET = "checkins";

function stripBucketPrefix(path: string) {
  return path.startsWith(`${CHECKINS_BUCKET}/`) ? path.slice(CHECKINS_BUCKET.length + 1) : path;
}

export type UploadCheckinParams = {
  roomId: string;
  userId: string;
  file: File;
};

export async function uploadCheckinImage({ roomId, userId, file }: UploadCheckinParams) {
  const supabase = createSupabaseServiceRoleClient();

  const today = new Date().toISOString().slice(0, 10);
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const objectName = `${CHECKINS_BUCKET}/${roomId}/${userId}/${today}-${randomUUID()}.${extension}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error } = await supabase.storage.from(CHECKINS_BUCKET).upload(stripBucketPrefix(objectName), buffer, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });

  if (error) {
    throw new Error(error.message ?? "上传失败");
  }

  return {
    path: objectName,
  };
}

export async function createCheckinSignedUrl(path: string, expiresInSeconds = 60 * 60) {
  if (!path) {
    return null;
  }

  const supabase = createSupabaseServiceRoleClient();
  const normalizedPath = stripBucketPrefix(path);

  const { data, error } = await supabase.storage.from(CHECKINS_BUCKET).createSignedUrl(normalizedPath, expiresInSeconds);

  if (error) {
    throw new Error("生成照片访问链接失败");
  }

  return data?.signedUrl ?? null;
}
