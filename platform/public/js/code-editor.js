/**
 * Editor Interativo de Código JavaScript
 * Recursos:
 * - Gutter com numeração dinâmica de linhas e sincronização de scroll
 * - Indentação inteligente com Tab (2 espaços) e Shift+Tab
 * - Tecla Escape para desfoque/acessibilidade
 * - Console Sandbox seguro para captura de console.log, console.error e retornos
 * - Ações de Executar e Resetar
 */

import { escapeHtml } from './markdown.js';

export class CodeEditor {
  /**
   * @param {HTMLElement} containerElement - Elemento DOM onde o editor será renderizado
   * @param {Object} options - Configurações do editor
   */
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.initialCode = options.initialCode || '';
    this.currentCode = this.initialCode;
    this.onChange = options.onChange || null;
    this.title = options.title || 'JAVASCRIPT';
    this.autoRun = options.autoRun || false;

    this.render();
    this.bindEvents();

    if (this.autoRun) {
      this.execute();
    }
  }

  render() {
    this.container.innerHTML = `
      <div class="code-editor-component">
        <div class="editor-toolbar">
          <div class="editor-title-group">
            <span class="editor-lang-badge">${escapeHtml(this.title)}</span>
            <span class="editor-status-text" id="editorStatus">Pronto</span>
          </div>
          <div class="editor-actions">
            <button type="button" class="editor-btn editor-btn-secondary btn-reset" title="Resetar código para o inicial">
              ↺ Resetar
            </button>
            <button type="button" class="editor-btn editor-btn-primary btn-run" title="Executar código (Ctrl+Enter)">
              ▶ Executar Código
            </button>
          </div>
        </div>

        <div class="editor-workspace">
          <div class="editor-gutter" aria-hidden="true"></div>
          <textarea class="editor-textarea" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Editor de código JavaScript">${escapeHtml(this.initialCode)}</textarea>
        </div>

        <div class="editor-console">
          <div class="console-header">
            <span class="console-title">Console Sandbox</span>
            <button type="button" class="btn-clear-console" title="Limpar console">Limpar</button>
          </div>
          <div class="console-output" role="log" aria-live="polite">
            <div class="console-placeholder">Clique em &quot;Executar Código&quot; ou pressione Ctrl+Enter para testar.</div>
          </div>
        </div>
      </div>
    `;

    this.textarea = this.container.querySelector('.editor-textarea');
    this.gutter = this.container.querySelector('.editor-gutter');
    this.consoleOutput = this.container.querySelector('.console-output');
    this.statusText = this.container.querySelector('#editorStatus');
    this.btnRun = this.container.querySelector('.btn-run');
    this.btnReset = this.container.querySelector('.btn-reset');
    this.btnClearConsole = this.container.querySelector('.btn-clear-console');

    this.updateGutter();
  }

  bindEvents() {
    // Sincronização e digitação
    this.textarea.addEventListener('input', () => {
      this.currentCode = this.textarea.value;
      this.updateGutter();
      if (this.onChange) {
        this.onChange(this.currentCode);
      }
    });

    // Sincronização de rolagem (scroll)
    this.textarea.addEventListener('scroll', () => {
      this.gutter.scrollTop = this.textarea.scrollTop;
    });

    // Teclas especiais: Tab, Shift+Tab, Escape e Ctrl+Enter
    this.textarea.addEventListener('keydown', (e) => {
      // Requisito de Acessibilidade UX: Tecla Esc libera o foco do textarea
      if (e.key === 'Escape') {
        this.textarea.blur();
        return;
      }

      // Atalho de execução rápida: Ctrl+Enter ou Cmd+Enter
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.execute();
        return;
      }

      // Indentação com Tab (2 espaços) e Shift+Tab
      if (e.key === 'Tab') {
        e.preventDefault();
        this.handleTabKey(e.shiftKey);
      }
    });

    // Ações dos botões
    this.btnRun.addEventListener('click', () => this.execute());
    this.btnReset.addEventListener('click', () => this.reset());
    this.btnClearConsole.addEventListener('click', () => this.clearConsole());
  }

  handleTabKey(isShift) {
    const start = this.textarea.selectionStart;
    const end = this.textarea.selectionEnd;
    const val = this.textarea.value;

    if (!isShift) {
      if (start === end) {
        // Inserir 2 espaços na posição do cursor
        this.textarea.value = val.substring(0, start) + '  ' + val.substring(end);
        this.textarea.selectionStart = this.textarea.selectionEnd = start + 2;
      } else {
        // Múltiplas linhas selecionadas
        const lineStart = val.lastIndexOf('\n', start - 1) + 1;
        const lineEnd = val.indexOf('\n', end);
        const actualEnd = lineEnd === -1 ? val.length : lineEnd;
        const block = val.substring(lineStart, actualEnd);
        const indented = block.split('\n').map(l => '  ' + l).join('\n');
        this.textarea.value = val.substring(0, lineStart) + indented + val.substring(actualEnd);
        this.textarea.selectionStart = start + 2;
        this.textarea.selectionEnd = end + (indented.length - block.length);
      }
    } else {
      // Desindentar (remover até 2 espaços)
      const lineStart = val.lastIndexOf('\n', start - 1) + 1;
      const lineEnd = val.indexOf('\n', end);
      const actualEnd = lineEnd === -1 ? val.length : lineEnd;
      const block = val.substring(lineStart, actualEnd);
      const unindented = block.split('\n').map(l => {
        if (l.startsWith('  ')) return l.substring(2);
        if (l.startsWith(' ')) return l.substring(1);
        return l;
      }).join('\n');
      this.textarea.value = val.substring(0, lineStart) + unindented + val.substring(actualEnd);
      this.textarea.selectionStart = Math.max(lineStart, start - 2);
      this.textarea.selectionEnd = Math.max(lineStart, end - (block.length - unindented.length));
    }

    this.currentCode = this.textarea.value;
    this.updateGutter();
    if (this.onChange) {
      this.onChange(this.currentCode);
    }
  }

  updateGutter() {
    const lines = this.textarea.value.split('\n').length;
    let html = '';
    for (let i = 1; i <= lines; i++) {
      html += `<div class="gutter-line">${i}</div>`;
    }
    this.gutter.innerHTML = html;
  }

  execute() {
    const code = this.textarea.value;
    const entries = [];

    const formatItem = (item) => {
      if (item === null) return 'null';
      if (item === undefined) return 'undefined';
      if (typeof item === 'string') return item;
      if (typeof item === 'function') return item.toString();
      try {
        return JSON.stringify(item, null, 2);
      } catch (_) {
        return String(item);
      }
    };

    const sandboxConsole = {
      log: (...args) => entries.push({ type: 'log', text: args.map(formatItem).join(' ') }),
      info: (...args) => entries.push({ type: 'info', text: args.map(formatItem).join(' ') }),
      warn: (...args) => entries.push({ type: 'warn', text: args.map(formatItem).join(' ') }),
      error: (...args) => entries.push({ type: 'error', text: args.map(formatItem).join(' ') })
    };

    const startTime = performance.now();
    try {
      const runner = new Function('console', `"use strict";\n${code}`);
      const returnValue = runner(sandboxConsole);
      const elapsed = (performance.now() - startTime).toFixed(1);

      if (returnValue !== undefined) {
        entries.push({ type: 'return', text: `=> ${formatItem(returnValue)}` });
      }

      if (entries.length === 0) {
        this.consoleOutput.innerHTML = `
          <div class="console-entry console-info">
            <span class="console-badge">INFO</span>
            <pre>✓ Código executado com sucesso sem chamadas de console (${elapsed}ms)</pre>
          </div>
        `;
      } else {
        this.consoleOutput.innerHTML = entries.map(entry => `
          <div class="console-entry console-${entry.type}">
            <span class="console-badge">${entry.type.toUpperCase()}</span>
            <pre>${escapeHtml(entry.text)}</pre>
          </div>
        `).join('') + `<div class="console-timing">⏱ Tempo: ${elapsed}ms</div>`;
      }

      this.statusText.textContent = `Sucesso (${elapsed}ms)`;
      this.statusText.className = 'editor-status-text status-success';
    } catch (err) {
      const elapsed = (performance.now() - startTime).toFixed(1);
      this.consoleOutput.innerHTML = `
        <div class="console-entry console-error">
          <span class="console-badge">ERRO</span>
          <pre>${escapeHtml(err.name + ': ' + err.message)}</pre>
        </div>
      `;
      this.statusText.textContent = `Erro (${err.name})`;
      this.statusText.className = 'editor-status-text status-error';
    }

    this.consoleOutput.scrollTop = this.consoleOutput.scrollHeight;
  }

  reset() {
    this.textarea.value = this.initialCode;
    this.currentCode = this.initialCode;
    this.updateGutter();
    this.clearConsole();
    this.statusText.textContent = 'Resetado';
    this.statusText.className = 'editor-status-text';
    if (this.onChange) {
      this.onChange(this.currentCode);
    }
  }

  clearConsole() {
    this.consoleOutput.innerHTML = '<div class="console-placeholder">Console limpo.</div>';
  }

  getValue() {
    return this.textarea.value;
  }

  setValue(newCode) {
    this.textarea.value = newCode;
    this.currentCode = newCode;
    this.updateGutter();
    if (this.onChange) {
      this.onChange(this.currentCode);
    }
  }
}
