<script lang="ts">
  import { ArrowLeft, Upload, FileJson, FolderOpen } from 'lucide-svelte';
  import Button from '../components/Button.svelte';
  import Modal from '../components/Modal.svelte';
  import { LoadExternalVariables, ImportSelectedVariables, OpenFileDialog } from '../../wailsjs/go/main/App';
  
  import { createEventDispatcher, onMount } from 'svelte';
  const dispatch = createEventDispatcher();
  
  let selectedFile: string = '';
  let externalVariables: Record<string, any> = {};
  let selectedVars: Set<string> = new Set();
  let loadError = '';
  let importError = '';
  let isLoaded = false;
  let isDragging = false;
  let dropZoneElement: HTMLDivElement;
  
  // Duplicate confirmation modal
  let showDuplicateModal = false;
  let duplicatesList: string[] = [];
  let pendingImport: Record<string, any> = {};
  
  // Local edits to variable values before importing
  let editedValues: Record<string, { value: string; type: string; description: string }> = {};
  
  onMount(() => {
    // Set up drop zone event listeners  
    if (dropZoneElement) {
      dropZoneElement.addEventListener('drop', handleDrop);
    }
  });
  
  async function handleBrowseFile() {
    try {
      const filePath = await OpenFileDialog();
      if (filePath) {
        selectedFile = filePath;
        await handleFileSelect();
      }
    } catch (err: any) {
      loadError = err.toString();
    }
  }
  
  async function handleFileSelect() {
    loadError = '';
    
    if (!selectedFile) {
      loadError = 'Please enter a file path';
      return;
    }
    
    try {
      externalVariables = await LoadExternalVariables(selectedFile);
      isLoaded = true;
      
      // Initialize edited values with external values
      editedValues = {};
      for (const [key, variable] of Object.entries(externalVariables)) {
        editedValues[key] = {
          value: variable.value,
          type: variable.type,
          description: variable.description
        };
      }
    } catch (err: any) {
      loadError = err.toString();
      isLoaded = false;
    }
  }
  
  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    isDragging = true;
  }
  
  function handleDragLeave() {
    isDragging = false;
  }
  
  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    isDragging = false;
    
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.json')) {
        // Read file path - in Electron/Wails, we need a workaround
        // For now, ask user to use Browse button
        loadError = 'Drag & drop not fully supported yet. Please use the Browse button.';
      } else {
        loadError = 'Please drop a JSON file';
      }
    }
  }
  
  function toggleVariable(name: string) {
    if (selectedVars.has(name)) {
      selectedVars.delete(name);
    } else {
      selectedVars.add(name);
    }
    selectedVars = selectedVars; // Trigger reactivity
  }
  
  function selectAll() {
    selectedVars = new Set(Object.keys(externalVariables));
  }
  
  function deselectAll() {
    selectedVars.clear();
    selectedVars = selectedVars;
  }
  
  async function handleImport() {
    if (selectedVars.size === 0) {
      importError = 'Please select at least one variable to import';
      return;
    }
    
    try {
      importError = '';
      
      // Build the map of selected variables with edited values
      const varsToImport: Record<string, any> = {};
      for (const key of selectedVars) {
        varsToImport[key] = editedValues[key];
      }
      
      const summary = await ImportSelectedVariables(varsToImport);
      
      // Show custom modal for duplicates
      if (summary.Duplicates && summary.Duplicates.length > 0) {
        duplicatesList = summary.Duplicates;
        pendingImport = varsToImport;
        showDuplicateModal = true;
        return;
      }
      
      // No duplicates, complete import
      dispatch('imported');
    } catch (err: any) {
      importError = err.toString();
    }
  }
  
  function handleCancelDuplicates() {
    showDuplicateModal = false;
    duplicatesList = [];
    pendingImport = {};
  }
  
  function handleConfirmDuplicates() {
    showDuplicateModal = false;
    // Import was already completed, just close and refresh
    dispatch('imported');
  }
</script>

<div class="header">
  <Button variant="icon" title="Back" on:click={() => dispatch('cancel')}>
    <ArrowLeft size={20} />
  </Button>
  <h1>Import Variables</h1>
</div>

<div class="import-container">
  {#if !isLoaded}
    <!-- File Selection -->
    <div 
      bind:this={dropZoneElement}
      class="file-selector"
      class:dragging={isDragging}
      on:dragover={handleDragOver}
      on:dragleave={handleDragLeave}
      role="button"
      tabindex="0"
    >
      <div class="file-icon">
        <FileJson size={48} />
      </div>
      <h2>Select JSON File to Import</h2>
      <p class="description">Choose a vars.json file to load variables from</p>
      <p class="drag-hint">Drag & drop a JSON file here or browse</p>
      
      <div class="file-input-group">
        <input 
          type="text" 
          bind:value={selectedFile} 
          placeholder="File path will appear here..."
          class="file-path-input"
          readonly
        />
        <Button variant="secondary" on:click={handleBrowseFile}>
          <FolderOpen size={18} />
          Browse
        </Button>
        <Button variant="primary" on:click={handleFileSelect} disabled={!selectedFile}>
          <Upload size={18} />
          Load
        </Button>
      </div>
      
      {#if loadError}
        <div class="error-message">⚠ {loadError}</div>
      {/if}
    </div>
  {:else}
    <!-- Variable Selection -->
    <div class="selection-header">
      <div class="selection-info">
        <h2>{Object.keys(externalVariables).length} variables found</h2>
        <p>{selectedVars.size} selected for import</p>
      </div>
      <div class="selection-actions">
        <Button variant="secondary" on:click={selectAll}>Select All</Button>
        <Button variant="secondary" on:click={deselectAll}>Deselect All</Button>
      </div>
    </div>
    
    {#if importError}
      <div class="error-message">⚠ {importError}</div>
    {/if}
    
    <div class="variables-grid">
      {#each Object.entries(externalVariables) as [name, variable]}
        {@const isSelected = selectedVars.has(name)}
        <div class="import-card" class:selected={isSelected}>
          <div class="card-header">
            <label class="checkbox-label">
              <input 
                type="checkbox" 
                checked={isSelected}
                on:change={() => toggleVariable(name)}
              />
              <span class="var-name">{name}</span>
            </label>
            <span class="var-type-badge">{variable.type}</span>
          </div>
          
          {#if isSelected}
            <div class="editable-fields">
              <div class="field-group">
                <label>VALUE</label>
                <input 
                  type="text" 
                  bind:value={editedValues[name].value}
                  placeholder="Variable value"
                />
              </div>
              
              {#if variable.description || editedValues[name].description}
                <div class="field-group">
                  <label>DESCRIPTION</label>
                  <input 
                    type="text" 
                    bind:value={editedValues[name].description}
                    placeholder="Description (optional)"
                  />
                </div>
              {/if}
            </div>
          {:else}
            <div class="preview-value">
              <code>{variable.value}</code>
            </div>
          {/if}
        </div>
      {/each}
    </div>
    
    <div class="import-footer">
      <Button variant="secondary" on:click={() => { isLoaded = false; selectedVars.clear(); }}>
        Change File
      </Button>
      <Button variant="primary" on:click={handleImport} disabled={selectedVars.size === 0}>
        Import {selectedVars.size} Variable{selectedVars.size !== 1 ? 's' : ''}
      </Button>
    </div>
  {/if}
</div>

{#if showDuplicateModal}
  <Modal title="Duplicate Variables Detected" on:close={handleCancelDuplicates}>
    <p class="modal-description">
      <strong>{duplicatesList.length}</strong> variable{duplicatesList.length !== 1 ? 's' : ''} already exist{duplicatesList.length === 1 ? 's' : ''} and will be overwritten:
    </p>
    <div class="duplicates-list">
      {#each duplicatesList as dupName}
        <div class="duplicate-item">
          <div class="dup-name">{dupName}</div>
          <div class="dup-values">
            <div class="dup-value-row">
              <span class="value-label">New value:</span>
              <code class="value-display">{pendingImport[dupName].value}</code>
            </div>
          </div>
        </div>
      {/each}
    </div>
    <p class="warning-text">⚠ The existing values will be replaced with the imported ones.</p>
    <div class="modal-actions">
      <Button variant="secondary" on:click={handleCancelDuplicates}>Cancel</Button>
      <Button variant="primary" on:click={handleConfirmDuplicates}>Continue & Overwrite</Button>
    </div>
  </Modal>
{/if}

<style>
  .header {
    display: flex;
    align-items: center;
    gap: var(--spacing-lg);
    margin-bottom: var(--spacing-2xl);
  }
  
  h1 {
    font-size: var(--text-3xl);
    color: var(--text-primary);
    margin: 0;
    flex: 1;
    text-align: center;
    margin-right: 44px;
  }
  
  .import-container {
    max-width: 1000px;
    margin: 0 auto;
  }
  
  /* File Selection */
  .file-selector {
    text-align: center;
    padding: var(--spacing-3xl) var(--spacing-2xl);
    border: 2px dashed var(--bg-tertiary);
    border-radius: var(--radius-lg);
    transition: all 0.3s;
    cursor: pointer;
  }
  
  .file-selector:hover {
    border-color: var(--accent-blue);
    background: rgba(66, 135, 245, 0.05);
  }
  
  .file-selector.dragging {
    border-color: var(--accent-blue);
    background: rgba(66, 135, 245, 0.1);
    transform: scale(1.02);
  }
  
  .file-icon {
    color: var(--accent-blue);
    margin-bottom: var(--spacing-lg);
  }
  
  .file-selector h2 {
    font-size: var(--text-2xl);
    color: var(--text-primary);
    margin: 0 0 var(--spacing-sm) 0;
  }
  
  .file-selector .description {
    color: var(--text-muted);
    font-size: var(--text-md);
    margin: 0 0 var(--spacing-xs) 0;
  }
  
  .drag-hint {
    color: var(--accent-blue);
    font-size: var(--text-sm);
    margin: 0 0 var(--spacing-2xl) 0;
    font-weight: 500;
  }
  
  .file-input-group {
    display: flex;
    gap: var(--spacing-md);
    max-width: 700px;
    margin: 0 auto;
  }
  
  .file-path-input {
    flex: 1;
    background: var(--bg-secondary);
    border: 1px solid var(--bg-tertiary);
    border-radius: var(--radius-sm);
    padding: 12px 16px;
    color: var(--text-primary);
    font-size: var(--text-md);
    outline: none;
  }
  
  .file-path-input:focus {
    border-color: var(--accent-blue);
  }
  
  /* Selection Header */
  .selection-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--spacing-xl);
    padding-bottom: var(--spacing-lg);
    border-bottom: 1px solid var(--bg-tertiary);
  }
  
  .selection-info h2 {
    font-size: var(--text-xl);
    color: var(--text-primary);
    margin: 0 0 var(--spacing-xs) 0;
  }
  
  .selection-info p {
    font-size: var(--text-sm);
    color: var(--text-muted);
    margin: 0;
  }
  
  .selection-actions {
    display: flex;
    gap: var(--spacing-sm);
  }
  
  /* Variables Grid */
  .variables-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(450px, 1fr));
    gap: var(--spacing-lg);
    margin-bottom: var(--spacing-2xl);
  }
  
  .import-card {
    background: var(--bg-secondary);
    border: 2px solid var(--bg-tertiary);
    border-radius: var(--radius-md);
    padding: var(--spacing-lg);
    transition: all 0.2s;
  }
  
  .import-card.selected {
    border-color: var(--accent-blue);
    background: #2a2a35;
  }
  
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--spacing-md);
  }
  
  .checkbox-label {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    cursor: pointer;
    margin: 0;
    text-transform: none;
  }
  
  .checkbox-label input[type="checkbox"] {
    width: 20px;
    height: 20px;
    cursor: pointer;
    accent-color: var(--accent-blue);
  }
  
  .var-name {
    font-size: var(--text-lg);
    color: var(--text-primary);
    font-weight: 600;
  }
  
  .var-type-badge {
    font-size: var(--text-xs);
    color: var(--text-secondary);
    background: var(--bg-tertiary);
    padding: 4px 10px;
    border-radius: 4px;
    text-transform: uppercase;
    font-weight: 500;
    letter-spacing: 0.5px;
  }
  
  .preview-value {
    margin-top: var(--spacing-sm);
  }
  
  .preview-value code {
    background: #1e1e23;
    color: #e0e0ea;
    padding: 8px 12px;
    border-radius: 6px;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: var(--text-sm);
    border: 1px solid #2a2a2f;
    display: block;
    word-break: break-all;
  }
  
  .editable-fields {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    margin-top: var(--spacing-sm);
  }
  
  .field-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }
  
  .field-group label {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    text-transform: uppercase;
    font-weight: 500;
    letter-spacing: 0.5px;
    margin: 0;
  }
  
  .field-group input {
    background: #1e1e23;
    border: 1px solid #2a2a2f;
    border-radius: var(--radius-sm);
    padding: 8px 12px;
    color: var(--text-primary);
    font-size: var(--text-md);
    outline: none;
  }
  
  .field-group input:focus {
    border-color: var(--accent-blue);
  }
  
  /* Import Footer */
  .import-footer {
    display: flex;
    justify-content: space-between;
    gap: var(--spacing-lg);
    padding-top: var(--spacing-xl);
    border-top: 1px solid var(--bg-tertiary);
  }
  
  .import-footer :global(.btn) {
    padding: 14px 32px;
    font-size: var(--text-lg);
  }
  
  .error-message {
    margin-top: var(--spacing-lg);
  }
  
  /* Duplicate Modal Styles */
  .modal-description {
    color: var(--text-secondary);
    font-size: var(--text-md);
    margin: 0 0 var(--spacing-lg) 0;
  }
  
  .duplicates-list {
    background: var(--bg-secondary);
    border: 1px solid var(--bg-tertiary);
    border-radius: var(--radius-sm);
    padding: var(--spacing-sm);
    margin: 0 0 var(--spacing-lg) 0;
    max-height: 300px;
    overflow-y: auto;
  }
  
  .duplicate-item {
    background: #1e1e23;
    border: 1px solid #2a2a2f;
    border-radius: var(--radius-sm);
    padding: var(--spacing-md);
    margin-bottom: var(--spacing-sm);
  }
  
  .duplicate-item:last-child {
    margin-bottom: 0;
  }
  
  .dup-name {
    color: var(--text-primary);
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: var(--text-lg);
    font-weight: 600;
    margin-bottom: var(--spacing-sm);
  }
  
  .dup-values {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }
  
  .dup-value-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }
  
  .value-label {
    color: var(--text-tertiary);
    font-size: var(--text-xs);
    text-transform: uppercase;
    font-weight: 500;
    min-width: 80px;
  }
  
  .value-display {
    background: #16161a;
    color: #4ade80;
    padding: 4px 8px;
    border-radius: 4px;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: var(--text-sm);
    border: 1px solid #2a2a2f;
    flex: 1;
  }
  
  .warning-text {
    color: #ffa500;
    font-size: var(--text-sm);
    margin: 0;
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
  }
  
  .modal-actions {
    display: flex;
    gap: var(--spacing-md);
    justify-content: center;
    margin-top: var(--spacing-xl);
  }
  
  .modal-actions :global(.btn) {
    padding: 12px 28px;
    font-size: var(--text-md);
  }
</style>
