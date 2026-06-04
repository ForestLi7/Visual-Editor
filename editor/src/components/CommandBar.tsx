import { useState } from 'react';
import { parseNaturalLanguage, NLP_PLACEHOLDER, NLP_CAPABILITIES } from '@ve/nlp';
import { useEditorStore } from '../store/editorStore';
import { applyStyle, applyText } from '../bridge/iframeBridge';
import config from '../../../.visualeditorrc.json';
import './CommandBar.css';

const HELP_TITLE = [
  '【样式】',
  ...NLP_CAPABILITIES.style,
  '',
  '【文字】',
  ...NLP_CAPABILITIES.text,
].join('\n');

const QUICK_CHIPS = ['变大', '变小', '加粗', '主色', '圆角', '居中', '文字改成…'] as const;

export function CommandBar() {
  const [prompt, setPrompt] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const selected = useEditorStore((s) => s.selected);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const pushStyleChange = useEditorStore((s) => s.pushStyleChange);
  const pushTextChange = useEditorStore((s) => s.pushTextChange);
  const updateSelectedText = useEditorStore((s) => s.updateSelectedText);

  const targets = selectedIds.length > 0 ? selectedIds : selected ? [selected.id] : [];

  const run = () => {
    if (!targets.length) {
      setFeedback('请先选中至少一个元素');
      return;
    }
    const meta = selected ?? { id: targets[0], tag: '', path: '', styles: {} };
    const result = parseNaturalLanguage(prompt, {
      tokens: config.tokens as Record<string, string>,
      currentStyles: selected?.styles,
      currentText: selected?.textContent,
    });

    if (result.intents.length === 0 && !result.textIntent) {
      setFeedback(result.warnings[0] ?? '无法解析');
      return;
    }

    if (result.textIntent) {
      if (selected && !selected.textEditable && targets.length === 1) {
        setFeedback('当前元素含子标签，无法直接改文字，请选纯文本节点或双击画布编辑');
        if (result.intents.length === 0) return;
      } else {
        targets.forEach((nodeId) => {
          const prev = selected?.textContent ?? '';
          let next = result.textIntent!.text;
          if (result.textIntent!.action === 'append') {
            next = prev + result.textIntent!.text;
          } else if (result.textIntent!.action === 'prepend') {
            next = result.textIntent!.text + prev;
          }
          applyText(nodeId, next);
          pushTextChange(nodeId, next, prev, selected ?? meta);
        });
        if (targets.length === 1 && selected) {
          const ti = result.textIntent!;
          const next =
            ti.action === 'append'
              ? (selected.textContent ?? '') + ti.text
              : ti.action === 'prepend'
                ? ti.text + (selected.textContent ?? '')
                : ti.text;
          updateSelectedText(next);
        }
      }
    }

    result.intents.forEach((intent) => {
      targets.forEach((nodeId) => {
        applyStyle(nodeId, { [intent.cssProperty]: intent.value });
        pushStyleChange(nodeId, intent.cssProperty, intent.value, selected ?? meta);
      });
    });

    const styleCount = result.intents.length;
    const textNote = result.textIntent ? '含文字' : '';
    setFeedback(
      `已应用${textNote}${styleCount > 0 ? ` ${styleCount} 项样式` : ''} × ${targets.length} 个元素：${result.summary}`
    );
    setPrompt('');
  };

  const appendChip = (text: string) => {
    setPrompt((p) => (p ? `${p} ${text}` : text));
    setFeedback(null);
  };

  return (
    <div className="command-bar-wrap">
      <div className="command-bar">
      <input
        type="text"
        className="command-bar__input"
        placeholder={targets.length ? NLP_PLACEHOLDER : '选中元素后输入自然语言指令'}
        title={HELP_TITLE}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && run()}
        disabled={!targets.length}
      />
      <button type="button" className="btn btn--sm btn--primary" onClick={run} disabled={!targets.length}>
        执行
      </button>
      {targets.length > 1 && (
        <span className="command-bar__multi">×{targets.length}</span>
      )}
      {feedback && <span className="command-bar__feedback">{feedback}</span>}
      </div>
      <div className="command-bar__chips">
        {QUICK_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            className="command-bar__chip"
            disabled={!targets.length}
            onClick={() => appendChip(chip)}
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}
