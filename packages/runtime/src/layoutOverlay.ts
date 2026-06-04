const OVERLAY_ID = 've-layout-overlay';

function ensureOverlayRoot(): HTMLElement {
  let root = document.getElementById(OVERLAY_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = OVERLAY_ID;
    root.setAttribute('data-ve-ignore', 'true');
    Object.assign(root.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      zIndex: '2147483645',
      overflow: 'hidden',
    });
    document.body.appendChild(root);
  }
  return root;
}

function clearOverlay() {
  const root = document.getElementById(OVERLAY_ID);
  if (root) root.innerHTML = '';
}

function isFlexOrGrid(display: string): 'flex' | 'grid' | null {
  const d = display.toLowerCase();
  if (d === 'flex' || d === 'inline-flex') return 'flex';
  if (d === 'grid' || d === 'inline-grid') return 'grid';
  return null;
}

export function updateLayoutOverlay(el: HTMLElement | null) {
  clearOverlay();
  if (!el) return;

  const computed = getComputedStyle(el);
  const mode = isFlexOrGrid(computed.display);
  if (!mode) return;

  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return;

  const root = ensureOverlayRoot();
  const box = document.createElement('div');
  Object.assign(box.style, {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    border: '2px dashed rgba(62, 207, 142, 0.85)',
    borderRadius: '4px',
    boxSizing: 'border-box',
  });

  const label = document.createElement('div');
  const dir = computed.flexDirection || 'row';
  const gap = computed.gap || computed.columnGap || '0';
  label.textContent = mode === 'flex' ? `Flex · ${dir} · gap ${gap}` : `Grid · gap ${gap}`;
  Object.assign(label.style, {
    position: 'absolute',
    top: '-1.4rem',
    left: '0',
    fontSize: '11px',
    fontFamily: 'system-ui, sans-serif',
    color: '#3ecf8e',
    background: 'rgba(13, 15, 18, 0.85)',
    padding: '2px 6px',
    borderRadius: '4px',
    whiteSpace: 'nowrap',
  });
  box.appendChild(label);

  if (mode === 'flex') {
    const arrow = document.createElement('div');
    const isRow = dir.includes('row');
    Object.assign(arrow.style, {
      position: 'absolute',
      left: isRow ? '8px' : '50%',
      top: isRow ? '50%' : '8px',
      width: isRow ? '40px' : '3px',
      height: isRow ? '3px' : '40px',
      background: 'rgba(62, 207, 142, 0.6)',
      transform: isRow ? 'translateY(-50%)' : 'translateX(-50%)',
    });
    box.appendChild(arrow);
  }

  root.appendChild(box);
}

export function removeLayoutOverlay() {
  clearOverlay();
}
