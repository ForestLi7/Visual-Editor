import { useRef, useState } from 'react';
import type { MediaFieldSchema, MediaKind, SelectedNode } from '@ve/core';
import { applyMedia } from '../../bridge/iframeBridge';
import { useEditorStore } from '../../store/editorStore';
import { acceptMimeForMedia, uploadFileToOss } from '../../services/ossUpload';
import './MediaPanel.css';

function fieldAccept(kind: MediaKind, name: string): string {
  if (name === 'poster') return 'image/*';
  return acceptMimeForMedia(kind);
}

function MediaFieldRow({
  field,
  kind,
  nodeId,
  meta,
}: {
  field: MediaFieldSchema;
  kind: MediaKind;
  nodeId: string;
  meta: SelectedNode;
}) {
  const pushMediaChange = useEditorStore((s) => s.pushMediaChange);
  const updateSelectedMediaField = useEditorStore((s) => s.updateSelectedMediaField);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commit = (next: string) => {
    const prev = field.value;
    if (next === prev) return;
    applyMedia(nodeId, { [field.name]: next });
    pushMediaChange(nodeId, field.name, next, prev, meta);
    updateSelectedMediaField(field.name, next);
  };

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadFileToOss(file);
      commit(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const showUpload = field.name === 'src' || field.name === 'poster';

  return (
    <label className="field media-panel__field">
      {field.label}
      {field.name === 'src' && kind === 'image' && field.value && (
        <div className="media-panel__preview">
          <img src={field.value} alt="" />
        </div>
      )}
      <input
        type="text"
        className="media-panel__url"
        defaultValue={field.value}
        key={`${nodeId}-${field.name}-${field.value}`}
        placeholder="https://..."
        onBlur={(e) => commit(e.target.value.trim())}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit(e.currentTarget.value.trim());
            e.currentTarget.blur();
          }
        }}
      />
      {showUpload && (
        <div className="media-panel__upload-row">
          <input
            ref={fileRef}
            type="file"
            accept={fieldAccept(kind, field.name)}
            className="media-panel__file"
            onChange={(e) => void onUpload(e.target.files?.[0])}
          />
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? '上传中…' : '上传替换'}
          </button>
        </div>
      )}
      {error && <p className="media-panel__error">{error}</p>}
    </label>
  );
}

export function MediaPanel({ selected }: { selected: SelectedNode }) {
  if (!selected.mediaKind || !selected.mediaFields?.length) return null;

  const srcField = selected.mediaFields.find((f) => f.name === 'src');

  return (
    <section className="sidebar-section media-panel">
      <h3>媒体</h3>
      <p className="media-panel__hint">
        {selected.mediaKind === 'image' && '修改图片地址或上传新图，画布即时预览。'}
        {selected.mediaKind === 'audio' && '修改音频地址或上传新文件。'}
        {selected.mediaKind === 'video' && '修改视频地址、封面或上传新文件。'}
      </p>
      {selected.mediaFields.map((field) => (
        <MediaFieldRow
          key={field.name}
          field={field}
          kind={selected.mediaKind!}
          nodeId={selected.id}
          meta={selected}
        />
      ))}
      {selected.mediaKind === 'audio' && srcField?.value && (
        <audio className="media-panel__player" controls src={srcField.value} />
      )}
      {selected.mediaKind === 'video' && srcField?.value && (
        <video className="media-panel__player" controls src={srcField.value} poster={selected.mediaFields.find((f) => f.name === 'poster')?.value} />
      )}
    </section>
  );
}
