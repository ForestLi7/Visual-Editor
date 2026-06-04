import { useEffect } from 'react';
import './App.css';

const buttonProps = JSON.stringify([
  { name: 'disabled', type: 'boolean', value: false },
  { name: 'variant', type: 'enum', value: 'primary', options: ['primary', 'secondary', 'danger'] },
]);

export default function App() {
  useEffect(() => {
    console.info('[demo-app] Visual Editor 演示应用已加载');
  }, []);

  return (
    <main
      className="demo-main"
      data-ve-id="ve-main-1"
      data-ve-component="main"
      data-ve-source={JSON.stringify({ file: 'demo-app/src/App.tsx', line: 12, column: 4 })}
    >
      <header
        className="demo-header"
        data-ve-id="ve-header-1"
        data-ve-component="header"
        data-ve-source={JSON.stringify({ file: 'demo-app/src/App.tsx', line: 18, column: 6 })}
      >
        <h1
          className="demo-title"
          data-ve-id="ve-title-1"
          data-ve-component="h1"
          data-ve-source={JSON.stringify({ file: 'demo-app/src/App.tsx', line: 24, column: 8 })}
        >
          可视化编辑器演示
        </h1>
        <p
          className="demo-subtitle"
          data-ve-id="ve-subtitle-1"
          data-ve-component="p"
        >
          在编辑器中点击此页面元素进行样式调整
        </p>
      </header>

      <section className="demo-cards" data-ve-id="ve-section-1">
        <article
          className="demo-card"
          data-ve-id="ve-card-1"
          data-ve-component="Card"
          data-ve-source={JSON.stringify({ file: 'demo-app/src/App.tsx', line: 40, column: 8 })}
        >
          <h2 data-ve-id="ve-card-title-1">功能卡片 A</h2>
          <p data-ve-id="ve-card-desc-1">支持点选、样式编辑与代码回写。</p>
          <button
            type="button"
            className="demo-btn demo-btn--primary"
            data-ve-id="ve-btn-1"
            data-ve-component="Button"
            data-ve-props={buttonProps}
            data-ve-source={JSON.stringify({ file: 'demo-app/src/App.tsx', line: 48, column: 10 })}
          >
            主要操作
          </button>
        </article>

        <article
          className="demo-card demo-card--alt"
          data-ve-id="ve-card-2"
          data-ve-component="Card"
        >
          <h2 data-ve-id="ve-card-title-2">功能卡片 B</h2>
          <p data-ve-id="ve-card-desc-2">尝试修改布局、颜色与设计 Token。</p>
          <button
            type="button"
            className="demo-btn demo-btn--secondary"
            data-ve-id="ve-btn-2"
            data-ve-component="Button"
            data-ve-props={buttonProps}
          >
            次要操作
          </button>
        </article>
      </section>
    </main>
  );
}
