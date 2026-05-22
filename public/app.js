// SentinelLog SaaS Client Application

// Application State
let state = {
  logs: [],
  apiKey: 'mysecretkey',
  isScanning: false,
  tamperedNodeIds: new Set()
};

// DOM Elements
const serverStatus = document.getElementById('server-status');
const apiKeyInput = document.getElementById('api-key-input');
const toggleKeyVisibilityBtn = document.getElementById('toggle-key-visibility');
const globalStatusCard = document.getElementById('global-status-card');
const globalStatusText = document.getElementById('global-status-text');
const globalStatusDesc = document.getElementById('global-status-desc');
const globalStatusIcon = document.getElementById('global-status-icon');
const runScanBtn = document.getElementById('run-scan-btn');
const scanProgressContainer = document.querySelector('.scan-progress-container');
const scanBarFill = document.getElementById('scan-bar-fill');
const totalBlocksCount = document.getElementById('total-blocks-count');
const lastAuditedTime = document.getElementById('last-audited-time');
const appendLogForm = document.getElementById('append-log-form');
const actorInput = document.getElementById('actor-input');
const actionInput = document.getElementById('action-input');
const payloadInput = document.getElementById('payload-input');
const jsonValidationMsg = document.getElementById('json-validation-msg');
const appendBtn = document.getElementById('append-btn');
const tamperIdSelect = document.getElementById('tamper-id-select');
const tamperActor = document.getElementById('tamper-actor');
const tamperAction = document.getElementById('tamper-action');
const tamperPayload = document.getElementById('tamper-payload');
const tamperBtn = document.getElementById('tamper-btn');
const refreshChainBtn = document.getElementById('refresh-chain-btn');
const chainViewport = document.getElementById('chain-viewport');
const exportActor = document.getElementById('export-actor');
const exportStartDate = document.getElementById('export-start-date');
const exportEndDate = document.getElementById('export-end-date');
const exportBtn = document.getElementById('export-btn');
const terminalOutput = document.getElementById('terminal-output');
const copyExportBtn = document.getElementById('copy-export-btn');
const toastEl = document.getElementById('toast');

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  // Load settings
  state.apiKey = apiKeyInput.value;

  // Event Listeners
  apiKeyInput.addEventListener('input', (e) => {
    state.apiKey = e.target.value;
  });

  toggleKeyVisibilityBtn.addEventListener('click', () => {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
    const icon = toggleKeyVisibilityBtn.querySelector('i');
    icon.className = isPassword ? 'fa-regular fa-eye' : 'fa-regular fa-eye-slash';
  });

  payloadInput.addEventListener('input', validateJSONInput);
  appendLogForm.addEventListener('submit', handleAppendLog);
  runScanBtn.addEventListener('click', runIntegrityScan);
  tamperBtn.addEventListener('click', handleInjectTamper);
  refreshChainBtn.addEventListener('click', () => loadLogsChain(true));
  exportBtn.addEventListener('click', handleExportLogs);
  copyExportBtn.addEventListener('click', copyTerminalOutput);
  
  document.querySelector('.toast-close').addEventListener('click', hideToast);

  // Initial Load
  loadLogsChain();
});

// Toast System
function showToast(message, type = 'info') {
  toastEl.className = `toast ${type}`;
  const icon = toastEl.querySelector('.toast-icon');
  icon.className = 'fa-solid toast-icon';
  
  if (type === 'success') icon.classList.add('fa-circle-check');
  else if (type === 'error') icon.classList.add('fa-triangle-exclamation');
  else if (type === 'warning') icon.classList.add('fa-circle-exclamation');
  else icon.classList.add('fa-circle-info');
  
  toastEl.querySelector('.toast-message').textContent = message;
  toastEl.classList.remove('hidden');
  
  // Auto dismiss after 4 seconds
  if (window.toastTimer) clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(hideToast, 4000);
}

function hideToast() {
  toastEl.classList.add('hidden');
}

// JSON Real-Time Validator
function validateJSONInput() {
  const value = payloadInput.value.trim();
  if (!value) {
    jsonValidationMsg.className = 'validation-helper text-muted';
    jsonValidationMsg.innerHTML = '<i class="fa-solid fa-info-circle"></i> Valid JSON required';
    return false;
  }
  
  try {
    JSON.parse(value);
    jsonValidationMsg.className = 'validation-helper valid';
    jsonValidationMsg.innerHTML = '<i class="fa-solid fa-circle-check"></i> JSON formatting is valid';
    return true;
  } catch (err) {
    jsonValidationMsg.className = 'validation-helper invalid';
    jsonValidationMsg.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Invalid JSON: ${err.message}`;
    return false;
  }
}

// Request Helper
function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-api-key': state.apiKey
  };
}

// Load Chain from API
async function loadLogsChain(manual = false) {
  try {
    const res = await fetch('/export', { headers: getHeaders() });
    
    if (res.status === 401) {
      serverStatus.className = 'status-badge error';
      serverStatus.querySelector('.status-text').textContent = 'Unauthorized Key';
      showToast('API access denied. Verify your API Key configuration.', 'error');
      return;
    }
    
    if (!res.ok) {
      throw new Error(`Server returned status: ${res.status}`);
    }

    serverStatus.className = 'status-badge connected';
    serverStatus.querySelector('.status-text').textContent = 'Server Connected';

    const data = await res.json();
    state.logs = data;
    
    // Update dashboard metrics
    totalBlocksCount.textContent = data.length;
    
    // Populate select element for tamper tool
    populateTamperDropdown(data);
    
    // Render blocks list
    renderChainVisualizer(data);
    
    if (manual) {
      showToast('Ledger chain loaded successfully.', 'success');
    }
  } catch (err) {
    serverStatus.className = 'status-badge error';
    serverStatus.querySelector('.status-text').textContent = 'Connection Error';
    showToast(`Failed to retrieve logs: ${err.message}`, 'error');
  }
}

// Populate Tamper Select Options
function populateTamperDropdown(logs) {
  // Store selected value if any
  const previousSelected = tamperIdSelect.value;
  
  tamperIdSelect.innerHTML = '';
  
  if (logs.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No blocks available';
    opt.disabled = true;
    opt.selected = true;
    tamperIdSelect.appendChild(opt);
    return;
  }
  
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = '-- Select Block ID --';
  defaultOpt.disabled = true;
  defaultOpt.selected = !previousSelected;
  tamperIdSelect.appendChild(defaultOpt);

  logs.forEach(log => {
    const opt = document.createElement('option');
    opt.value = log.id;
    opt.textContent = `Block #${log.id} (${log.actor} -> ${log.action})`;
    if (log.id.toString() === previousSelected) {
      opt.selected = true;
    }
    tamperIdSelect.appendChild(opt);
  });
}

// Render the entire sequential blockchain UI
function renderChainVisualizer(logs) {
  if (logs.length === 0) {
    chainViewport.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-database empty-icon"></i>
        <p>No log blocks found in database.</p>
        <p class="subtitle">Submit the form on the left to write the genesis block!</p>
      </div>
    `;
    return;
  }

  chainViewport.innerHTML = '';

  // Render from latest to oldest (reverse order) for convenience, or oldest to latest?
  // Since it's a chain visualizer, rendering oldest to latest with arrows in between is easier to read.
  logs.forEach((log, index) => {
    // If index > 0, draw connection arrow before it
    if (index > 0) {
      const prevLog = logs[index - 1];
      const isBroken = state.tamperedNodeIds.has(log.id) || state.tamperedNodeIds.has(prevLog.id);
      
      const arrow = document.createElement('div');
      arrow.className = `chain-link-arrow ${isBroken ? 'broken-link' : 'secure-link'}`;
      arrow.innerHTML = `<i class="fa-solid ${isBroken ? 'fa-triangle-exclamation' : 'fa-arrow-down-long'}"></i>`;
      chainViewport.appendChild(arrow);
    }

    const isNodeTampered = state.tamperedNodeIds.has(log.id);
    
    // Create card element
    const card = document.createElement('div');
    card.className = `block-node ${isNodeTampered ? 'tampered' : 'verified'}`;
    card.id = `block-${log.id}`;
    
    const timeFormatted = new Date(log.created_at).toLocaleString();
    const payloadString = JSON.stringify(log.payload, null, 2);

    card.innerHTML = `
      <div class="block-header">
        <span class="block-id"><i class="fa-solid fa-cube"></i> Block #${log.id}</span>
        <div class="block-meta">
          <span class="block-time"><i class="fa-regular fa-clock"></i> ${timeFormatted}</span>
          <span class="block-badge ${isNodeTampered ? 'badge-red' : 'badge-green'}">
            <i class="fa-solid ${isNodeTampered ? 'fa-triangle-exclamation' : 'fa-circle-check'}"></i> 
            ${isNodeTampered ? 'TAMPERED' : 'SECURE'}
          </span>
        </div>
      </div>
      <div class="block-body">
        <div class="block-info-group">
          <span class="info-label">Actor</span>
          <span class="info-val">${escapeHtml(log.actor)}</span>
        </div>
        <div class="block-info-group">
          <span class="info-label">Action</span>
          <span class="info-val">${escapeHtml(log.action)}</span>
        </div>
        <div class="payload-display">
          <div class="payload-toggle" onclick="togglePayloadDisplay(${log.id})">
            <span><i class="fa-solid fa-brackets-curly"></i> View Payload</span>
            <i class="fa-solid fa-chevron-down arrow-toggle"></i>
          </div>
          <pre class="payload-json" id="payload-json-${log.id}"><code>${escapeHtml(payloadString)}</code></pre>
        </div>
        <div class="crypto-link-panel">
          <div class="hash-row">
            <span class="hash-label">Prev Hash:</span>
            <span class="hash-value" onclick="copyText('${log.previous_hash}')" title="Click to copy full hash">
              ${log.previous_hash.substring(0, 16)}... <i class="fa-regular fa-copy"></i>
            </span>
          </div>
          <div class="hash-row">
            <span class="hash-label">Curr Hash:</span>
            <span class="hash-value" onclick="copyText('${log.current_hash}')" title="Click to copy full hash">
              ${log.current_hash.substring(0, 16)}... <i class="fa-regular fa-copy"></i>
            </span>
          </div>
        </div>
        <div class="block-actions">
          <button class="block-btn" onclick="verifyRow(${log.id})">
            <i class="fa-solid fa-fingerprint"></i> Audit Block
          </button>
        </div>
      </div>
    `;

    chainViewport.appendChild(card);
  });
}

// Toggle Payload Collapse
window.togglePayloadDisplay = function(id) {
  const el = document.getElementById(`payload-json-${id}`);
  const arrow = el.previousElementSibling.querySelector('.arrow-toggle');
  
  if (el.classList.contains('show')) {
    el.classList.remove('show');
    arrow.style.transform = 'rotate(0deg)';
  } else {
    el.classList.add('show');
    arrow.style.transform = 'rotate(180deg)';
  }
};

// Clipboard Helper
window.copyText = function(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Hash copied to clipboard!', 'info');
  }).catch(() => {
    showToast('Failed to copy text.', 'error');
  });
};

// Append Log Record
async function handleAppendLog(e) {
  e.preventDefault();
  
  if (!validateJSONInput()) {
    showToast('Please correct your JSON payload.', 'warning');
    return;
  }

  const actor = actorInput.value.trim();
  const action = actionInput.value.trim();
  const payload = JSON.parse(payloadInput.value);

  appendBtn.disabled = true;
  appendBtn.querySelector('.btn-text').textContent = 'Signing...';

  try {
    const res = await fetch('/log', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ actor, action, payload })
    });

    if (res.status === 429) {
      showToast('Rate limit exceeded. Please wait before writing another block.', 'warning');
      return;
    }

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Server error.');
    }

    showToast('Block successfully signed and appended to ledger.', 'success');
    
    // Clear fields
    actorInput.value = '';
    actionInput.value = '';
    payloadInput.value = '';
    jsonValidationMsg.className = 'validation-helper text-muted';
    jsonValidationMsg.innerHTML = '<i class="fa-solid fa-info-circle"></i> Valid JSON required';

    // Reload list
    await loadLogsChain();
  } catch (err) {
    showToast(`Append failed: ${err.message}`, 'error');
  } finally {
    appendBtn.disabled = false;
    appendBtn.querySelector('.btn-text').textContent = 'Sign & Write Block';
  }
}

// Audit Single Block
window.verifyRow = async function(id) {
  const nodeEl = document.getElementById(`block-${id}`);
  nodeEl.classList.remove('verified', 'tampered');
  
  try {
    const res = await fetch(`/log/${id}`, { headers: getHeaders() });
    
    if (!res.ok) {
      throw new Error(`Server status: ${res.status}`);
    }

    const data = await res.json();
    
    if (data.verified) {
      nodeEl.classList.add('verified');
      state.tamperedNodeIds.delete(id);
      
      // Blink Green effect
      nodeEl.style.boxShadow = '0 0 25px rgba(16, 185, 129, 0.4)';
      setTimeout(() => {
        nodeEl.style.boxShadow = '';
      }, 1000);
      
      showToast(`Block #${id} verified successfully. Hash is valid.`, 'success');
    } else {
      nodeEl.classList.add('tampered');
      state.tamperedNodeIds.add(id);
      
      // Blink Red effect
      nodeEl.style.boxShadow = '0 0 25px rgba(239, 68, 68, 0.6)';
      setTimeout(() => {
        nodeEl.style.boxShadow = '';
      }, 1000);
      
      showToast(`Audit ALERT: Block #${id} has been TAMPERED with!`, 'error');
      
      // Update global status to compromised
      updateGlobalSecurityStatus(false, `Block #${id} contents are tampered. Integrity check failed.`);
    }
    
    // Re-render links and badges
    renderChainVisualizer(state.logs);
  } catch (err) {
    showToast(`Row audit failed: ${err.message}`, 'error');
  }
};

// Global Audit Scan (GET /verify)
async function runIntegrityScan() {
  if (state.isScanning) return;
  state.isScanning = true;
  runScanBtn.disabled = true;
  
  // Show progress bar
  scanProgressContainer.style.display = 'block';
  scanBarFill.style.width = '0%';
  
  // Fake animation steps
  let progress = 0;
  const interval = setInterval(() => {
    progress += Math.floor(Math.random() * 25) + 5;
    if (progress > 90) progress = 90;
    scanBarFill.style.width = `${progress}%`;
  }, 150);

  try {
    const res = await fetch('/verify', { headers: getHeaders() });
    
    if (!res.ok) {
      throw new Error(`Server returned error status: ${res.status}`);
    }

    const data = await res.json();
    
    // Complete progress bar
    clearInterval(interval);
    scanBarFill.style.width = '100%';
    
    setTimeout(async () => {
      scanProgressContainer.style.display = 'none';
      state.isScanning = false;
      runScanBtn.disabled = false;
      
      const currentTime = new Date().toLocaleTimeString();
      lastAuditedTime.textContent = currentTime;

      if (data.status === 'pass') {
        state.tamperedNodeIds.clear();
        updateGlobalSecurityStatus(true);
        showToast('Full ledger chain validation successful. Zero discrepancies found.', 'success');
      } else {
        // Tampered block ID
        const brokenId = data.broken_entry;
        state.tamperedNodeIds.add(brokenId);
        
        updateGlobalSecurityStatus(false, data.reason);
        showToast(`Security Compromise: Audit failed on Block #${brokenId}!`, 'error');
        
        // Highlight the tampered node in UI and scroll to it
        renderChainVisualizer(state.logs);
        const targetNode = document.getElementById(`block-${brokenId}`);
        if (targetNode) {
          targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetNode.style.boxShadow = '0 0 35px rgba(239, 68, 68, 0.8)';
          setTimeout(() => { targetNode.style.boxShadow = ''; }, 2000);
        }
      }
    }, 500);

  } catch (err) {
    clearInterval(interval);
    scanProgressContainer.style.display = 'none';
    state.isScanning = false;
    runScanBtn.disabled = false;
    showToast(`Audit Scan aborted: ${err.message}`, 'error');
  }
}

// Update Global Security Banner UI
function updateGlobalSecurityStatus(isSecure, reason = '') {
  if (isSecure) {
    globalStatusCard.className = 'card glass-card status-card secure';
    globalStatusText.textContent = 'SECURED';
    globalStatusIcon.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
    globalStatusDesc.textContent = 'All cryptographic hashes are locked and sequential integrity is verified.';
  } else {
    globalStatusCard.className = 'card glass-card status-card compromised';
    globalStatusText.textContent = 'COMPROMISED';
    globalStatusIcon.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i>';
    globalStatusDesc.textContent = `CRITICAL ALERT: ${reason}`;
  }
}

// Inject Tampering Simulation
async function handleInjectTamper() {
  const id = tamperIdSelect.value;
  if (!id) {
    showToast('Please select a Block ID to tamper with.', 'warning');
    return;
  }

  const actor = tamperActor.value.trim() || undefined;
  const action = tamperAction.value.trim() || undefined;
  let payload = undefined;

  const rawPayload = tamperPayload.value.trim();
  if (rawPayload) {
    try {
      payload = JSON.parse(rawPayload);
    } catch (err) {
      showToast('Malicious payload must be a valid JSON string.', 'warning');
      return;
    }
  }

  if (!actor && !action && !payload) {
    showToast('Provide at least one field to tamper with.', 'warning');
    return;
  }

  tamperBtn.disabled = true;

  try {
    const res = await fetch('/dev/tamper', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ id: parseInt(id), actor, action, payload })
    });

    if (res.status === 403) {
      showToast('Simulation rejected: Server is running in production mode.', 'error');
      return;
    }

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Server rejected tamper payload.');
    }

    showToast(`Injected database corruption on Block #${id}!`, 'warning');
    
    // Clear simulator fields
    tamperActor.value = '';
    tamperAction.value = '';
    tamperPayload.value = '';
    
    // Reload logs from DB. Because hashes aren't updated, the hashes in DB are now invalid!
    await loadLogsChain();
  } catch (err) {
    showToast(`Simulation failed: ${err.message}`, 'error');
  } finally {
    tamperBtn.disabled = false;
  }
}

// Export Log Logs filtering terminal
async function handleExportLogs() {
  const actor = exportActor.value.trim();
  const start = exportStartDate.value;
  const end = exportEndDate.value;

  const params = new URLSearchParams();
  if (actor) params.append('actor', actor);
  if (start) params.append('startDate', start);
  if (end) params.append('endDate', end);

  terminalOutput.textContent = '// Querying GET /export...';
  
  try {
    const url = `/export?${params.toString()}`;
    const res = await fetch(url, { headers: getHeaders() });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || `Server status: ${res.status}`);
    }

    const data = await res.json();
    terminalOutput.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    terminalOutput.textContent = `// Export query failed:\n// ${err.message}`;
    showToast('Export failed. Check parameters.', 'error');
  }
}

// Copy Terminal Code Box Output
function copyTerminalOutput() {
  const text = terminalOutput.textContent;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Export output copied to clipboard!', 'info');
  }).catch(() => {
    showToast('Copy failed.', 'error');
  });
}

// Escape HTML entities to protect against XSS
function escapeHtml(string) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(string).replace(/[&<>"']/g, function(m) { return map[m]; });
}
