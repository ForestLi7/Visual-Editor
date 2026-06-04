import type { MediaKind } from '@ve/core';
import { appUrl } from '../utils/appBase';

export function acceptMimeForMedia(kind: MediaKind): string {
  switch (kind) {
    case 'image':
      return 'image/*';
    case 'audio':
      return 'audio/*';
    case 'video':
      return 'video/*';
    default:
      return '*/*';
  }
}

interface UploadApiResponse {
  ok: boolean;
  url?: string;
  error?: string;
}

/** 经本地开发服务代理上传到 OSS，返回 CDN URL */
export async function uploadFileToOss(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);

  const res = await fetch(appUrl('/api/upload/oss'), {
    method: 'POST',
    body: form,
  });

  const json = (await res.json()) as UploadApiResponse;
  if (!res.ok || !json.ok || !json.url) {
    throw new Error(json.error ?? `上传失败（${res.status}）`);
  }
  return json.url;
}
