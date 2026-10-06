// A compact native radio group: keyboard navigation and selection are built in.
let nextId = 0;
export function modeControl(value, changed, { dots = false, label = 'Pieces can flip' } = {}) {
    const group = document.createElement('fieldset'); group.className = 'mode-control';
    const legend = document.createElement('legend'); legend.className = 'sr-only'; legend.textContent = label; group.append(legend);
    const name = `flip-mode-${nextId++}`;
    for (const allowFlip of [false, true]) {
        const item = document.createElement('label'), input = document.createElement('input'), text = document.createElement('span');
        input.type = 'radio'; input.name = name; input.value = String(allowFlip); input.checked = allowFlip === value;
        text.textContent = allowFlip ? 'Flips allowed' : 'No flips';
        item.append(input);
        if (dots) { const dot = document.createElement('span'); dot.className = `calendar-dot ${allowFlip ? 'flippable' : 'fixed'} completed`; dot.setAttribute('aria-hidden', 'true'); item.append(dot); }
        item.append(text); group.append(item);
        input.addEventListener('change', async () => {
            if (!input.checked) return;
            group.disabled = true;
            try { await changed(allowFlip); value = allowFlip; }
            catch { for (const radio of group.querySelectorAll('input')) radio.checked = radio.value === String(value); }
            finally { group.disabled = false; }
        });
    }
    return group;
}
