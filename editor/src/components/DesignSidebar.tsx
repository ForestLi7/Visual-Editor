import { useMemo, useState, type ReactNode } from 'react';
import type { SelectedNode } from '@ve/core';
import { useEditorStore } from '../store/editorStore';
import { applyStyle, applyProps, applyText, startTextEdit } from '../bridge/iframeBridge';
import { TokenColorGrid } from './design/TokenColorGrid';
import { SpacingSlider } from './design/SpacingSlider';
import { StyleFieldRow } from './design/StyleFieldRow';
import { StyleValueEditor } from './design/StyleValueEditor';
import { MediaPanel } from './design/MediaPanel';
import { FlexPanel } from './design/FlexPanel';
import { GridPanel } from './design/GridPanel';
import { isFlexDisplay, isGridDisplay } from './design/gridUtils';
import config from '../../../.visualeditorrc.json';
import './DesignSidebar.css';

type SidebarTab = 'design' | 'css';

function toKebab(prop: string): string {
  return prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function toCamel(prop: string): string {
  return prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="sidebar-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function ElementHeader({ selected }: { selected: SelectedNode }) {
  return (
    <header className="design-sidebar__head">
      <div className="design-sidebar__meta">
        <span className="design-sidebar__tag">&lt;{selected.tag}&gt;</span>
        {selected.componentName && (
          <span className="design-sidebar__comp">{selected.componentName}</span>
        )}
      </div>
      <p className="design-sidebar__path" title={selected.path}>
        {selected.path}
      </p>
      <code className="design-sidebar__id">{selected.id}</code>
    </header>
  );
}

function useStyleUpdater(selected: SelectedNode) {
  const pushStyleChange = useEditorStore((s) => s.pushStyleChange);
  const [tokenWarn, setTokenWarn] = useState<string | null>(null);

  const update = (cssProperty: string, value: string) => {
    const isColorField = cssProperty === 'color' || cssProperty === 'backgroundColor';
    if (isColorField && !value.includes('var(--') && !value.startsWith('#')) {
      setTokenWarn('建议使用设计 Token（var(--color-*)）以保持规范');
    } else {
      setTokenWarn(null);
    }
    applyStyle(selected.id, { [cssProperty]: value });
    pushStyleChange(selected.id, cssProperty, value, selected);
  };

  return { update, tokenWarn };
}

function DesignTabPanel({ selected }: { selected: SelectedNode }) {
  const { update, tokenWarn } = useStyleUpdater(selected);
  const pushStyleChange = useEditorStore((s) => s.pushStyleChange);
  const pushPropChange = useEditorStore((s) => s.pushPropChange);
  const pushTextChange = useEditorStore((s) => s.pushTextChange);
  const updateSelectedText = useEditorStore((s) => s.updateSelectedText);
  const tokenMap = config.tokens as Record<string, string>;

  const textTokens = Object.fromEntries(
    Object.entries(tokenMap).filter(([k]) => k.includes('text') || k.includes('primary') || k.includes('secondary') || k.includes('danger') || k.includes('muted'))
  );
  const bgTokens = Object.fromEntries(
    Object.entries(tokenMap).filter(([k]) => k.includes('bg') || k.includes('surface') || k.includes('primary') || k.includes('secondary'))
  );

  const applyColorToken = (property: 'color' | 'backgroundColor', tokenKey: string) => {
    const hex = tokenMap[tokenKey];
    if (!hex) return;
    applyStyle(selected.id, { [property]: hex });
    pushStyleChange(selected.id, property, `var(${tokenKey})`, selected);
  };

  const onProp = (name: string, value: unknown) => {
    applyProps(selected.id, { [name]: value });
    pushPropChange(selected.id, name, value);
  };

  const commitText = (next: string) => {
    const prev = selected.textContent ?? '';
    if (next === prev) return;
    applyText(selected.id, next);
    pushTextChange(selected.id, next, prev, selected);
    updateSelectedText(next);
  };

  return (
    <div className="design-sidebar__panel" key={`design-${selected.id}`}>
      {tokenWarn && <p className="design-sidebar__warn">{tokenWarn}</p>}

      <MediaPanel selected={selected} />

      {selected.textEditable && (
        <Section title="文本">
          <p className="design-sidebar__hint">
            双击画布可直接编辑；含行内 span 的标题可改整段或单独双击 span
          </p>
          <label className="field">
            内容
            <textarea
              className="design-sidebar__textarea"
              rows={3}
              defaultValue={selected.textContent ?? ''}
              onBlur={(e) => commitText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  commitText(e.currentTarget.value);
                  e.currentTarget.blur();
                }
              }}
            />
          </label>
          <button
            type="button"
            className="btn btn--sm btn--ghost design-sidebar__edit-btn"
            onClick={() => startTextEdit(selected.id)}
          >
            在画布上编辑
          </button>
        </Section>
      )}

      <Section title="布局">
        <StyleFieldRow
          label="Display"
          cssKey="display"
          nodeId={selected.id}
          value={selected.styles.display || 'block'}
          onChange={(v) => update('display', v)}
        />
        {!isFlexDisplay(selected.styles.display) && !isGridDisplay(selected.styles.display) && (
          <span className="design-sidebar__hint">将 Display 设为 flex 或 grid 以显示专用面板</span>
        )}
      </Section>

      {isFlexDisplay(selected.styles.display) && (
        <FlexPanel selected={selected} update={update} />
      )}

      {isGridDisplay(selected.styles.display) && (
        <GridPanel selected={selected} update={update} />
      )}

      <Section title="尺寸">
        <div className="field-row">
          <StyleFieldRow
            label="宽"
            cssKey="width"
            nodeId={selected.id}
            value={selected.styles.width}
            onChange={(v) => update('width', v)}
          />
          <StyleFieldRow
            label="高"
            cssKey="height"
            nodeId={selected.id}
            value={selected.styles.height}
            onChange={(v) => update('height', v)}
          />
        </div>
        <SpacingSlider
          key={`pad-${selected.id}-${selected.styles.padding}`}
          label="Padding"
          value={selected.styles.padding}
          max={80}
          onChange={(v) => update('padding', v)}
        />
        <SpacingSlider
          key={`mar-${selected.id}-${selected.styles.margin}`}
          label="Margin"
          value={selected.styles.margin}
          max={80}
          onChange={(v) => update('margin', v)}
        />
      </Section>

      <Section title="颜色">
        <TokenColorGrid tokens={textTokens} label="文字色 Token" onPick={(key) => applyColorToken('color', key)} />
        <TokenColorGrid
          tokens={bgTokens}
          label="背景 Token"
          onPick={(key) => applyColorToken('backgroundColor', key)}
        />
        <div className="design-sidebar__color-fields">
          <StyleFieldRow
            label="文字色"
            cssKey="color"
            nodeId={selected.id}
            value={selected.styles.color}
            onChange={(v) => update('color', v)}
          />
          <StyleFieldRow
            label="背景色"
            cssKey="backgroundColor"
            nodeId={selected.id}
            value={selected.styles.backgroundColor}
            onChange={(v) => update('backgroundColor', v)}
          />
        </div>
      </Section>

      <Section title="外观">
        <StyleFieldRow
          label="圆角"
          cssKey="borderRadius"
          nodeId={selected.id}
          value={selected.styles.borderRadius}
          onChange={(v) => update('borderRadius', v)}
        />
        <StyleFieldRow
          label="不透明度"
          cssKey="opacity"
          nodeId={selected.id}
          value={selected.styles.opacity || '1'}
          onChange={(v) => update('opacity', v)}
        />
        <label className="field">
          阴影强度
          <input
            type="range"
            min={0}
            max={4}
            step={1}
            defaultValue={0}
            onChange={(e) => {
              const n = Number(e.target.value);
              update(
                'boxShadow',
                n === 0 ? 'none' : `0 ${n * 4}px ${n * 8}px rgba(0,0,0,${0.15 + n * 0.08})`
              );
            }}
          />
        </label>
        <StyleFieldRow
          label="字号"
          cssKey="fontSize"
          nodeId={selected.id}
          value={selected.styles.fontSize}
          onChange={(v) => update('fontSize', v)}
        />
        <StyleFieldRow
          label="字重"
          cssKey="fontWeight"
          nodeId={selected.id}
          value={selected.styles.fontWeight}
          onChange={(v) => update('fontWeight', v)}
        />
        <StyleFieldRow
          label="对齐"
          cssKey="textAlign"
          nodeId={selected.id}
          value={selected.styles.textAlign}
          onChange={(v) => update('textAlign', v)}
        />
      </Section>

      {selected.propsSchema && selected.propsSchema.length > 0 && (
        <Section title="Props">
          {selected.propsSchema.map((p) => (
            <label key={p.name} className="field">
              {p.name}
              {p.type === 'boolean' && (
                <input
                  type="checkbox"
                  checked={Boolean(p.value)}
                  onChange={(e) => onProp(p.name, e.target.checked)}
                />
              )}
              {p.type === 'enum' && p.options && (
                <select
                  value={String(p.value)}
                  onChange={(e) => onProp(p.name, e.target.value)}
                >
                  {p.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              )}
              {p.type === 'string' && (
                <input
                  type="text"
                  defaultValue={String(p.value)}
                  onBlur={(e) => onProp(p.name, e.target.value)}
                />
              )}
            </label>
          ))}
        </Section>
      )}
    </div>
  );
}

function CssTabPanel({ selected }: { selected: SelectedNode }) {
  const { update } = useStyleUpdater(selected);
  const [query, setQuery] = useState('');
  const [customProp, setCustomProp] = useState('');
  const [customValue, setCustomValue] = useState('');
  const [localStyles, setLocalStyles] = useState<Record<string, string>>({});

  const mergedStyles = useMemo(
    () => ({ ...selected.styles, ...localStyles }),
    [selected.styles, localStyles]
  );

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.entries(mergedStyles)
      .filter(([key, value]) => {
        if (!value) return false;
        if (!q) return true;
        return toKebab(key).includes(q) || key.toLowerCase().includes(q) || value.toLowerCase().includes(q);
      })
      .sort(([a], [b]) => toKebab(a).localeCompare(toKebab(b)));
  }, [mergedStyles, query]);

  const applyCustom = () => {
    const raw = customProp.trim();
    if (!raw) return;
    const key = raw.includes('-') ? toCamel(raw) : raw;
    update(key, customValue);
    setLocalStyles((prev) => ({ ...prev, [key]: customValue }));
    setCustomProp('');
    setCustomValue('');
  };

  return (
    <div className="design-sidebar__panel design-sidebar__panel--css" key={`css-${selected.id}`}>
      <div className="css-panel__toolbar">
        <input
          type="search"
          className="css-panel__search"
          placeholder="筛选属性…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="css-panel__count">{entries.length} 项</span>
      </div>

      <ul className="css-panel__list">
        {entries.map(([key, value]) => (
          <li key={key} className="css-panel__row">
            <label className="css-panel__prop" title={key}>
              {toKebab(key)}
            </label>
            <StyleValueEditor
              key={`${selected.id}-${key}`}
              cssKey={key}
              value={value}
              compact
              onChange={(next) => {
                update(key, next);
                setLocalStyles((prev) => ({ ...prev, [key]: next }));
              }}
            />
          </li>
        ))}
        {entries.length === 0 && (
          <li className="css-panel__empty">无匹配属性</li>
        )}
      </ul>

      <div className="css-panel__add">
        <span className="css-panel__add-label">添加属性</span>
        <div className="css-panel__add-row">
          <input
            type="text"
            className="css-panel__prop-input"
            placeholder="如 font-size"
            value={customProp}
            onChange={(e) => setCustomProp(e.target.value)}
          />
          <input
            type="text"
            className="css-panel__value-input"
            placeholder="值"
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyCustom()}
          />
          <button type="button" className="btn btn--sm btn--ghost" onClick={applyCustom}>
            应用
          </button>
        </div>
      </div>
    </div>
  );
}

export function DesignSidebar() {
  const selected = useEditorStore((s) => s.selected);
  const [tab, setTab] = useState<SidebarTab>('design');

  if (!selected) {
    return (
      <div className="design-sidebar design-sidebar--empty">
        <p>点击画布选择元素</p>
        <span>选中后可在 Design / CSS 中编辑属性</span>
      </div>
    );
  }

  return (
    <div className="design-sidebar">
      <ElementHeader selected={selected} />

      <div className="design-sidebar__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'design'}
          className={`design-sidebar__tab ${tab === 'design' ? 'design-sidebar__tab--active' : ''}`}
          onClick={() => setTab('design')}
        >
          Design
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'css'}
          className={`design-sidebar__tab ${tab === 'css' ? 'design-sidebar__tab--active' : ''}`}
          onClick={() => setTab('css')}
        >
          CSS
        </button>
      </div>

      <div className="design-sidebar__body" role="tabpanel">
        {tab === 'design' ? <DesignTabPanel selected={selected} /> : <CssTabPanel selected={selected} />}
      </div>
    </div>
  );
}
