/**
 * Parser de Markdown leve, seguro e modular para a Plataforma Acadêmica
 * Suporta blocos de código com cópia, tabelas e Callouts Pedagógicos
 */

export function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Destaca sintaxe de código JavaScript com spans semânticos seguros
 */
export function highlightJavaScript(code) {
  if (code === null || code === undefined) return '';
  const text = String(code);

  const tokenRegex = new RegExp(
    '(/\\*[\\s\\S]*?\\*/|//[^\\n]*)' +
    '|(`(?:\\\\.|[^`])*`|"(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\')' +
    '|(\\b(?:async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|function|get|if|import|in|instanceof|let|new|of|return|set|static|super|switch|this|throw|try|typeof|var|void|while|with|yield|true|false|null|undefined)\\b)' +
    '|(\\b(?:0x[0-9a-fA-F]+|0b[01]+|\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?)\\b)' +
    '|([a-zA-Z_$][a-zA-Z0-9_$]*(?=\\s*\\())' +
    '|(=>|===|!==|==|!=|<=|>=|&&|\\|\\||\\+\\+|--|\\+=|-=|\\*=|/=|%=|\\.\\.\\.|[-+*/%^&|~=<>!?:;,.{}()\\[\\]])' +
    '|([a-zA-Z_$][a-zA-Z0-9_$]*)' +
    '|(\\s+|[^\\s])',
    'g'
  );

  return text.replace(tokenRegex, (match, comment, str, keyword, num, func, operator, identifier, rest) => {
    if (comment !== undefined) {
      return `<span class="token-comment">${escapeHtml(comment)}</span>`;
    }
    if (str !== undefined) {
      return `<span class="token-string">${escapeHtml(str)}</span>`;
    }
    if (keyword !== undefined) {
      return `<span class="token-keyword">${escapeHtml(keyword)}</span>`;
    }
    if (num !== undefined) {
      return `<span class="token-number">${escapeHtml(num)}</span>`;
    }
    if (func !== undefined) {
      return `<span class="token-function">${escapeHtml(func)}</span>`;
    }
    if (operator !== undefined) {
      return `<span class="token-operator">${escapeHtml(operator)}</span>`;
    }
    if (identifier !== undefined) {
      return escapeHtml(identifier);
    }
    return escapeHtml(match);
  });
}

export function renderMarkdown(markdownText) {
  if (!markdownText) return '';

  const lines = markdownText.split('\n');
  const output = [];
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockLines = [];

  let inTable = false;
  let tableRows = [];

  let inCallout = false;
  let calloutType = 'note';
  let calloutLines = [];

  let inList = false;
  let listType = 'ul';

  function flushList() {
    if (inList) {
      output.push(`</${listType}>`);
      inList = false;
    }
  }

  function flushTable() {
    if (inTable && tableRows.length > 0) {
      let tableHtml = '<div class="table-container"><table>';
      const header = tableRows[0];
      tableHtml += '<thead><tr>';
      header.forEach(cell => {
        tableHtml += `<th>${parseInline(cell)}</th>`;
      });
      tableHtml += '</tr></thead><tbody>';

      for (let i = 1; i < tableRows.length; i++) {
        tableHtml += '<tr>';
        tableRows[i].forEach(cell => {
          tableHtml += `<td>${parseInline(cell)}</td>`;
        });
        tableHtml += '</tr>';
      }

      tableHtml += '</tbody></table></div>';
      output.push(tableHtml);
      tableRows = [];
      inTable = false;
    }
  }

  function flushCallout() {
    if (inCallout) {
      const iconMap = {
        note: '💡',
        tip: '💡',
        warning: '⚠️',
        important: '⭐',
        danger: '🚨'
      };
      const icon = iconMap[calloutType] || '💡';
      const content = calloutLines.map(l => `<p>${parseInline(l)}</p>`).join('');
      output.push(`
        <div class="callout callout-${calloutType}">
          <div class="callout-icon" aria-hidden="true">${icon}</div>
          <div class="callout-content">${content}</div>
        </div>
      `);
      inCallout = false;
      calloutLines = [];
    }
  }

  function parseInline(text) {
    let result = escapeHtml(text);
    // Inline code: `code`
    result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Strong: **bold**
    result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Em: *italic*
    result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Links: [label](url)
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return result;
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // 1. Blocos de Código ```
    if (trimmed.startsWith('```')) {
      if (!inCodeBlock) {
        flushList();
        flushTable();
        flushCallout();
        inCodeBlock = true;
        codeBlockLang = trimmed.slice(3).trim() || 'javascript';
        codeBlockLines = [];
      } else {
        inCodeBlock = false;
        const rawCode = codeBlockLines.join('\n');
        const langLower = (codeBlockLang || 'javascript').toLowerCase();
        const isJs = ['javascript', 'js', 'node', 'es6', ''].includes(langLower);
        const highlightedCode = isJs ? highlightJavaScript(rawCode) : escapeHtml(rawCode);
        const displayLang = (codeBlockLang || 'JAVASCRIPT').toUpperCase();
        const codeBlockHtml = `
          <div class="code-block-container">
            <div class="code-block-header">
              <span class="code-lang-tag">${escapeHtml(displayLang)}</span>
              <button class="copy-button" type="button" data-code="${escapeHtml(rawCode)}">Copiar</button>
            </div>
            <pre><code class="language-${escapeHtml(langLower)}">${highlightedCode}</code></pre>
          </div>
        `;
        output.push(codeBlockHtml);
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(rawLine);
      continue;
    }

    // 2. Callouts (> [!NOTE], > [!WARNING], etc.)
    const calloutMatch = trimmed.match(/^>\s*\[!(NOTE|TIP|WARNING|IMPORTANT|DANGER)\]/i);
    if (calloutMatch) {
      flushList();
      flushTable();
      flushCallout();
      inCallout = true;
      calloutType = calloutMatch[1].toLowerCase();
      continue;
    }

    if (inCallout) {
      if (trimmed.startsWith('>')) {
        const lineContent = trimmed.replace(/^>\s?/, '');
        if (lineContent.length > 0) {
          calloutLines.push(lineContent);
        }
        continue;
      } else if (trimmed === '') {
        // Linha em branco dentro de callout
        continue;
      } else {
        flushCallout();
      }
    }

    // 3. Tabelas Markdown (| col | col |)
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      flushList();
      flushCallout();
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map(c => c.trim());

      // Pula linha de separação |--|--|
      if (cells.every(c => /^:?-+:?$/.test(c))) {
        inTable = true;
        continue;
      }

      tableRows.push(cells);
      inTable = true;
      continue;
    } else if (inTable) {
      flushTable();
    }

    // 4. Linha horizontal (---)
    if (/^(\*\*\*|---|___)$/.test(trimmed)) {
      flushList();
      flushCallout();
      output.push('<hr>');
      continue;
    }

    // 5. Cabeçalhos (# a ####)
    const headerMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      flushList();
      flushCallout();
      const level = headerMatch[1].length;
      const text = headerMatch[2];
      output.push(`<h${level}>${parseInline(text)}</h${level}>`);
      continue;
    }

    // 6. Listas Não-Ordenadas (* ou -)
    const ulMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (ulMatch) {
      flushCallout();
      if (!inList || listType !== 'ul') {
        flushList();
        output.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      output.push(`<li>${parseInline(ulMatch[1])}</li>`);
      continue;
    }

    // 7. Listas Ordenadas (1. 2.)
    const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      flushCallout();
      if (!inList || listType !== 'ol') {
        flushList();
        output.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      output.push(`<li>${parseInline(olMatch[1])}</li>`);
      continue;
    }

    // 8. Linha em branco
    if (trimmed === '') {
      flushList();
      flushCallout();
      continue;
    }

    // 9. Parágrafo comum
    flushList();
    flushCallout();
    output.push(`<p>${parseInline(trimmed)}</p>`);
  }

  flushList();
  flushTable();
  flushCallout();

  return output.join('\n');
}

/**
 * Ativa os botões de copiar código injetados no DOM
 */
export function attachCopyCodeListeners() {
  document.querySelectorAll('.copy-button').forEach(button => {
    if (button.dataset.hasCopyListener) return;
    button.dataset.hasCopyListener = 'true';

    button.addEventListener('click', async () => {
      const code = button.getAttribute('data-code');
      if (code !== null) {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(code);
          } else {
            const ta = document.createElement('textarea');
            ta.value = code;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
          }
          const originalText = button.textContent;
          button.textContent = 'Copiado!';
          button.classList.add('copied');
          setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('copied');
          }, 2000);
        } catch (err) {
          console.error('Falha ao copiar:', err);
        }
      }
    });
  });
}
